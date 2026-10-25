use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use ts_rs::TS;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

mod click;
mod native;
mod route;
mod topic;

use click::{launch_from_args, Launch};
use route::{targets, Inputs};
pub use route::{Placement, Route, Visibility};
pub use topic::{NotificationSettings, NotificationTopic};

use crate::features::game_focus::GameFocusService;
use crate::features::i18n::{translate_in, I18nState};
use crate::features::overlay;
use crate::features::tray::{self, badges};
use dp_game::focus::GameFocus;
use dp_sync::LockExt;
use dp_versioned::{self, Migration};

const STORE_FILE: &str = "notifications.json";
const MIGRATIONS: &[Migration] = &[];
const MAX_ITEMS: usize = 50;
const MAIN_WINDOW: &str = "main";
pub const CHANGED_EVENT: &str = "notifications-changed";
pub const OPEN_EVENT: &str = "notifications://open";
const OPEN_ACTION_KEY: &str = "notifications.open_action";

static NEXT_SEQ: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum NotificationKind {
    Alert,
    Maintenance,
    Servers,
    Session,
    Match,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AppNotification {
    pub id: String,
    pub kind: NotificationKind,
    /// Catalog base key; the text is `<key>.title` and `<key>.body` filled from `params`. Rendered at
    /// display time, so a language change never leaves stale text behind.
    #[serde(default)]
    pub key: Option<String>,
    #[serde(default)]
    pub params: BTreeMap<String, String>,
    /// Raw text for items stored before keys existed and for text that comes from a feed.
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    /// Unix seconds.
    pub timestamp: u64,
    pub read: bool,
    /// An in-app route to open on click, e.g. `/alerts`. `None` when there's nowhere to go.
    pub link: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Stored {
    items: Vec<AppNotification>,
}

fn insert(stored: &mut Stored, notif: AppNotification) {
    stored.items.insert(0, notif);
    stored.items.truncate(MAX_ITEMS);
}

fn unix_now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn load(path: &Path) -> Stored {
    match dp_versioned::read::<Stored>(path, MIGRATIONS) {
        Ok(Some(s)) => s,
        Ok(None) => Stored::default(),
        Err(e) => {
            log::warn!("could not read {STORE_FILE}, starting empty: {e}");
            Stored::default()
        }
    }
}

fn save(path: &Path, stored: &Stored) -> std::io::Result<()> {
    dp_versioned::write(path, MIGRATIONS, stored)
}

#[derive(Default)]
pub struct NotificationsState {
    stored: Mutex<Option<Stored>>,
    settings: Mutex<NotificationSettings>,
    /// A cold start from a toast or a `deadlock-plus://` link, until the page takes it.
    launch: Mutex<Option<Launch>>,
}

impl NotificationsState {
    fn path(app: &AppHandle) -> Option<PathBuf> {
        app.path().app_data_dir().ok().map(|d| d.join(STORE_FILE))
    }

    fn with_stored<R>(&self, app: &AppHandle, f: impl FnOnce(&mut Stored) -> R) -> R {
        let mut guard = self.stored.lock_or_recover();
        let stored = guard.get_or_insert_with(|| Self::path(app).map(|p| load(&p)).unwrap_or_default());
        f(stored)
    }

    fn persist(&self, app: &AppHandle) {
        if let Some(path) = Self::path(app) {
            let guard = self.stored.lock_or_recover();
            if let Some(stored) = guard.as_ref() {
                if let Err(e) = save(&path, stored) {
                    log::warn!("could not save {STORE_FILE}: {e}");
                }
            }
        }
    }

    pub fn unread_count(&self, app: &AppHandle) -> usize {
        self.with_stored(app, |s| s.items.iter().filter(|n| !n.read).count())
    }
}

fn build(
    kind: NotificationKind,
    key: &str,
    params: &[(&str, String)],
    link: Option<String>,
    timestamp: u64,
    seq: u64,
) -> AppNotification {
    AppNotification {
        id: format!("{kind:?}-{timestamp}-{seq}"),
        kind,
        key: Some(key.to_string()),
        params: params.iter().map(|(name, value)| ((*name).to_string(), value.clone())).collect(),
        title: None,
        body: None,
        timestamp,
        read: false,
        link,
    }
}

fn toast_text(locale: &str, notif: &AppNotification) -> (String, String) {
    let Some(key) = &notif.key else {
        return (notif.title.clone().unwrap_or_default(), notif.body.clone().unwrap_or_default());
    };
    let params: Vec<(&str, &str)> = notif.params.iter().map(|(n, v)| (n.as_str(), v.as_str())).collect();
    (translate_in(locale, &format!("{key}.title"), &params), translate_in(locale, &format!("{key}.body"), &params))
}

trait Sinks {
    fn center(&mut self, notif: AppNotification);
    fn native(&mut self, notif: &AppNotification);
    fn overlay(&mut self, notif: &AppNotification, placement: Placement);
}

fn deliver(route: Route, inputs: Inputs, notif: AppNotification, sinks: &mut impl Sinks) {
    let to = targets(route, inputs);
    if to.overlay {
        sinks.overlay(&notif, route.placement);
    }
    if to.native {
        sinks.native(&notif);
    }
    if to.center {
        sinks.center(notif);
    }
}

struct AppSinks<'a> {
    app: &'a AppHandle,
}

impl Sinks for AppSinks<'_> {
    fn center(&mut self, notif: AppNotification) {
        let state = self.app.state::<NotificationsState>();
        state.with_stored(self.app, |s| insert(s, notif));
        state.persist(self.app);
        if let Err(e) = self.app.emit(CHANGED_EVENT, ()) {
            log::warn!("could not emit {CHANGED_EVENT}: {e}");
        }
        badges::refresh(self.app);
    }

    fn native(&mut self, notif: &AppNotification) {
        let locale = self.app.state::<I18nState>().locale();
        let (title, body) = toast_text(&locale, notif);
        let toast = native::Toast {
            id: notif.id.clone(),
            title,
            body,
            route: click::click_target(notif),
            action_label: translate_in(&locale, OPEN_ACTION_KEY, &[]),
        };
        native::show(self.app, toast);
    }

    fn overlay(&mut self, notif: &AppNotification, placement: Placement) {
        let text = toast_text(&self.app.state::<I18nState>().locale(), notif);
        overlay::show_toast(self.app, notif.id.clone(), notif.kind, text, placement);
    }
}

