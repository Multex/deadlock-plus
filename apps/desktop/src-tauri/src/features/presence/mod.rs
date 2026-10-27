mod activity;
mod config_store;
mod hub;
mod live;

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use dp_discord_ipc::ClientKind;
use dp_game::start_time;
use dp_presence::{
    clamp_delay_secs, map_with, with_deadlock_plus_logo, with_support_button, Config, Delay, GameFacts, Presence,
    PresenceLevel, StateId, VariantId,
};
use dp_sync::LockExt;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::error::AppError;
use super::stop::StopSignal;
use super::toggle::{toggle, Toggle};
use hub::Hub;
use live::{convert, HeroArt, LiveSource, Lookups};

const APPLICATION_ID: &str = "1467944678002397328";
const POLL: Duration = Duration::from_secs(2);
/// How long app exit and a restarting worker wait for a worker to clear and disconnect. Discord I/O has no
/// timeout, so a stuck connection must not hold the app open.
const SHUTDOWN_GRACE: Duration = Duration::from_millis(1500);

#[derive(Serialize, Deserialize, Clone, Copy, Default, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum PresenceLevelSetting {
    #[default]
    Off,
    Basic,
    Detailed,
}

impl From<PresenceLevelSetting> for PresenceLevel {
    fn from(level: PresenceLevelSetting) -> Self {
        match level {
            PresenceLevelSetting::Off => Self::Off,
            PresenceLevelSetting::Basic => Self::Basic,
            PresenceLevelSetting::Detailed => Self::Detailed,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum DiscordClientKind {
    Stable,
    Ptb,
    Canary,
    Other,
}

impl From<DiscordClientKind> for ClientKind {
    fn from(kind: DiscordClientKind) -> Self {
        match kind {
            DiscordClientKind::Stable => Self::Stable,
            DiscordClientKind::Ptb => Self::Ptb,
            DiscordClientKind::Canary => Self::Canary,
            DiscordClientKind::Other => Self::Other,
        }
    }
}

impl From<ClientKind> for DiscordClientKind {
    fn from(kind: ClientKind) -> Self {
        match kind {
            ClientKind::Stable => Self::Stable,
            ClientKind::Ptb => Self::Ptb,
            ClientKind::Canary => Self::Canary,
            ClientKind::Other => Self::Other,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PresenceSettings {
    pub level: PresenceLevelSetting,
    pub clients: Vec<DiscordClientKind>,
    #[serde(default = "default_support_button")]
    pub support_button: bool,
    /// Absent until the user changes it, so the default can change for everyone who never did.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub deadlock_plus_logo: Option<bool>,
    /// Seconds to hold back what Discord shows. Absent while it is the default, like the logo choice.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub delay_secs: Option<u32>,
}

pub const DEFAULT_DEADLOCK_PLUS_LOGO: bool = false;
pub const DEFAULT_DELAY_SECS: u32 = 0;

fn default_support_button() -> bool {
    true
}

impl Default for PresenceSettings {
    fn default() -> Self {
        Self {
            level: PresenceLevelSetting::default(),
            clients: Vec::new(),
            support_button: true,
            deadlock_plus_logo: None,
            delay_secs: None,
        }
    }
}

impl PresenceSettings {
    fn selected(&self) -> HashSet<ClientKind> {
        self.clients.iter().map(|k| ClientKind::from(*k)).collect()
    }

    fn shows_deadlock_plus_logo(&self) -> bool {
        self.deadlock_plus_logo.unwrap_or(DEFAULT_DEADLOCK_PLUS_LOGO)
    }

    fn decorate(&self, presence: Presence) -> Presence {
        with_deadlock_plus_logo(with_support_button(presence, self.support_button), self.shows_deadlock_plus_logo())
    }

    fn delay_secs(&self) -> u32 {
        clamp_delay_secs(self.delay_secs.unwrap_or(DEFAULT_DELAY_SECS))
    }
}

/// What the worker shows Discord. Game state waits out the delay; the support button and logo are the user's own
/// choices, not game state, so they are added after it and change at once. A new level hides the activity at
/// once, so nothing queued under the old level is shown under the new one.
#[derive(Default)]
struct Held {
    delay: Delay,
    level: Option<PresenceLevelSetting>,
}

impl Held {
    fn show(&mut self, settings: &PresenceSettings, mapped: Option<Presence>, now_ms: u64) -> Option<Presence> {
        if self.level.replace(settings.level) != Some(settings.level) {
            self.delay.clear();
        }
        self.delay.set_secs(settings.delay_secs());
        self.delay.tick(mapped, now_ms).map(|p| settings.decorate(p))
    }
}

#[derive(Serialize, Clone, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PresenceClient {
    pub kind: DiscordClientKind,
    pub pipe_index: u8,
    pub connected: bool,
}

/// How far presence has got with Discord. Presence only connects while there is something to show, so a running
/// Discord that is not connected while the game is closed is `Waiting`, not missing.
#[derive(Serialize, Clone, Copy, Debug, Default, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum DiscordLink {
    #[default]
    NotFound,
    Waiting,
    Connecting,
    Connected,
}

impl DiscordLink {
    fn of(discord_found: bool, connected: bool, game_running: bool) -> Self {
        match (discord_found, connected, game_running) {
            (_, true, _) => Self::Connected,
            (false, false, _) => Self::NotFound,
            (true, false, true) => Self::Connecting,
            (true, false, false) => Self::Waiting,
        }
    }
}

#[derive(Serialize, Clone, Default, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PresenceStatus {
    pub running: bool,
    pub clients: Vec<PresenceClient>,
    pub link: DiscordLink,
}

#[derive(Serialize, Clone, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PresenceCard {
    pub details: Option<String>,
    pub state: Option<String>,
    pub large_text: Option<String>,
    pub small_text: Option<String>,
    pub large_image: Option<String>,
    pub small_image: Option<String>,
    pub elapsed_secs: Option<i64>,
    pub party: Option<(u32, u32)>,
}

/// The made-up player the editor preview is drawn for.
#[derive(Deserialize, Clone, Default, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PresenceSample {
    pub hero_name: Option<String>,
    pub hero_portrait: Option<String>,
    pub hero_icon: Option<String>,
    pub rank_name: Option<String>,
    pub hero_presence: Option<String>,
}

#[derive(Serialize, Clone, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PresencePlaceholder {
    pub name: String,
    pub sensitive: bool,
}

