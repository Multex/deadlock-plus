use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use dp_sync::LockExt;

/// Sleep applied at each checkpoint of a `SlowInGame` job while the game runs.
pub const SLOW_DELAY: Duration = Duration::from_millis(250);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum Policy {
    Always,
    PauseInGame,
    SlowInGame,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum JobState {
    Queued,
    Running,
    Paused,
    Done,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Flow {
    Continue,
    Cancelled,
}

#[derive(Debug, Clone, Copy)]
pub struct JobSpec {
    pub id: &'static str,
    pub default_policy: Policy,
    /// False for a job that ignores the game state, so settings doesn't offer a choice that does nothing.
    pub policy_configurable: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct JobInfo {
    pub id: String,
    pub state: JobState,
    pub policy: Policy,
    pub done: usize,
    pub total: usize,
    pub label: Option<String>,
}

/// A job the app can run, listed for settings whether or not it has run yet. `policy` is the one
/// in force: the user's choice, or the job's default.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct JobCatalogEntry {
    pub id: String,
    pub policy: Policy,
    pub policy_configurable: bool,
    /// Whether the job may start on its own. A manual run is always allowed.
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct JobsSnapshot {
    pub catalog: Vec<JobCatalogEntry>,
    pub jobs: Vec<JobInfo>,
    pub game_running: bool,
    /// Off stops every job from starting on its own, whatever its own switch says.
    pub all_enabled: bool,
}

/// Turns a burst of `notify` calls into at most one `emit` per `interval`. The first call after a
/// quiet period emits immediately, and a call made during the interval emits once it ends, so the
/// last change is never lost.
pub struct Coalescer {
    shared: Arc<CoalesceShared>,
}

#[derive(Default)]
struct CoalesceShared {
    state: Mutex<CoalesceState>,
    changed: Condvar,
}

#[derive(Default)]
struct CoalesceState {
    dirty: bool,
    closed: bool,
}

impl Coalescer {
    pub fn spawn(interval: Duration, emit: impl Fn() + Send + 'static) -> Self {
        let shared = Arc::new(CoalesceShared::default());
        let worker = shared.clone();
        std::thread::Builder::new()
            .name("jobs-events".into())
            .spawn(move || loop {
                let mut state = worker.state.lock_or_recover();
                while !state.dirty && !state.closed {
                    state = worker.changed.wait(state).unwrap_or_else(|e| e.into_inner());
                }
                if state.closed {
                    return;
                }
                state.dirty = false;
                drop(state);
                emit();
                let state = worker.state.lock_or_recover();
                let _ = worker
                    .changed
                    .wait_timeout_while(state, interval, |s| !s.closed)
                    .unwrap_or_else(|e| e.into_inner());
            })
            .expect("spawn jobs-events thread");
        Self { shared }
    }

    pub fn notify(&self) {
        self.shared.state.lock_or_recover().dirty = true;
        self.shared.changed.notify_all();
    }
}

impl Drop for Coalescer {
    fn drop(&mut self) {
        self.shared.state.lock_or_recover().closed = true;
        self.shared.changed.notify_all();
    }
}

/// Mirrors a process probe into a `GameFlag` every `interval` until dropped.
pub struct GameWatcher {
    stop: Arc<(Mutex<bool>, Condvar)>,
}

impl GameWatcher {
    pub fn spawn(game: Arc<GameFlag>, mut probe: impl FnMut() -> bool + Send + 'static, interval: Duration) -> Self {
        let stop = Arc::new((Mutex::new(false), Condvar::new()));
        let worker = stop.clone();
        std::thread::Builder::new()
            .name("game-watcher".into())
            .spawn(move || loop {
                let running = probe();
                if running != game.get() {
                    game.set(running);
                }
                let stopped = worker.0.lock_or_recover();
                let (stopped, _) =
                    worker.1.wait_timeout_while(stopped, interval, |s| !*s).unwrap_or_else(|e| e.into_inner());
                if *stopped {
                    return;
                }
            })
            .expect("spawn game-watcher thread");
        Self { stop }
    }
}

impl Drop for GameWatcher {
    fn drop(&mut self) {
        *self.stop.0.lock_or_recover() = true;
        self.stop.1.notify_all();
    }
}

pub struct GameFlag {
    running: AtomicBool,
    wake: Mutex<()>,
    changed: Condvar,
}

impl GameFlag {
    pub fn new(running: bool) -> Arc<Self> {
        Arc::new(Self { running: AtomicBool::new(running), wake: Mutex::new(()), changed: Condvar::new() })
    }

    pub fn get(&self) -> bool {
        self.running.load(Ordering::Acquire)
    }

    /// Wakes every checkpoint waiting on the game state.
    pub fn set(&self, running: bool) {
        self.running.store(running, Ordering::Release);
        self.wake_all();
    }

    /// Taking `wake` before notifying closes the gap between a waiter's re-check and its wait.
    fn wake_all(&self) {
        drop(self.wake.lock_or_recover());
        self.changed.notify_all();
    }
}

pub type Sleeper = Arc<dyn Fn(Duration) + Send + Sync>;
type Listener = Arc<dyn Fn(&JobInfo) + Send + Sync>;
type EnableListener = Arc<dyn Fn(&str) + Send + Sync>;

struct Job {
    info: JobInfo,
    generation: u64,
    cancelled: Arc<AtomicBool>,
    /// A user override for this run only: skips the pause or slowdown.
    forced: bool,
}

struct Inner {
    jobs: Vec<Job>,
    catalog: Vec<JobSpec>,
    next_generation: u64,
    all_enabled: bool,
    disabled: HashSet<String>,
    /// Policies the user chose, kept by id so they outlive a job being registered again.
    overrides: HashMap<String, Policy>,
}

enum Decision {
    Cancelled,
    Proceed(Option<JobInfo>),
    Slow(Option<JobInfo>),
    Pause { entered: Option<JobInfo> },
}

fn is_active(state: JobState) -> bool {
    matches!(state, JobState::Queued | JobState::Running | JobState::Paused)
}

pub struct Registry {
    game: Arc<GameFlag>,
    sleeper: Sleeper,
    inner: Mutex<Inner>,
    listener: Mutex<Option<Listener>>,
    enable_listeners: Mutex<Vec<EnableListener>>,
}

impl Registry {
    pub fn new(game: Arc<GameFlag>, sleeper: Sleeper) -> Arc<Self> {
        Arc::new(Self {
            game,
            sleeper,
            inner: Mutex::new(Inner {
                jobs: Vec::new(),
                catalog: Vec::new(),
                next_generation: 0,
                all_enabled: true,
                disabled: HashSet::new(),
                overrides: HashMap::new(),
            }),
            listener: Mutex::new(None),
            enable_listeners: Mutex::new(Vec::new()),
        })
    }

    /// Lists a job for settings before it has ever run. Declaring an id again replaces the entry.
    pub fn declare(&self, spec: JobSpec) {
        let mut inner = self.inner.lock_or_recover();
        match inner.catalog.iter_mut().find(|s| s.id == spec.id) {
            Some(slot) => *slot = spec,
            None => inner.catalog.push(spec),
        }
    }

    /// Registering an id that already exists replaces it, so a re-run starts from a clean slate.
    /// The replaced job's handle is cancelled and can no longer change the new job.
    pub fn register(self: &Arc<Self>, spec: JobSpec) -> JobHandle {
        let cancelled = Arc::new(AtomicBool::new(false));
        let (info, generation) = {
            let mut inner = self.inner.lock_or_recover();
            inner.next_generation += 1;
            let generation = inner.next_generation;
            let info = JobInfo {
                id: spec.id.to_string(),
                state: JobState::Queued,
                policy: inner.overrides.get(spec.id).copied().unwrap_or(spec.default_policy),
                done: 0,
                total: 0,
                label: None,
            };
            let job = Job { info: info.clone(), generation, cancelled: cancelled.clone(), forced: false };
            match inner.jobs.iter_mut().find(|j| j.info.id == spec.id) {
                Some(slot) => {
                    slot.cancelled.store(true, Ordering::Release);
                    *slot = job;
                }
                None => inner.jobs.push(job),
            }
            (info, generation)
        };
        self.game.wake_all();
        self.emit(&info);
        JobHandle { registry: self.clone(), id: spec.id, generation, cancelled }
    }

    #[cfg(test)]
    pub fn list(&self) -> Vec<JobInfo> {
        self.inner.lock_or_recover().jobs.iter().map(|j| j.info.clone()).collect()
    }

    /// True while the job is queued, running or paused.
    pub fn is_active(&self, id: &str) -> bool {
        self.inner.lock_or_recover().jobs.iter().any(|j| j.info.id == id && is_active(j.info.state))
    }

    pub fn game_flag(&self) -> Arc<GameFlag> {
        self.game.clone()
    }

    pub fn policy_overrides(&self) -> HashMap<String, Policy> {
        self.inner.lock_or_recover().overrides.clone()
    }

    /// Whether the job may start on its own: its own switch and the global one are both on.
    pub fn is_enabled(&self, id: &str) -> bool {
        let inner = self.inner.lock_or_recover();
        inner.all_enabled && !inner.disabled.contains(id)
    }

    pub fn all_enabled(&self) -> bool {
        self.inner.lock_or_recover().all_enabled
    }

    pub fn disabled_jobs(&self) -> HashSet<String> {
        self.inner.lock_or_recover().disabled.clone()
    }

    pub fn snapshot(&self) -> JobsSnapshot {
        let inner = self.inner.lock_or_recover();
        JobsSnapshot {
            catalog: inner
                .catalog
                .iter()
                .map(|spec| JobCatalogEntry {
                    id: spec.id.to_string(),
                    policy: inner.overrides.get(spec.id).copied().unwrap_or(spec.default_policy),
                    policy_configurable: spec.policy_configurable,
                    enabled: !inner.disabled.contains(spec.id),
                })
                .collect(),
            jobs: inner.jobs.iter().map(|j| j.info.clone()).collect(),
            game_running: self.game.get(),
            all_enabled: inner.all_enabled,
        }
    }

    #[cfg(test)]
    pub fn get(&self, id: &str) -> Option<JobInfo> {
        self.inner.lock_or_recover().jobs.iter().find(|j| j.info.id == id).map(|j| j.info.clone())
    }

    pub fn cancel(&self, id: &str) {
        self.change(id, None, |job| {
            if !is_active(job.info.state) {
                return false;
            }
            job.info.state = JobState::Cancelled;
            job.cancelled.store(true, Ordering::Release);
            true
        });
        self.game.wake_all();
    }

    pub fn set_policy(&self, id: &str, policy: Policy) {
        self.inner.lock_or_recover().overrides.insert(id.to_string(), policy);
        self.change(id, None, |job| {
            let changed = job.info.policy != policy;
            job.info.policy = policy;
            changed
        });
        self.game.wake_all();
    }

    /// Moves every job that would pause in game, by its own choice or its default, to `Always`.
    pub fn keep_running_instead_of_pausing(&self) {
        let ids: Vec<String> = {
            let inner = self.inner.lock_or_recover();
            let declared = inner
                .catalog
                .iter()
                .filter(|spec| {
                    inner.overrides.get(spec.id).copied().unwrap_or(spec.default_policy) == Policy::PauseInGame
                })
                .map(|spec| spec.id.to_string());
            let chosen = inner.overrides.iter().filter(|(_, p)| **p == Policy::PauseInGame).map(|(id, _)| id.clone());
            declared.chain(chosen).collect()
        };
        for id in ids {
            self.set_policy(&id, Policy::Always);
        }
    }

    pub fn set_enabled(&self, id: &str, enabled: bool) {
        let came_back = {
            let mut inner = self.inner.lock_or_recover();
            let was = inner.all_enabled && !inner.disabled.contains(id);
            if enabled {
                inner.disabled.remove(id);
            } else {
                inner.disabled.insert(id.to_string());
            }
            !was && inner.all_enabled && enabled
        };
        if came_back {
            self.announce_enabled(&[id.to_string()]);
        }
    }

    pub fn set_all_enabled(&self, enabled: bool) {
        let came_back: Vec<String> = {
            let mut inner = self.inner.lock_or_recover();
            let was = inner.all_enabled;
            inner.all_enabled = enabled;
            if was || !enabled {
                Vec::new()
            } else {
                inner
                    .catalog
                    .iter()
                    .filter(|spec| !inner.disabled.contains(spec.id))
                    .map(|spec| spec.id.to_string())
                    .collect()
            }
        };
        self.announce_enabled(&came_back);
    }

    /// Called with a job's id when it becomes allowed to start on its own again, whether its own
    /// switch or the global one just turned on. Not called for switching off, or for a job the
    /// other switch still holds off.
    pub fn on_enabled(&self, listener: Box<dyn Fn(&str) + Send + Sync>) {
        self.enable_listeners.lock_or_recover().push(Arc::from(listener));
    }

    fn announce_enabled(&self, ids: &[String]) {
        if ids.is_empty() {
            return;
        }
        let listeners = self.enable_listeners.lock_or_recover().clone();
        for id in ids {
            listeners.iter().for_each(|l| l(id));
        }
    }

    /// Lets a paused or slowed job run at full speed for the rest of this run. The saved policy is
    /// untouched.
    pub fn force_run(&self, id: &str) {
        self.change(id, None, |job| {
            if !is_active(job.info.state) || job.forced {
                return false;
            }
            job.forced = true;
            true
        });
        self.game.wake_all();
    }

    /// Called after every state, progress or policy change.
    pub fn set_listener(&self, listener: Box<dyn Fn(&JobInfo) + Send + Sync>) {
        *self.listener.lock_or_recover() = Some(Arc::from(listener));
    }

    fn emit(&self, info: &JobInfo) {
        let listener = self.listener.lock_or_recover().clone();
        if let Some(listener) = listener {
            listener(info);
        }
    }

    /// Applies `edit` under the lock, then reports outside it so a listener can call back into
    /// the registry.
    fn change(&self, id: &str, generation: Option<u64>, edit: impl FnOnce(&mut Job) -> bool) {
        let info = {
            let mut inner = self.inner.lock_or_recover();
            let Some(job) = inner.jobs.iter_mut().find(|j| j.info.id == id) else { return };
            if generation.is_some_and(|g| g != job.generation) || !edit(job) {
                return;
            }
            job.info.clone()
        };
        self.emit(&info);
    }

    fn decide(&self, id: &str, generation: u64) -> Decision {
        let mut inner = self.inner.lock_or_recover();
        let Some(job) = inner.jobs.iter_mut().find(|j| j.info.id == id && j.generation == generation) else {
            return Decision::Cancelled;
        };
        if job.info.state == JobState::Cancelled || job.cancelled.load(Ordering::Acquire) {
            return Decision::Cancelled;
        }
        let game = self.game.get();
        let resumed = |job: &mut Job| {
            (job.info.state == JobState::Paused).then(|| {
                job.info.state = JobState::Running;
                job.info.clone()
            })
        };
        if job.forced {
            return Decision::Proceed(resumed(job));
        }
        match job.info.policy {
            Policy::PauseInGame if game => {
                let entered = (job.info.state != JobState::Paused).then(|| {
                    job.info.state = JobState::Paused;
                    job.info.clone()
                });
                Decision::Pause { entered }
            }
            Policy::SlowInGame if game => Decision::Slow(resumed(job)),
            _ => Decision::Proceed(resumed(job)),
        }
    }

    /// The decision is made while holding `game.wake`, the same lock every waker takes before
    /// notifying, so a state change between the check and the wait cannot be missed.
    fn checkpoint(&self, id: &str, generation: u64) -> Flow {
        loop {
            let wake = self.game.wake.lock_or_recover();
            match self.decide(id, generation) {
                Decision::Cancelled => return Flow::Cancelled,
                Decision::Proceed(resumed) => {
                    drop(wake);
                    resumed.iter().for_each(|i| self.emit(i));
                    return Flow::Continue;
                }
                Decision::Slow(resumed) => {
                    drop(wake);
                    resumed.iter().for_each(|i| self.emit(i));
                    (self.sleeper)(SLOW_DELAY);
                    return Flow::Continue;
                }
                Decision::Pause { entered: Some(info) } => {
                    drop(wake);
                    self.emit(&info);
                }
                Decision::Pause { entered: None } => {
                    drop(self.game.changed.wait(wake).unwrap_or_else(|e| e.into_inner()));
                }
            }
        }
    }
}

pub struct JobHandle {
    registry: Arc<Registry>,
    id: &'static str,
    generation: u64,
    cancelled: Arc<AtomicBool>,
}

impl JobHandle {
    pub fn start(&self) {
        self.registry.change(self.id, Some(self.generation), |job| {
            if job.info.state != JobState::Queued {
                return false;
            }
            job.info.state = JobState::Running;
            true
        });
    }

    pub fn progress(&self, done: usize, total: usize, label: Option<&str>) {
        self.registry.change(self.id, Some(self.generation), |job| {
            if !is_active(job.info.state) {
                return false;
            }
            job.info.done = done;
            job.info.total = total;
            job.info.label = label.map(str::to_string);
            true
        });
    }

    /// Blocks while the job is paused. Returns `Cancelled` once the job was cancelled.
    /// Two atomic loads when the game is not running.
    pub fn checkpoint(&self) -> Flow {
        if self.cancelled.load(Ordering::Acquire) {
            return Flow::Cancelled;
        }
        if !self.registry.game.get() {
            return Flow::Continue;
        }
        self.registry.checkpoint(self.id, self.generation)
    }

    pub fn finish(&self) {
        self.end(JobState::Done);
    }

    fn end(&self, state: JobState) {
        self.registry.change(self.id, Some(self.generation), |job| {
            if !is_active(job.info.state) {
                return false;
            }
            job.info.state = state;
            true
        });
    }
}

mod service;
#[cfg(test)]
pub use service::STORE;
pub use service::{commands, start, JobsState};

#[cfg(test)]
mod tests;