/// Sent to the main window when the user clicks an OS toast; the page navigates from `kind` and `link` the same
/// way a click in the notification center does.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationOpen {
    pub id: String,
    pub kind: NotificationKind,
    pub link: Option<String>,
}

trait Opener {
    fn show_main(&mut self);
    /// Marks the item read and returns it; `None` once it has left the stored list.
    fn mark_read(&mut self, id: &str) -> Option<AppNotification>;
    fn emit_open(&mut self, payload: NotificationOpen);
}

fn open_with(id: &str, opener: &mut impl Opener) {
    opener.show_main();
    match opener.mark_read(id) {
        Some(item) => opener.emit_open(NotificationOpen { id: item.id, kind: item.kind, link: item.link }),
        None => log::debug!("clicked notification {id} is no longer stored"),
    }
}

struct AppOpener<'a> {
    app: &'a AppHandle,
}

impl Opener for AppOpener<'_> {
    fn show_main(&mut self) {
        tray::show_main(self.app);
    }

    fn mark_read(&mut self, id: &str) -> Option<AppNotification> {
        mark_read(self.app, &self.app.state::<NotificationsState>(), id)
    }

    fn emit_open(&mut self, payload: NotificationOpen) {
        if let Err(e) = self.app.emit_to(MAIN_WINDOW, OPEN_EVENT, payload) {
            log::warn!("could not emit {OPEN_EVENT}: {e}");
        }
    }
}