pub fn placeholders() -> Vec<PresencePlaceholder> {
    dp_presence::PLACEHOLDERS
        .iter()
        .map(|name| PresencePlaceholder { name: (*name).to_owned(), sensitive: dp_presence::is_sensitive(name) })
        .collect()
}

#[derive(Serialize, Clone, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PresenceStateInfo {
    pub id: StateId,
    pub variants: Vec<VariantId>,
    pub hero_scope: bool,
}

pub fn state_layout() -> Vec<PresenceStateInfo> {
    StateId::ALL
        .iter()
        .map(|id| PresenceStateInfo { id: *id, variants: id.variants().to_vec(), hero_scope: id.has_hero_scope() })
        .collect()
}

struct Worker {
    stop: Arc<StopSignal>,
    done: Arc<AtomicBool>,
}

#[derive(Default)]
struct Slots {
    active: Option<Worker>,
    retired: Option<Arc<AtomicBool>>,
}

#[derive(Default)]
pub struct PresenceService {
    settings: Arc<Mutex<PresenceSettings>>,
    connected: Arc<Mutex<Vec<u8>>>,
    lookups: Arc<Mutex<Lookups>>,
    config: Arc<Mutex<Config>>,
    snapshot: Mutex<dp_live::Slot<dp_live::Snapshot>>,
    config_path: Mutex<Option<PathBuf>>,
    slots: Mutex<Slots>,
}

struct DoneOnDrop(Arc<AtomicBool>);

impl Drop for DoneOnDrop {
    fn drop(&mut self) {
        self.0.store(true, Ordering::Release);
    }
}

fn wait_done(done: &AtomicBool, deadline: Instant) {
    while !done.load(Ordering::Acquire) && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
}

