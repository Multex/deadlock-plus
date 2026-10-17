use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use super::{Coalescer, GameFlag, GameWatcher, JobsSnapshot, Policy, Registry, Sleeper};
use dp_kv::KvStore;

const EVENT: &str = "jobs://changed";
const EVENT_INTERVAL: Duration = Duration::from_millis(250);
const GAME_POLL: Duration = Duration::from_secs(3);

pub const STORE: &str = "background-jobs";
const POLICIES_KEY: &str = "policies";
const DISABLED_KEY: &str = "disabled";
const ALL_ENABLED_KEY: &str = "allEnabled";
/// A retired app-wide switch. Off let every `PauseInGame` job keep running in game.
const PAUSE_KEY: &str = "pauseInGame";

pub struct JobsState {
    pub registry: Arc<Registry>,
    events: OnceLock<Arc<Coalescer>>,
    watcher: OnceLock<GameWatcher>,
}

impl Default for JobsState {
    fn default() -> Self {
        let sleeper: Sleeper = Arc::new(std::thread::sleep);
        Self {
            registry: Registry::new(GameFlag::new(false), sleeper),
            events: OnceLock::new(),
            watcher: OnceLock::new(),
        }
    }
}

impl JobsState {
    fn notify(&self) {
        if let Some(events) = self.events.get() {
            events.notify();
        }
    }

    fn persist(&self, app: &AppHandle) {
        let Ok(dir) = app.path().app_data_dir() else { return };
        save(&app.state::<KvStore>(), &dir, &self.registry);
    }
}

fn save(kv: &KvStore, dir: &Path, registry: &Registry) {
    let policies = serde_json::to_value(registry.policy_overrides()).unwrap_or_default();
    let mut disabled: Vec<String> = registry.disabled_jobs().into_iter().collect();
    disabled.sort();
    let saved = kv
        .set(dir, STORE, POLICIES_KEY, policies)
        .and_then(|()| kv.set(dir, STORE, DISABLED_KEY, disabled.into()))
        .and_then(|()| kv.set(dir, STORE, ALL_ENABLED_KEY, registry.all_enabled().into()));
    if let Err(e) = saved {
        log::warn!("could not save background job settings: {e}");
    }
}

fn load_saved(kv: &KvStore, dir: &Path, registry: &Registry) {
    let policies = kv
        .get(dir, STORE, POLICIES_KEY)
        .ok()
        .flatten()
        .and_then(|v| serde_json::from_value::<HashMap<String, Policy>>(v).ok())
        .unwrap_or_default();
    for (id, policy) in policies {
        registry.set_policy(&id, policy);
    }
    let disabled = kv
        .get(dir, STORE, DISABLED_KEY)
        .ok()
        .flatten()
        .and_then(|v| serde_json::from_value::<Vec<String>>(v).ok())
        .unwrap_or_default();
    for id in disabled {
        registry.set_enabled(&id, false);
    }
    if let Some(enabled) = kv.get(dir, STORE, ALL_ENABLED_KEY).ok().flatten().and_then(|v| v.as_bool()) {
        registry.set_all_enabled(enabled);
    }
    if let Some(pause) = kv.get(dir, STORE, PAUSE_KEY).ok().flatten() {
        if pause.as_bool() == Some(false) {
            registry.keep_running_instead_of_pausing();
        }
        save(kv, dir, registry);
        if let Err(e) = kv.delete(dir, STORE, PAUSE_KEY) {
            log::warn!("could not drop the old pause switch: {e}");
        }
    }
}

/// Loads saved policies, starts the game poller and the change event. Call once from `setup()`,
/// before any job registers.
pub fn start(app: &AppHandle) {
    let state = app.state::<JobsState>();
    state.registry.declare(crate::features::patch_notes::INDEX_JOB);
    state.registry.declare(crate::features::diagnostics::scan_job::JOB);
    state.registry.declare(crate::features::mvp::JOB);
    #[cfg(windows)]
    state.registry.declare(crate::features::server_picker::SYNC_JOB);
    if let Ok(dir) = app.path().app_data_dir() {
        load_saved(&app.state::<KvStore>(), &dir, &state.registry);
    }

    let emit_app = app.clone();
    let events = Arc::new(Coalescer::spawn(EVENT_INTERVAL, move || {
        let snapshot = emit_app.state::<JobsState>().registry.snapshot();
        let _ = emit_app.emit(EVENT, snapshot);
    }));
    let listener = events.clone();
    state.registry.set_listener(Box::new(move |_| listener.notify()));
    let _ = state.events.set(events.clone());

    let mut last = None;
    let game = state.registry.game_flag();
    let probe_app = app.clone();
    let watcher = GameWatcher::spawn(
        game,
        move || {
            let running = dp_game::is_running();
            if last != Some(running) {
                crate::features::app_window::on_game_probe(&probe_app, last, running);
                last = Some(running);
                events.notify();
            }
            running
        },
        GAME_POLL,
    );
    let _ = state.watcher.set(watcher);
}