/// A click on an OS toast: bring Deadlock+ forward, mark the item read and let the page open its target.
pub fn open(app: &AppHandle, id: &str) {
    open_with(id, &mut AppOpener { app });
}

/// The second instance's arguments, forwarded by the single-instance plugin: a toast click after the app was
/// started by other means, or a `deadlock-plus://` link.
pub fn open_from_args<S: AsRef<str>>(app: &AppHandle, args: &[S]) {
    match launch_from_args(args) {
        Some(launch) => open(app, &launch.id),
        None => tray::show_main(app),
    }
}

/// Called once in setup with the process arguments.
pub fn remember_launch(app: &AppHandle, args: impl IntoIterator<Item = String>) {
    *app.state::<NotificationsState>().launch.lock_or_recover() = launch_from_args(args);
}

/// One-shot: the route of the notification the app was started from, once its id is known to be a stored item.
/// Anything else opens the window on its usual page.
fn take_route(slot: &Mutex<Option<Launch>>, mark_read: impl FnOnce(&str) -> bool) -> Option<&'static str> {
    let launch = slot.lock_or_recover().take()?;
    mark_read(&launch.id).then_some(launch.route)
}

fn mark_read(app: &AppHandle, state: &NotificationsState, id: &str) -> Option<AppNotification> {
    let (item, changed) = state.with_stored(app, |s| {
        let n = s.items.iter_mut().find(|n| n.id == id)?;
        let changed = !n.read;
        n.read = true;
        Some((n.clone(), changed))
    })?;
    if changed {
        state.persist(app);
        if let Err(e) = app.emit(CHANGED_EVENT, ()) {
            log::warn!("could not emit {CHANGED_EVENT}: {e}");
        }
        badges::refresh(app);
    }
    Some(item)
}

fn inputs(app: &AppHandle) -> Inputs {
    let focus = app.state::<GameFocusService>().state();
    Inputs {
        game_running: dp_game::is_running(),
        game_focused: focus.focus == GameFocus::Focused,
        main_focused: app.get_webview_window(MAIN_WINDOW).and_then(|w| w.is_focused().ok()).unwrap_or(false),
        overlay_available: overlay::available(app, &focus),
    }
}

/// `None` when the user switched the topic off.
fn route(settings: &NotificationSettings, topic: NotificationTopic) -> Option<Route> {
    settings.allows(topic).then(|| Route::new(Visibility::Always, settings.delivery(topic), topic.placement()))
}

/// The single place a notification gets sent from: `alerts`, `maintenance`, the server block sync, the break
/// reminder and match found call this instead of the notification plugin directly. The user's settings pick the
/// topic's delivery or drop it; the route then decides, at this moment, whether it lands in the notification
/// center (and so the tray/taskbar badge) and which toast fires. Toast text is rendered here in the current
/// language; the center renders from `key` and `params` when it is shown.
pub fn push(app: &AppHandle, topic: NotificationTopic, key: &str, params: &[(&str, String)], link: Option<String>) {
    let settings = app.state::<NotificationsState>().settings.lock_or_recover().clone();
    let Some(route) = route(&settings, topic) else {
        return;
    };
    let seq = NEXT_SEQ.fetch_add(1, Ordering::Relaxed);
    let notif = build(topic.kind(), key, params, link, unix_now(), seq);
    deliver(route, inputs(app), notif, &mut AppSinks { app });
}

pub mod commands {
    use super::*;

    #[tauri::command]
    pub fn list_notifications(app: AppHandle, state: tauri::State<'_, NotificationsState>) -> Vec<AppNotification> {
        state.with_stored(&app, |s| s.items.clone())
    }

    #[tauri::command]
    pub fn set_notification_settings(settings: NotificationSettings, state: tauri::State<'_, NotificationsState>) {
        *state.settings.lock_or_recover() = settings;
    }