impl PresenceService {
    pub fn apply(&self, settings: PresenceSettings) {
        let enabled = settings.level != PresenceLevelSetting::Off;
        *self.settings.lock_or_recover() = settings;

        let mut slots = self.slots.lock_or_recover();
        match toggle(enabled, slots.active.is_some()) {
            Toggle::Keep => {}
            Toggle::Stop => {
                if let Some(worker) = slots.active.take() {
                    worker.stop.stop();
                    slots.retired = Some(worker.done);
                }
                log::info!("discord presence disabled");
            }
            Toggle::Start => {
                log::info!("discord presence enabled");
                let worker = Worker { stop: Arc::default(), done: Arc::default() };
                let (stop, done) = (worker.stop.clone(), worker.done.clone());
                let previous = slots.retired.take();
                slots.active = Some(worker);
                let settings = self.settings.clone();
                let connected = self.connected.clone();
                let lookups = self.lookups.clone();
                let config = self.config.clone();
                let snapshot = self.snapshot.lock_or_recover().clone();
                std::thread::Builder::new()
                    .name("presence".into())
                    .spawn(move || {
                        let _done = DoneOnDrop(done);
                        if let Some(previous) = previous {
                            wait_done(&previous, Instant::now() + SHUTDOWN_GRACE);
                        }
                        run(&stop, &settings, &connected, &lookups, &config, &snapshot);
                        connected.lock_or_recover().clear();
                    })
                    .expect("spawn thread");
            }
        }
    }

    pub fn init(&self, path: PathBuf) {
        *self.config.lock_or_recover() = config_store::load(&path);
        *self.config_path.lock_or_recover() = Some(path);
    }

    pub fn config(&self) -> Config {
        self.config.lock_or_recover().clone()
    }

    pub fn set_config(&self, config: Config) -> Result<(), AppError> {
        *self.config.lock_or_recover() = config.clone();
        let path = self.config_path.lock_or_recover().clone();
        match path {
            Some(path) => config_store::save(&path, &config)
                .map_err(|e| AppError::new(config_store::PresenceError::SaveFailed).detail(e)),
            None => Ok(()),
        }
    }

    pub fn set_lookups(&self, heroes: HashMap<u32, HeroArt>, ranks: HashMap<u32, String>) {
        *self.lookups.lock_or_recover() = Lookups { heroes, ranks };
    }

    pub fn status(&self) -> PresenceStatus {
        let connected = self.connected.lock_or_recover().clone();
        let selected = self.settings.lock_or_recover().selected();
        let pipes = dp_discord_ipc::discover();
        let discord_found = !dp_discord_ipc::select_targets(&selected, &pipes).is_empty();
        let clients: Vec<PresenceClient> = pipes
            .into_iter()
            .map(|p| PresenceClient {
                kind: p.effective_kind().into(),
                pipe_index: p.index,
                connected: connected.contains(&p.index),
            })
            .collect();
        let running = dp_game::is_running();
        let link = DiscordLink::of(discord_found, clients.iter().any(|c| c.connected), running);
        PresenceStatus { running, clients, link }
    }

    pub fn stop(&self) {
        let deadline = Instant::now() + SHUTDOWN_GRACE;
        let mut slots = self.slots.lock_or_recover();
        if let Some(worker) = slots.active.take() {
            worker.stop.stop();
            slots.retired = Some(worker.done);
        }
        if let Some(done) = slots.retired.take() {
            wait_done(&done, deadline);
        }
    }
}

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .and_then(|d| i64::try_from(d.as_secs()).ok())
        .unwrap_or(0)
}