pub mod commands {
    use super::*;
    use crate::features::error::AppError;

    #[tauri::command]
    pub async fn jobs_snapshot(state: tauri::State<'_, JobsState>) -> Result<JobsSnapshot, AppError> {
        Ok(state.registry.snapshot())
    }

    #[tauri::command]
    pub async fn cancel_job(state: tauri::State<'_, JobsState>, id: String) -> Result<(), AppError> {
        state.registry.cancel(&id);
        Ok(())
    }

    #[tauri::command]
    pub async fn set_job_policy(
        app: AppHandle,
        state: tauri::State<'_, JobsState>,
        id: String,
        policy: Policy,
    ) -> Result<(), AppError> {
        state.registry.set_policy(&id, policy);
        state.persist(&app);
        state.notify();
        Ok(())
    }

    #[tauri::command]
    pub async fn set_job_enabled(
        app: AppHandle,
        state: tauri::State<'_, JobsState>,
        id: String,
        enabled: bool,
    ) -> Result<(), AppError> {
        state.registry.set_enabled(&id, enabled);
        state.persist(&app);
        state.notify();
        Ok(())
    }

    #[tauri::command]
    pub async fn set_all_jobs_enabled(
        app: AppHandle,
        state: tauri::State<'_, JobsState>,
        enabled: bool,
    ) -> Result<(), AppError> {
        state.registry.set_all_enabled(enabled);
        state.persist(&app);
        state.notify();
        Ok(())
    }

    #[tauri::command]
    pub async fn force_run_job(state: tauri::State<'_, JobsState>, id: String) -> Result<(), AppError> {
        state.registry.force_run(&id);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::jobs::JobSpec;
    use serde_json::json;
    use std::path::PathBuf;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-jobs-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn registry() -> Arc<Registry> {
        let registry = Registry::new(GameFlag::new(false), Arc::new(|_| {}));
        registry.declare(JobSpec { id: "scan", default_policy: Policy::PauseInGame, policy_configurable: true });
        registry.declare(JobSpec { id: "index", default_policy: Policy::PauseInGame, policy_configurable: true });
        registry.declare(JobSpec { id: "sync", default_policy: Policy::Always, policy_configurable: false });
        registry
    }

    fn policies(registry: &Registry) -> Vec<(String, Policy)> {
        registry.snapshot().catalog.into_iter().map(|c| (c.id, c.policy)).collect()
    }

    #[test]
    fn a_saved_pause_switch_that_was_off_turns_pause_tasks_into_keep_running() {
        let dir = temp_dir("pause-off");
        let kv = KvStore::default();
        kv.set(&dir, STORE, POLICIES_KEY, json!({"index": "slowInGame"})).unwrap();
        kv.set(&dir, STORE, PAUSE_KEY, json!(false)).unwrap();

        let registry = registry();
        load_saved(&kv, &dir, &registry);

        let expected = [("scan", Policy::Always), ("index", Policy::SlowInGame), ("sync", Policy::Always)];
        assert_eq!(policies(&registry), expected.map(|(id, p)| (id.to_string(), p)));
        assert_eq!(kv.get(&dir, STORE, PAUSE_KEY).unwrap(), None);

        let reread = KvStore::default();
        assert_eq!(reread.get(&dir, STORE, PAUSE_KEY).unwrap(), None, "the flag is gone from disk");
        let fresh = registry_from(&reread, &dir);
        assert_eq!(policies(&fresh), policies(&registry), "the rewritten policies are saved");
    }

    #[test]
    fn a_saved_pause_switch_that_was_on_keeps_pause_tasks_and_drops_the_flag() {
        let dir = temp_dir("pause-on");
        let kv = KvStore::default();
        kv.set(&dir, STORE, PAUSE_KEY, json!(true)).unwrap();

        let registry = registry();
        load_saved(&kv, &dir, &registry);

        assert_eq!(policies(&registry)[0], ("scan".to_string(), Policy::PauseInGame));
        assert!(registry.policy_overrides().is_empty());
        assert_eq!(kv.get(&dir, STORE, PAUSE_KEY).unwrap(), None);
    }

    #[test]
    fn no_saved_pause_switch_changes_nothing() {
        let dir = temp_dir("pause-none");
        let kv = KvStore::default();

        let registry = registry();
        load_saved(&kv, &dir, &registry);

        assert_eq!(policies(&registry)[1], ("index".to_string(), Policy::PauseInGame));
        assert!(!dir.join(format!("{STORE}.json")).exists(), "loading alone writes nothing");
    }

    fn registry_from(kv: &KvStore, dir: &Path) -> Arc<Registry> {
        let registry = registry();
        load_saved(kv, dir, &registry);
        registry
    }
}