    #[tauri::command]
    pub fn notify_break_reminder(app: AppHandle, loss_streak: u32) {
        push(
            &app,
            NotificationTopic::BreakReminder,
            "notifications.break_reminder",
            &[("count", loss_streak.to_string())],
            Some("/match-history".into()),
        );
    }

    /// The frontend asks for this only while an after-match front page waits for the window, once per match.
    #[tauri::command]
    pub fn notify_front_page_waiting(app: AppHandle) {
        push(&app, NotificationTopic::FrontPageWaiting, "notifications.front_page_waiting", &[], None);
    }

    #[tauri::command]
    pub fn mark_notifications_read(app: AppHandle, state: tauri::State<'_, NotificationsState>) {
        let changed = state.with_stored(&app, |s| {
            let unread = s.items.iter().any(|n| !n.read);
            s.items.iter_mut().for_each(|n| n.read = true);
            unread
        });
        if changed {
            state.persist(&app);
            if let Err(e) = app.emit(CHANGED_EVENT, ()) {
                log::warn!("could not emit {CHANGED_EVENT}: {e}");
            }
            badges::refresh(&app);
        }
    }

    #[tauri::command]
    pub fn take_launch_route(app: AppHandle, state: tauri::State<'_, NotificationsState>) -> Option<String> {
        take_route(&state.launch, |id| mark_read(&app, &state, id).is_some()).map(String::from)
    }

    #[tauri::command]
    pub fn mark_notification_read(id: String, app: AppHandle, state: tauri::State<'_, NotificationsState>) {
        mark_read(&app, &state, &id);
    }
}

#[cfg(test)]
mod tests {
    use super::route::Delivery;
    use super::*;
    use std::fs;

    fn notif(id: &str) -> AppNotification {
        AppNotification {
            id: id.into(),
            kind: NotificationKind::Alert,
            key: None,
            params: BTreeMap::new(),
            title: Some(format!("title {id}")),
            body: Some("body".into()),
            timestamp: 0,
            read: false,
            link: None,
        }
    }

    #[test]
    fn items_stored_with_rendered_text_still_load() {
        let json = r#"{"id":"a","kind":"alert","title":"Old","body":"Old body","timestamp":5,"read":true,"link":null}"#;
        let n: AppNotification = serde_json::from_str(json).unwrap();
        assert_eq!((n.key, n.title.as_deref(), n.body.as_deref()), (None, Some("Old"), Some("Old body")));
        assert!(n.params.is_empty());
    }

    #[test]
    fn keyed_items_store_no_rendered_text() {
        let n = build(
            NotificationKind::Maintenance,
            "notifications.maintenance_soon",
            &[("minutes", "30".to_string())],
            None,
            7,
            0,
        );
        assert_eq!(n.key.as_deref(), Some("notifications.maintenance_soon"));
        assert_eq!(n.params.get("minutes").map(String::as_str), Some("30"));
        assert!(n.title.is_none() && n.body.is_none());
    }

    #[test]
    fn break_reminder_carries_the_count_and_links_to_match_history() {
        let n = build(
            NotificationKind::Session,
            "notifications.break_reminder",
            &[("count", 3.to_string())],
            Some("/match-history".into()),
            7,
            0,
        );
        assert_eq!(n.kind, NotificationKind::Session);
        assert_eq!(n.params.get("count").map(String::as_str), Some("3"));
        assert_eq!(n.link.as_deref(), Some("/match-history"));
        assert_eq!(serde_json::to_string(&n.kind).unwrap(), "\"session\"");
    }

    #[test]
    fn toast_text_renders_the_key_in_the_given_locale() {
        let n = build(
            NotificationKind::Maintenance,
            "notifications.maintenance_soon",
            &[("minutes", "30".to_string())],
            None,
            7,
            0,
        );
        let (title, body) = toast_text("en", &n);
        assert_eq!(title, "Steam maintenance soon");
        assert!(body.contains("in about 30 min"), "{body}");
    }

    #[test]
    fn toast_text_falls_back_to_the_raw_text() {
        assert_eq!(toast_text("en", &notif("a")), ("title a".to_string(), "body".to_string()));
    }