fn run(
    stop: &StopSignal,
    settings: &Mutex<PresenceSettings>,
    connected: &Mutex<Vec<u8>>,
    lookups: &Mutex<Lookups>,
    config: &Mutex<Config>,
    snapshot: &dp_live::Slot<dp_live::Snapshot>,
) {
    let origin = Instant::now();
    let mut hub = Hub::new();
    let mut held = Held::default();
    let mut source: LiveSource<dp_live::FactsFeed> = LiveSource::new();
    while !stop.is_stopped() {
        let current = settings.lock_or_recover().clone();
        let started = start_time();
        let running = started.is_some();
        let detailed = current.level == PresenceLevelSetting::Detailed;
        let live = source
            .poll(detailed && running, || dp_live::FactsFeed::new(snapshot.clone()))
            .map(|l| convert(&l, &lookups.lock_or_recover()));
        let facts =
            GameFacts { running, started_at: started.and_then(|t| i64::try_from(t).ok()), now_secs: unix_now(), live };
        let now_ms = u64::try_from(origin.elapsed().as_millis()).unwrap_or(u64::MAX);
        let mapped = map_with(current.level.into(), &facts, &config.lock_or_recover());
        let desired = held.show(&current, mapped, now_ms);
        // A held-back activity outlives the game by the delay, so its clients stay connected until it clears.
        let targets = if facts.running || desired.is_some() {
            dp_discord_ipc::select_targets(&current.selected(), &dp_discord_ipc::discover())
        } else {
            Vec::new()
        };
        hub.tick(&targets, &desired, now_ms, |pipe| {
            dp_discord_ipc::connect(pipe, APPLICATION_ID)
                .inspect_err(|e| log::debug!("discord pipe {} unavailable: {e}", pipe.index))
                .ok()
        });
        *connected.lock_or_recover() = hub.connected();
        stop.wait(POLL);
    }
    hub.shutdown();
}

pub fn start(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(slot) = app.state::<super::live::link::GameLinkService>().slot() {
        *app.state::<PresenceService>().snapshot.lock_or_recover() = slot;
    }
    match app.path().app_data_dir() {
        Ok(dir) => app.state::<PresenceService>().init(dir.join(config_store::STORE_FILE)),
        Err(e) => log::warn!("no app data dir, presence config will not persist: {e}"),
    }
}

pub mod commands {
    use std::collections::HashMap;

    use dp_presence::{builtin_config, preview_with, Config, PreviewSample, StateId, VariantId, PREVIEW_NOW_SECS};
    use tauri::State;

    use super::{
        config_store, placeholders, state_layout, AppError, HeroArt, PresenceCard, PresencePlaceholder, PresenceSample,
        PresenceService, PresenceSettings, PresenceStateInfo, PresenceStatus,
    };

    #[tauri::command]
    pub fn presence_config(presence: State<'_, PresenceService>) -> Config {
        presence.config()
    }

    #[tauri::command]
    pub fn set_presence_config(config: Config, presence: State<'_, PresenceService>) -> Result<(), AppError> {
        presence.set_config(config)
    }

    #[tauri::command]
    pub fn presence_defaults() -> Config {
        builtin_config()
    }

    #[tauri::command]
    pub fn presence_layout() -> Vec<PresenceStateInfo> {
        state_layout()
    }

    #[tauri::command]
    pub fn presence_placeholders() -> Vec<PresencePlaceholder> {
        placeholders()
    }

    #[tauri::command]
    pub fn export_presence_config(presence: State<'_, PresenceService>) -> String {
        config_store::export(&presence.config())
    }

    #[tauri::command]
    pub fn import_presence_config(text: String, presence: State<'_, PresenceService>) -> Result<Config, AppError> {
        let config = config_store::import(&text)?;
        presence.set_config(config.clone())?;
        Ok(config)
    }

    #[tauri::command]
    pub fn presence_preview(
        config: Config,
        state: StateId,
        variant: Option<VariantId>,
        hero_id: Option<u32>,
        sample: Option<PresenceSample>,
    ) -> Option<PresenceCard> {
        let sample = sample.unwrap_or_default();
        let sample = PreviewSample {
            hero_name: sample.hero_name,
            hero_portrait: sample.hero_portrait,
            hero_icon: sample.hero_icon,
            rank_name: sample.rank_name,
            hero_presence: sample.hero_presence,
        };
        preview_with(&config, state, variant, hero_id, &sample).map(|p| PresenceCard {
            details: p.details,
            state: p.state,
            large_text: p.large_text,
            small_text: p.small_text,
            large_image: p.large_image,
            small_image: p.small_image,
            elapsed_secs: p.start_timestamp.map(|start| PREVIEW_NOW_SECS - start),
            party: p.party,
        })
    }

