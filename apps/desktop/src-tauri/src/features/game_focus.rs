use std::sync::Mutex;

use dp_game::focus::FocusWatcher;
use dp_sync::LockExt;

#[derive(Default)]
pub struct GameFocusService {
    watcher: Mutex<Option<FocusWatcher>>,
}

impl GameFocusService {
    /// Idempotent. Runs for the app's lifetime; it only reads windows while the game is running.
    pub fn start(&self) {
        let mut watcher = self.watcher.lock_or_recover();
        if watcher.is_some() {
            return;
        }
        match FocusWatcher::start(|state| log::debug!("game focus: {state:?}")) {
            Ok(started) => *watcher = Some(started),
            Err(e) => log::warn!("game focus watcher could not start: {e}"),
        }
    }

    pub fn stop(&self) {
        if let Some(watcher) = self.watcher.lock_or_recover().take() {
            watcher.stop();
        }
    }
}