    #[test]
    fn every_pushed_key_is_catalogued() {
        for key in [
            "notifications.alert_new",
            "notifications.alert_new_more",
            "notifications.maintenance_soon",
            "notifications.server_blocks_updated",
            "notifications.server_blocks_stale",
            "notifications.break_reminder",
        ] {
            for part in ["title", "body"] {
                let full = format!("{key}.{part}");
                assert_ne!(crate::features::i18n::translate_in("en", &full, &[]), full, "{full} missing");
            }
        }
        assert_ne!(translate_in("en", OPEN_ACTION_KEY, &[]), OPEN_ACTION_KEY, "{OPEN_ACTION_KEY} missing");
    }

    #[derive(Default)]
    struct Recorder {
        center: Vec<String>,
        native: Vec<String>,
        overlay: Vec<(String, Placement)>,
    }

    impl Sinks for Recorder {
        fn center(&mut self, notif: AppNotification) {
            self.center.push(notif.id);
        }
        fn native(&mut self, notif: &AppNotification) {
            self.native.push(notif.id.clone());
        }
        fn overlay(&mut self, notif: &AppNotification, placement: Placement) {
            self.overlay.push((notif.id.clone(), placement));
        }
    }

    #[derive(Default)]
    struct OpenRecorder {
        stored: Vec<AppNotification>,
        calls: Vec<String>,
        emitted: Vec<NotificationOpen>,
    }

    impl Opener for OpenRecorder {
        fn show_main(&mut self) {
            self.calls.push("show".into());
        }
        fn mark_read(&mut self, id: &str) -> Option<AppNotification> {
            self.calls.push(format!("read {id}"));
            let item = self.stored.iter_mut().find(|n| n.id == id)?;
            item.read = true;
            Some(item.clone())
        }
        fn emit_open(&mut self, payload: NotificationOpen) {
            self.calls.push("emit".into());
            self.emitted.push(payload);
        }
    }

    #[test]
    fn opening_a_toast_shows_the_window_marks_it_read_then_tells_the_page() {
        let mut opener = OpenRecorder {
            stored: vec![AppNotification {
                kind: NotificationKind::Servers,
                link: Some("/server-picker".into()),
                ..notif("a")
            }],
            ..Default::default()
        };
        open_with("a", &mut opener);
        assert_eq!(opener.calls, ["show", "read a", "emit"]);
        assert!(opener.stored[0].read);
        assert_eq!(
            opener.emitted,
            [NotificationOpen { id: "a".into(), kind: NotificationKind::Servers, link: Some("/server-picker".into()) }]
        );
    }

    #[test]
    fn opening_a_toast_whose_item_is_gone_only_shows_the_window() {
        let mut opener = OpenRecorder::default();
        open_with("gone", &mut opener);
        assert_eq!(opener.calls, ["show", "read gone"]);
        assert!(opener.emitted.is_empty());
    }

    fn launch(route: &'static str, id: &str) -> Mutex<Option<Launch>> {
        Mutex::new(Some(Launch { route, id: id.into() }))
    }

    #[test]
    fn the_launch_route_is_taken_once_and_marks_its_item_read() {
        let slot = launch("/alerts", "a");
        let mut read = Vec::new();
        assert_eq!(
            take_route(&slot, |id| {
                read.push(id.to_string());
                true
            }),
            Some("/alerts")
        );
        assert_eq!(read, ["a"]);
        assert_eq!(take_route(&slot, |_| true), None);
    }

    #[test]
    fn a_launch_for_an_unknown_item_opens_no_page() {
        let slot = launch("/alerts", "gone");
        assert_eq!(take_route(&slot, |_| false), None);
        assert!(slot.lock().unwrap().is_none());
    }

    #[test]
    fn no_launch_means_no_route() {
        assert_eq!(take_route(&Mutex::new(None), |_| panic!("nothing to mark")), None);
    }