    #[tauri::command]
    pub fn set_presence_settings(settings: PresenceSettings, presence: State<'_, PresenceService>) {
        presence.apply(settings);
    }

    #[tauri::command]
    pub fn set_presence_art(
        heroes: HashMap<u32, HeroArt>,
        ranks: HashMap<u32, String>,
        presence: State<'_, PresenceService>,
    ) {
        presence.set_lookups(heroes, ranks);
    }

    #[tauri::command]
    pub fn presence_status(presence: State<'_, PresenceService>) -> PresenceStatus {
        presence.status()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn placeholder_list_covers_every_template_name_and_flags_the_match_id() {
        let list = placeholders();
        assert_eq!(list.len(), dp_presence::PLACEHOLDERS.len());
        assert!(list.iter().any(|p| p.name == "hero" && !p.sensitive));
        assert!(list.iter().any(|p| p.name == "matchId" && p.sensitive));
    }

    #[test]
    fn card_serializes_elapsed_and_image_flags() {
        let card = PresenceCard {
            details: None,
            state: None,
            large_text: None,
            small_text: None,
            large_image: Some("https://x/y.png".into()),
            small_image: None,
            elapsed_secs: Some(754),
            party: Some((3, 6)),
        };
        let json = serde_json::to_value(&card).unwrap();
        assert_eq!(json["elapsedSecs"], 754);
        assert_eq!(json["party"], serde_json::json!([3, 6]));
        assert_eq!(json["largeImage"], "https://x/y.png");
        assert_eq!(json["smallImage"], serde_json::Value::Null);
    }

    #[test]
    fn settings_use_camel_case_and_lowercase_names() {
        let s: PresenceSettings = serde_json::from_str(r#"{"level":"basic","clients":["stable","ptb"]}"#).unwrap();
        assert!(s.level == PresenceLevelSetting::Basic);
        assert!(s.clients == [DiscordClientKind::Stable, DiscordClientKind::Ptb]);
    }

    #[test]
    fn support_button_defaults_on_and_reads_camel_case() {
        let old: PresenceSettings = serde_json::from_str(r#"{"level":"basic","clients":[]}"#).unwrap();
        assert!(old.support_button);
        assert!(PresenceSettings::default().support_button);
        let off: PresenceSettings =
            serde_json::from_str(r#"{"level":"basic","clients":[],"supportButton":false}"#).unwrap();
        assert!(!off.support_button);
    }

    #[test]
    fn deadlock_plus_logo_is_off_and_unsaved_until_set() {
        let old: PresenceSettings = serde_json::from_str(r#"{"level":"basic","clients":[]}"#).unwrap();
        assert_eq!(old.deadlock_plus_logo, None);
        assert!(!old.shows_deadlock_plus_logo());
        assert!(!serde_json::to_string(&old).unwrap().contains("deadlockPlusLogo"));
        let on: PresenceSettings =
            serde_json::from_str(r#"{"level":"basic","clients":[],"deadlockPlusLogo":true}"#).unwrap();
        assert!(on.shows_deadlock_plus_logo());
        assert!(serde_json::to_string(&on).unwrap().contains(r#""deadlockPlusLogo":true"#));
    }

    #[test]
    fn decorate_adds_the_logo_only_when_chosen() {
        let basic =
            dp_presence::map(PresenceLevel::Basic, &GameFacts { running: true, ..GameFacts::default() }).unwrap();
        let mut settings = PresenceSettings { support_button: false, ..PresenceSettings::default() };
        assert_eq!(settings.decorate(basic.clone()).large_image, None);
        settings.deadlock_plus_logo = Some(true);
        let shown = settings.decorate(basic).large_image.unwrap();
        assert!(shown.ends_with("/icon-512.png"), "{shown}");
    }

    #[test]
    fn delay_is_zero_and_unsaved_until_set() {
        let old: PresenceSettings = serde_json::from_str(r#"{"level":"basic","clients":[]}"#).unwrap();
        assert_eq!(old.delay_secs, None);
        assert_eq!(old.delay_secs(), 0);
        assert!(!serde_json::to_string(&old).unwrap().contains("delaySecs"));
        let set: PresenceSettings = serde_json::from_str(r#"{"level":"basic","clients":[],"delaySecs":30}"#).unwrap();
        assert_eq!(set.delay_secs(), 30);
        assert!(serde_json::to_string(&set).unwrap().contains(r#""delaySecs":30"#));
    }

    #[test]
    fn delay_is_clamped_to_two_minutes() {
        let read: PresenceSettings = serde_json::from_str(r#"{"level":"basic","clients":[],"delaySecs":500}"#).unwrap();
        assert_eq!(read.delay_secs(), 120);
        let null: PresenceSettings =
            serde_json::from_str(r#"{"level":"basic","clients":[],"delaySecs":null}"#).unwrap();
        assert_eq!(null.delay_secs(), 0);
        let huge = PresenceSettings { delay_secs: Some(u32::MAX), ..PresenceSettings::default() };
        assert_eq!(huge.delay_secs(), 120);
    }

    fn on(level: PresenceLevelSetting, delay: u32) -> PresenceSettings {
        PresenceSettings { level, support_button: false, delay_secs: Some(delay), ..PresenceSettings::default() }
    }

    fn mapped(details: &str, start: i64) -> Option<Presence> {
        Some(Presence { details: Some(details.into()), start_timestamp: Some(start), ..Presence::default() })
    }

    #[test]
    fn held_passes_through_with_no_delay() {
        let mut held = Held::default();
        let settings = on(PresenceLevelSetting::Basic, 0);
        assert_eq!(held.show(&settings, mapped("a", 1_000), 0), mapped("a", 1_000));
        assert_eq!(held.show(&settings, None, 2_000), None);
    }

    #[test]
    fn held_shows_game_state_after_the_delay_with_its_timer_moved() {
        let mut held = Held::default();
        let settings = on(PresenceLevelSetting::Basic, 30);
        assert_eq!(held.show(&settings, mapped("a", 1_000), 0), None);
        assert_eq!(held.show(&settings, mapped("a", 1_000), 30_000), mapped("a", 1_030));
    }

    #[test]
    fn held_hides_at_once_on_a_level_change_and_drops_the_queue() {
        let mut held = Held::default();
        let basic = on(PresenceLevelSetting::Basic, 30);
        held.show(&basic, mapped("a", 0), 0);
        held.show(&basic, mapped("b", 0), 20_000);
        assert_eq!(held.show(&basic, mapped("b", 0), 30_000), mapped("a", 30));
        let detailed = on(PresenceLevelSetting::Detailed, 30);
        assert_eq!(held.show(&detailed, mapped("c", 0), 32_000), None);
        assert_eq!(held.show(&detailed, mapped("c", 0), 50_000), None);
        assert_eq!(held.show(&detailed, mapped("c", 0), 62_000), mapped("c", 30));
    }

    #[test]
    fn held_adds_the_support_button_and_logo_without_waiting() {
        let mut held = Held::default();
        let mut settings = on(PresenceLevelSetting::Basic, 30);
        held.show(&settings, mapped("a", 0), 0);
        assert!(held.show(&settings, mapped("a", 0), 30_000).unwrap().buttons.is_empty());
        settings.support_button = true;
        settings.deadlock_plus_logo = Some(true);
        let shown = held.show(&settings, mapped("a", 0), 32_000).unwrap();
        assert_eq!(shown.buttons.len(), 1);
        assert!(shown.large_image.is_some());
    }

    #[test]
    fn held_follows_a_lowered_delay_at_once() {
        let mut held = Held::default();
        held.show(&on(PresenceLevelSetting::Basic, 120), mapped("a", 0), 0);
        assert_eq!(held.show(&on(PresenceLevelSetting::Basic, 120), mapped("a", 0), 10_000), None);
        assert_eq!(held.show(&on(PresenceLevelSetting::Basic, 0), mapped("a", 0), 12_000), mapped("a", 0));
    }

    #[test]
    fn detailed_level_round_trips_and_maps() {
        let s: PresenceSettings = serde_json::from_str(r#"{"level":"detailed","clients":[]}"#).unwrap();
        assert!(s.level == PresenceLevelSetting::Detailed);
        assert_eq!(serde_json::to_string(&s.level).unwrap(), r#""detailed""#);
        assert_eq!(PresenceLevel::from(s.level), PresenceLevel::Detailed);
    }

    #[test]
    fn a_failed_config_save_answers_with_a_coded_error() {
        let dir = std::env::temp_dir().join(format!("dp-presence-save-fail-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(config_store::STORE_FILE);
        std::fs::write(&path, r#"{"schema_version":99,"data":{}}"#).unwrap();
        let svc = PresenceService::default();
        svc.init(path);
        let err = svc.set_config(Config::default()).unwrap_err();
        assert_eq!(err.code(), "presence.save_failed");
    }

    #[test]
    fn lookups_are_replaced_not_merged() {
        let svc = PresenceService::default();
        let hero = |name: &str| HeroArt { name: name.into(), ..HeroArt::default() };
        svc.set_lookups(HashMap::from([(1, hero("A"))]), HashMap::from([(1, "X".to_owned())]));
        svc.set_lookups(HashMap::from([(2, hero("B"))]), HashMap::new());
        let lookups = svc.lookups.lock_or_recover();
        assert_eq!(lookups.heroes, HashMap::from([(2, hero("B"))]));
        assert!(lookups.ranks.is_empty());
    }

    #[test]
    fn status_serializes_camel_case() {
        let s = PresenceStatus {
            running: true,
            clients: vec![PresenceClient { kind: DiscordClientKind::Canary, pipe_index: 1, connected: false }],
            link: DiscordLink::Connecting,
        };
        assert_eq!(
            serde_json::to_string(&s).unwrap(),
            r#"{"running":true,"clients":[{"kind":"canary","pipeIndex":1,"connected":false}],"link":"connecting"}"#
        );
    }

    #[test]
    fn running_discord_without_the_game_is_waiting_not_missing() {
        assert_eq!(DiscordLink::of(true, false, false), DiscordLink::Waiting);
    }

    #[test]
    fn discord_link_covers_every_case() {
        assert_eq!(DiscordLink::of(false, false, false), DiscordLink::NotFound);
        assert_eq!(DiscordLink::of(false, false, true), DiscordLink::NotFound);
        assert_eq!(DiscordLink::of(true, false, true), DiscordLink::Connecting);
        assert_eq!(DiscordLink::of(true, true, true), DiscordLink::Connected);
        // A delayed activity stays on Discord after the game closes.
        assert_eq!(DiscordLink::of(true, true, false), DiscordLink::Connected);
    }

    #[test]
    fn selected_maps_every_kind() {
        let s = PresenceSettings {
            level: PresenceLevelSetting::Basic,
            clients: vec![
                DiscordClientKind::Stable,
                DiscordClientKind::Ptb,
                DiscordClientKind::Canary,
                DiscordClientKind::Other,
            ],
            support_button: false,
            deadlock_plus_logo: None,
            delay_secs: None,
        };
        assert_eq!(s.selected(), ClientKind::all());
    }

    #[test]
    fn off_is_the_default_and_starts_no_worker() {
        let svc = PresenceService::default();
        svc.apply(PresenceSettings::default());
        svc.apply(PresenceSettings::default());
        assert!(svc.slots.lock_or_recover().active.is_none());
    }

    #[test]
    fn repeated_settings_keep_one_worker_and_off_retires_it() {
        let svc = PresenceService::default();
        let on = PresenceSettings {
            level: PresenceLevelSetting::Basic,
            clients: vec![DiscordClientKind::Stable],
            support_button: false,
            deadlock_plus_logo: None,
            delay_secs: None,
        };
        svc.apply(on.clone());
        let first = Arc::as_ptr(&svc.slots.lock_or_recover().active.as_ref().unwrap().stop);
        svc.apply(on);
        assert_eq!(first, Arc::as_ptr(&svc.slots.lock_or_recover().active.as_ref().unwrap().stop));
        svc.apply(PresenceSettings::default());
        assert!(svc.slots.lock_or_recover().active.is_none());
        svc.stop();
    }
}
