pub mod commands;

use std::sync::Mutex;

use dp_kv::KvStore;
use dp_postgame::{for_account, orphaned, reconcile, StoredMatch};
use dp_postgame::{plan, upsert, Plan, PostGameMatch};
use dp_storage::postgame::{self as storage, POSTGAME_DIR};
use dp_sync::LockExt;
use tauri::{AppHandle, Emitter, Manager};

use super::live::link::GameLinkService;
use super::toggle::{toggle, Toggle};

const STORE: &str = "postgame-matches";
const KEY: &str = "matches";
const EVENT: &str = "postgame-match";
const MAX_AGE_SECS: u64 = 72 * 60 * 60;
const EXIT_WAIT: std::time::Duration = std::time::Duration::from_secs(3);
const POLL: std::time::Duration = std::time::Duration::from_secs(5);

#[derive(Default)]
struct WatcherSlot {
    running: Option<dp_postgame::Worker>,
    /// A stopped watcher whose thread may still be exiting. The next start waits on it.
    winding_down: Option<dp_postgame::Done>,
}

#[derive(Default)]
pub struct PostgameService {
    watcher: Mutex<WatcherSlot>,
    /// Serialises load-modify-save between the capture thread and the commands.
    io: Mutex<()>,
}

impl PostgameService {
    /// Idempotent: a watcher that is already running is left alone.
    pub fn start(&self, app: &AppHandle) {
        let mut slot = self.watcher.lock_or_recover();
        if toggle(true, slot.running.is_some()) != Toggle::Start {
            return;
        }
        let handle = app.clone();
        let after = slot.winding_down.take().filter(|done| !done.is_done());
        match dp_postgame::Worker::spawn("postgame-watch", after, move |stop| watch(&handle, stop)) {
            Ok(watcher) => {
                slot.running = Some(watcher);
                log::info!("post-game capture started");
            }
            Err(e) => log::warn!("post-game capture could not start: {e}"),
        }
    }

    pub fn stop(&self) {
        let done = {
            let mut slot = self.watcher.lock_or_recover();
            match slot.running.take() {
                Some(watcher) => Some(watcher.stop()),
                None => slot.winding_down.take(),
            }
        };
        if let Some(done) = done {
            done.wait(EXIT_WAIT);
        }
    }

    pub fn matches(&self, app: &AppHandle, account_id: u32) -> Vec<StoredMatch> {
        let _io = self.io.lock_or_recover();
        for_account(&load(app), account_id)
    }

    pub fn reconcile(&self, app: &AppHandle, account_id: u32, api_ids: &[u64]) -> usize {
        let _io = self.io.lock_or_recover();
        let mut matches = load(app);
        let dropped = reconcile(&mut matches, account_id, api_ids, now_secs(), MAX_AGE_SECS);
        if dropped.is_empty() {
            return 0;
        }
        save(app, &matches);
        if let Some(dir) = detail_dir(app) {
            for match_id in orphaned(&dropped, &matches) {
                if let Err(e) = storage::remove(&dir, match_id) {
                    log::warn!("could not remove post-game detail {match_id}: {e}");
                }
            }
        }
        dropped.len()
    }

    /// The full message of one of `account_id`'s provisional matches, as API-shaped JSON.
    pub fn detail(&self, app: &AppHandle, account_id: u32, match_id: u64) -> Option<serde_json::Value> {
        let _io = self.io.lock_or_recover();
        if !load(app).iter().any(|m| m.account_id == account_id && m.game.match_id == match_id) {
            return None;
        }
        let bytes = match storage::read(&detail_dir(app)?, match_id) {
            Ok(bytes) => bytes?,
            Err(e) => {
                log::warn!("could not read post-game detail {match_id}: {e}");
                return None;
            }
        };
        serde_json::from_slice(&bytes).ok()
    }

    fn record(&self, app: &AppHandle, account_id: u32, game: PostGameMatch, detail: serde_json::Value) {
        let stored = {
            let _io = self.io.lock_or_recover();
            if let Some(dir) = detail_dir(app) {
                let written = serde_json::to_vec(&detail).map_err(std::io::Error::other);
                if let Err(e) = written.and_then(|bytes| storage::write(&dir, game.match_id, &bytes)) {
                    log::warn!("could not save post-game detail {}: {e}", game.match_id);
                }
            }
            let mut matches = load(app);
            let stored = upsert(&mut matches, account_id, game, now_secs());
            save(app, &matches);
            stored
        };
        log::info!("post-game match {} captured", stored.game.match_id);
        app.state::<crate::features::network::recording::MatchPingService>().bind_match_id(stored.game.match_id);
        app.state::<crate::features::salts::memory::MemorySaltsService>().notify();
        if let Err(e) = app.emit(EVENT, &stored) {
            log::warn!("could not emit {EVENT}: {e}");
        }
    }
}

fn watch(app: &AppHandle, stop: &dp_postgame::Stop) {
    let mut running: Option<(u32, dp_postgame::Capture)> = None;
    while !stop.is_stopped() {
        match plan(running.as_ref().map(|(id, _)| *id), dp_steam::current_steam_id32()) {
            Plan::Keep => {}
            Plan::Wait => log::debug!("post-game capture waiting for a signed-in Steam account"),
            Plan::Start(id) | Plan::Restart(id) => {
                let after = running.take().map(|(_, capture)| capture.stop());
                let handle = app.clone();
                let link = app.state::<GameLinkService>().handle();
                match dp_postgame::Capture::start(
                    id,
                    after,
                    move || link.as_ref().and_then(|link| link.reader()),
                    move |game, detail| handle.state::<PostgameService>().record(&handle, id, game, detail),
                ) {
                    Ok(capture) => {
                        log::info!("post-game capture following account {id}");
                        running = Some((id, capture));
                    }
                    Err(e) => log::warn!("post-game capture could not start: {e}"),
                }
            }
        }
        stop.sleep(POLL);
    }
    if let Some((_, capture)) = running {
        capture.stop().wait(EXIT_WAIT);
    }
}

fn now_secs() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

fn detail_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join(POSTGAME_DIR))
}

fn load(app: &AppHandle) -> Vec<StoredMatch> {
    let Ok(dir) = app.path().app_data_dir() else { return Vec::new() };
    let value = app.state::<KvStore>().get(&dir, STORE, KEY).ok().flatten();
    value.and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default()
}

fn save(app: &AppHandle, matches: &[StoredMatch]) {
    let Ok(dir) = app.path().app_data_dir() else { return };
    let Ok(value) = serde_json::to_value(matches) else { return };
    if let Err(e) = app.state::<KvStore>().set(&dir, STORE, KEY, value) {
        log::warn!("could not save post-game matches: {e}");
    }
}