    #[test]
    fn the_open_payload_is_camel_case_with_a_nullable_link() {
        let payload = NotificationOpen { id: "m".into(), kind: NotificationKind::Maintenance, link: None };
        assert_eq!(serde_json::to_string(&payload).unwrap(), r#"{"id":"m","kind":"maintenance","link":null}"#);
    }

    const IN_GAME: Inputs =
        Inputs { game_running: true, game_focused: true, main_focused: false, overlay_available: true };

    #[test]
    fn overlay_delivery_writes_no_center_entry() {
        let mut sinks = Recorder::default();
        deliver(Route::new(Visibility::Always, Delivery::Overlay, Placement::Center), IN_GAME, notif("a"), &mut sinks);
        assert_eq!(sinks.overlay, [("a".to_string(), Placement::Center)]);
        assert!(sinks.center.is_empty() && sinks.native.is_empty());
    }

    #[test]
    fn both_delivery_outside_the_game_writes_a_center_entry_and_a_native_toast() {
        let mut sinks = Recorder::default();
        deliver(
            Route::new(Visibility::Always, Delivery::Both, Placement::Corner),
            Inputs::default(),
            notif("a"),
            &mut sinks,
        );
        assert_eq!((sinks.center, sinks.native), (vec!["a".to_string()], vec!["a".to_string()]));
        assert!(sinks.overlay.is_empty());
    }

    #[test]
    fn a_topic_routes_by_the_chosen_delivery_at_its_own_placement() {
        let chosen = NotificationSettings {
            deliveries: BTreeMap::from([
                (NotificationTopic::BreakReminder, Delivery::Center),
                (NotificationTopic::MatchFound, Delivery::Os),
            ]),
            ..Default::default()
        };
        assert_eq!(
            route(&chosen, NotificationTopic::BreakReminder),
            Some(Route::new(Visibility::Always, Delivery::Center, Placement::Corner))
        );
        assert_eq!(
            route(&chosen, NotificationTopic::MatchFound),
            Some(Route::new(Visibility::Always, Delivery::Overlay, Placement::Center))
        );
        assert_eq!(
            route(&NotificationSettings::default(), NotificationTopic::ServerBlocksUpdated),
            Some(Route::new(Visibility::Always, Delivery::Quiet, Placement::Corner))
        );
    }

    #[test]
    fn a_switched_off_topic_has_no_route() {
        let off = NotificationSettings { server_blocks_stale: false, ..Default::default() };
        assert_eq!(route(&off, NotificationTopic::ServerBlocksStale), None);
    }

    #[test]
    fn insert_adds_to_the_front() {
        let mut s = Stored::default();
        insert(&mut s, notif("a"));
        insert(&mut s, notif("b"));
        assert_eq!(s.items.iter().map(|n| n.id.as_str()).collect::<Vec<_>>(), ["b", "a"]);
    }

    #[test]
    fn insert_caps_the_list() {
        let mut s = Stored::default();
        for i in 0..MAX_ITEMS + 5 {
            insert(&mut s, notif(&format!("id{i}")));
        }
        assert_eq!(s.items.len(), MAX_ITEMS);
    }

    #[test]
    fn unread_count_ignores_read_items() {
        let mut s = Stored::default();
        insert(&mut s, notif("a"));
        insert(&mut s, AppNotification { read: true, ..notif("b") });
        assert_eq!(s.items.iter().filter(|n| !n.read).count(), 1);
    }

    #[test]
    fn state_round_trips_through_disk_and_tolerates_corruption() {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-test-{}-notifications", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let path = dir.join(STORE_FILE);

        assert!(load(&path).items.is_empty());

        let mut s = Stored::default();
        insert(&mut s, notif("a"));
        save(&path, &s).unwrap();
        let back = load(&path);
        assert_eq!(back.items.iter().map(|n| n.id.as_str()).collect::<Vec<_>>(), ["a"]);

        fs::write(&path, "not json").unwrap();
        assert!(load(&path).items.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }
}
