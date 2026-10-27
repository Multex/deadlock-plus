use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::features::jobs::{JobHandle, JobSpec, JobsState, Policy, Registry};
use crate::http::Http;
use dp_patch_notes::search::PatchSearchResult;
use dp_patch_notes::store::{self, Index, PatchDetail, PatchSource};
use dp_patch_notes::{embed, search, steam_news};
use dp_sync::LockExt;

const STEAM_NEWS_POLL: Duration = Duration::from_secs(15 * 60);

enum Job {
    New(Vec<(PatchSource, String)>),
    SteamNews(Vec<(PatchSource, String, Vec<String>)>),
}

pub(crate) const INDEX_JOB: JobSpec =
    JobSpec { id: "patch-notes-index", default_policy: Policy::PauseInGame, policy_configurable: true };

/// The embedding batch in flight, reported to the jobs registry as it advances.
struct Batch {
    handle: Arc<JobHandle>,
    done: usize,
    total: usize,
    label: Option<String>,
}

#[derive(Default)]
pub struct PatchNotesState {
    index: Mutex<Option<Arc<Index>>>,
    batch: Mutex<Option<Batch>>,
    /// Set once by `start`, from the dedicated `patch-notes-indexer` thread's setup. `ingest_new`
    /// and `ingest_steam_news` just enqueue onto it; the thread does the actual embedding.
    jobs: OnceLock<mpsc::Sender<Job>>,
    /// Set when the index was loaded from an older schema; cleared once it has been rewritten.
    needs_rewrite: AtomicBool,
    /// Set once by `start`. Until then indexing counts as enabled.
    registry: OnceLock<Arc<Registry>>,
    /// Wakes the Steam News poll loop ahead of its interval.
    poll_now: Arc<tokio::sync::Notify>,
}

impl PatchNotesState {
    fn path(app: &AppHandle) -> Option<PathBuf> {
        app.path().app_data_dir().ok().map(|d| d.join(store::FILE_NAME))
    }

    fn with_index<R>(&self, app: &AppHandle, f: impl FnOnce(&mut Index) -> R) -> R {
        self.with_loaded(|| self.load_from_disk(app), f)
    }

    fn with_loaded<R>(&self, load: impl FnOnce() -> Index, f: impl FnOnce(&mut Index) -> R) -> R {
        let mut guard = self.index.lock_or_recover();
        let index = guard.get_or_insert_with(|| Arc::new(load()));
        match Arc::get_mut(index) {
            Some(index) => f(index),
            None => {
                let mut copy = Index { patches: index.patches.clone() };
                let result = f(&mut copy);
                *index = Arc::new(copy);
                result
            }
        }
    }

    /// A shared handle on the current index. Writers copy on write while a handle is outstanding, so
    /// the holder can read (search) or serialize it without holding the index lock.
    fn snapshot(&self, app: &AppHandle) -> Arc<Index> {
        self.shared(|| self.load_from_disk(app))
    }

    fn shared(&self, load: impl FnOnce() -> Index) -> Arc<Index> {
        let mut guard = self.index.lock_or_recover();
        guard.get_or_insert_with(|| Arc::new(load())).clone()
    }

    fn load_from_disk(&self, app: &AppHandle) -> Index {
        self.track_load(Self::path(app).map(|p| store::load_reporting(&p)).unwrap_or_default())
    }

    fn track_load(&self, (index, migrated): (Index, bool)) -> Index {
        if migrated {
            self.needs_rewrite.store(true, Ordering::Release);
        }
        index
    }

    /// Rewrites an index that was loaded from an older schema so the file migrates without waiting
    /// for a patch to be ingested. Runs the save outside the index lock.
    fn rewrite_if_migrated(&self, save: impl FnOnce(&Index) -> std::io::Result<()>) {
        if self.needs_rewrite.swap(false, Ordering::AcqRel) {
            self.persist_with(save);
        }
    }

    fn persist(&self, app: &AppHandle) {
        let Some(path) = Self::path(app) else { return };
        self.persist_with(|index| store::save(&path, index));
    }

    /// Serializing the 35 MB index takes long enough to stall every reader, so the lock is only held
    /// to take a handle; writers copy on write while it is out.
    fn persist_with(&self, save: impl FnOnce(&Index) -> std::io::Result<()>) {
        let Some(index) = self.index.lock_or_recover().clone() else { return };
        if let Err(e) = save(&index) {
            log::warn!("could not save {}: {e}", store::FILE_NAME);
        }
    }

    /// Starts a new batch with a **known** size, computed up front by the caller (see
    /// `store::count_new_patches_lines`/`count_steam_news_lines`) before any embedding happens.
    /// This must know the real total before the first line embeds: incrementing `total` lazily,
    /// one line at a time as each embed starts, meant `done` could never trail `total` by more
    /// than 1 — for the common small-batch case (0-2 new lines per poll, once the initial backfill
    /// is done) the bar could only ever be observed at 0%, since `done` catching up to `total`
    /// happens in the same step that finishes the job. Only call this when `total > 0`; a
    /// zero-line batch does nothing.
    fn begin_batch(&self, app: &AppHandle, total: usize) {
        let handle = Arc::new(app.state::<JobsState>().registry.register(INDEX_JOB));
        handle.start();
        handle.progress(0, total, None);
        *self.batch.lock_or_recover() = Some(Batch { handle, done: 0, total, label: None });
    }

    /// Marks which patch's line is about to be embedded, and waits here while the job is paused.
    /// Cancellation is not offered for this job, so the checkpoint result is ignored. The batch
    /// lock is released before waiting; only the indexer thread touches it.
    fn begin_indexing(&self, source: &PatchSource) {
        let label = source.published.get(..10).map(str::to_string);
        let (handle, done, total) = {
            let mut guard = self.batch.lock_or_recover();
            let Some(batch) = guard.as_mut() else { return };
            batch.label = label.clone();
            (batch.handle.clone(), batch.done, batch.total)
        };
        handle.checkpoint();
        handle.progress(done, total, label.as_deref());
    }

    fn advance_indexing(&self) {
        let mut guard = self.batch.lock_or_recover();
        let Some(batch) = guard.as_mut() else { return };
        batch.done += 1;
        if batch.done >= batch.total {
            batch.handle.finish();
            *guard = None;
        } else {
            batch.handle.progress(batch.done, batch.total, batch.label.as_deref());
        }
    }

    /// Closes a batch that ended early, so the job never stays in the status bar.
    fn end_batch(&self) {
        if let Some(batch) = self.batch.lock_or_recover().take() {
            batch.handle.finish();
        }
    }

    fn indexing_enabled(&self) -> bool {
        self.registry.get().is_none_or(|r| r.is_enabled(INDEX_JOB.id))
    }

    /// Turning indexing back on fetches right away instead of waiting out the poll interval.
    fn wake_on_enable(&self, registry: &Registry) {
        let wake = self.poll_now.clone();
        registry.on_enabled(Box::new(move |id| {
            if id == INDEX_JOB.id {
                wake.notify_one();
            }
        }));
    }

    fn enqueue(&self, job: Job) {
        if !self.indexing_enabled() {
            return;
        }
        match self.jobs.get() {
            Some(tx) if tx.send(job).is_ok() => {}
            Some(_) => log::warn!("patch notes indexer thread is gone; dropping a job"),
            None => log::warn!("patch notes indexer not started; dropping a job"),
        }
    }

    pub fn known_ids(&self, app: &AppHandle) -> std::collections::HashSet<String> {
        self.snapshot(app).patches.iter().map(|p| p.id.clone()).collect()
    }

    /// Hands `items` to the indexer thread; returns immediately.
    pub fn ingest_new(&self, items: Vec<(PatchSource, String)>) {
        self.enqueue(Job::New(items));
    }

    /// Hands a full Steam News fetch to the indexer thread; returns immediately.
    fn ingest_steam_news(&self, items: Vec<(PatchSource, String, Vec<String>)>) {
        self.enqueue(Job::SteamNews(items));
    }

    /// Indexes whatever in `items` is not already known. The index lock is held only to read
    /// `known` and to extend the index afterwards — never during embedding, which can take a
    /// while for a whole feed's worth of patches and must not block a concurrent search. Runs on
    /// the `patch-notes-indexer` thread only.
    fn process_new(&self, app: &AppHandle, items: Vec<(PatchSource, String)>) {
        let known: std::collections::HashSet<String> =
            self.with_index(app, |index| index.patches.iter().map(|p| p.id.clone()).collect());
        let total = store::count_new_patches_lines(&items, &known);
        if total > 0 {
            if let Err(e) = embed::embedder() {
                log::warn!("skipping patch notes indexing: {e}");
                return;
            }
            self.begin_batch(app, total);
        }
        let new_patches = store::build_new_patches(
            &items,
            &known,
            &embed::Lazy,
            |source| self.begin_indexing(source),
            || self.advance_indexing(),
        );
        self.end_batch();
        if new_patches.is_empty() {
            return;
        }
        let added = new_patches.len();
        self.with_index(app, |index| index.patches.extend(new_patches));
        log::info!("patch notes index: {added} new patch(es) indexed");
        self.persist(app);
    }

    /// Reconciles a full Steam News fetch against the index: fills in patches that were only ever
    /// seen as a shallow forum-only entry, upgrades a patch whose `/v2/patches`-derived twin is
    /// still shallow, and adds anything neither feed has seen yet. It needs its own fetch path
    /// because `/v2/patches` only keeps a ~30-item window of truncated bodies. Runs on the
    /// `patch-notes-indexer` thread only.
    ///
    /// Works on a clone, same as `process_new`, so the index lock is held only to read the
    /// starting snapshot and to write the result back — never while `reconcile_steam_news` is
    /// embedding, which can take a long time when a lot of lines need it (e.g. after a change to
    /// how BBCode gets stripped invalidates many cached lines at once). This thread is the only
    /// writer to `index.patches` (jobs are processed one at a time from the same channel), so
    /// nothing else can race the clone-then-replace.
    fn process_steam_news(&self, app: &AppHandle, items: Vec<(PatchSource, String, Vec<String>)>) {
        let mut patches = self.with_index(app, |index| index.patches.clone());
        let total = store::count_steam_news_lines(&patches, &items);
        if total > 0 {
            if let Err(e) = embed::embedder() {
                log::warn!("skipping patch notes steam news reconciliation: {e}");
                return;
            }
            self.begin_batch(app, total);
        }
        let changed = store::reconcile_steam_news(
            &mut patches,
            &items,
            &embed::Lazy,
            |source| self.begin_indexing(source),
            || self.advance_indexing(),
        );
        self.end_batch();
        if changed == 0 {
            return;
        }
        self.with_index(app, |index| index.patches = patches);
        log::info!("patch notes index: {changed} patch(es) added or upgraded from Steam News");
        self.persist(app);
    }

    async fn poll_steam_news(&self, app: &AppHandle) {
        if !self.indexing_enabled() {
            return;
        }
        let http = app.state::<Http>().0.clone();
        let resp = match http.get(steam_news::URL).send().await.and_then(|r| r.error_for_status()) {
            Ok(resp) => resp,
            Err(e) => {
                log::warn!("steam news request failed: {e}");
                return;
            }
        };
        let text = match resp.text().await {
            Ok(text) => text,
            Err(e) => {
                log::warn!("steam news body could not be read: {e}");
                return;
            }
        };
        let items = match steam_news::parse_news_with_text(&text) {
            Ok(items) => items,
            Err(e) => {
                log::warn!("steam news could not be parsed: {e}");
                return;
            }
        };
        self.ingest_steam_news(items);
    }
}

/// Starts everything patch notes needs for the rest of the app's life: the dedicated indexer
/// thread, and the Steam News poll loop that feeds it. Independent of `alerts::start`: `alerts`
/// keeps polling `/v2/patches` for its own card display, this polls the fuller Steam News source
/// on the same cadence to backfill and upgrade the index. Call once from `setup()`.
pub fn start(app: &AppHandle) {
    let state = app.state::<PatchNotesState>();
    let registry = app.state::<JobsState>().registry.clone();
    state.wake_on_enable(&registry);
    let _ = state.registry.set(registry);
    if !state.indexing_enabled() {
        log::info!("patch notes auto-indexing is off");
    }
    spawn_indexer_thread(app);

    let wake = state.poll_now.clone();
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            app.state::<PatchNotesState>().poll_steam_news(&app).await;
            let _ = tokio::time::timeout(STEAM_NEWS_POLL, wake.notified()).await;
        }
    });
}

/// Spawns the thread that owns every bit of patch notes embedding work, for the app's whole
/// lifetime: it processes ingest jobs serially off the
/// async runtime as `alerts` and the Steam News poll hand them in. The ONNX model loads on the first
/// job that has a line to embed, or the first search that needs it. Named so it shows up as itself
/// rather than a generic worker in a profiler or task manager.
fn spawn_indexer_thread(app: &AppHandle) {
    let (tx, rx) = mpsc::channel::<Job>();
    if app.state::<PatchNotesState>().jobs.set(tx).is_err() {
        log::warn!("patch notes indexer already started; not spawning a second one");
        return;
    }

    let app = app.clone();
    std::thread::Builder::new()
        .name("patch-notes-indexer".into())
        .spawn(move || {
            let state = app.state::<PatchNotesState>();
            drop(state.snapshot(&app));
            if let Some(path) = PatchNotesState::path(&app) {
                state.rewrite_if_migrated(|index| store::save(&path, index));
            }
            for job in rx {
                match job {
                    Job::New(items) => state.process_new(&app, items),
                    Job::SteamNews(items) => state.process_steam_news(&app, items),
                }
            }
        })
        .expect("spawn patch-notes-indexer thread");
}

pub mod commands {
    use super::*;
    use crate::command_panics::guarded;
    use crate::features::error::{error_codes, AppError};

    error_codes! {
        pub enum PatchNotesError in "patch_notes" {
            SearchFailed = "search_failed",
        }
    }

    const RESULT_LIMIT: usize = 15;

    /// Looks up one patch's full content for the in-app viewer, by the same id shown in the
    /// alerts list or a search result. `async` so it can never freeze the main thread.
    #[tauri::command]
    pub async fn get_patch_notes(
        app: AppHandle,
        state: tauri::State<'_, PatchNotesState>,
        id: String,
    ) -> Result<Option<PatchDetail>, AppError> {
        guarded(async move {
            Ok(state.with_index(&app, |index| index.patches.iter().find(|p| p.id == id).map(PatchDetail::from)))
        })
        .await
    }

    /// Runs off the async runtime: loading/optimising the ONNX graph and running inference are
    /// both blocking CPU work.
    #[tauri::command]
    pub async fn search_patch_notes(
        app: AppHandle,
        state: tauri::State<'_, PatchNotesState>,
        query: String,
    ) -> Result<Vec<PatchSearchResult>, AppError> {
        guarded(async move {
            if query.trim().is_empty() {
                return Ok(Vec::new());
            }
            let index = state.snapshot(&app);
            tauri::async_runtime::spawn_blocking(move || search::search(&index, &query, embed::embedder, RESULT_LIMIT))
                .await
                .map_err(|e| AppError::new(PatchNotesError::SearchFailed).detail(e))
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::jobs::{GameFlag, Sleeper};

    #[test]
    fn every_patch_notes_code_is_in_the_english_catalog() {
        crate::features::error::assert_catalogued::<commands::PatchNotesError>();
    }

    fn patch(id: &str) -> dp_patch_notes::store::IndexedPatch {
        dp_patch_notes::store::IndexedPatch {
            id: id.into(),
            title: String::new(),
            published: String::new(),
            link: String::new(),
            origin: Default::default(),
            lines: Vec::new(),
            images: Vec::new(),
        }
    }

    fn index_of(ids: &[&str]) -> Index {
        Index { patches: ids.iter().map(|id| patch(id)).collect() }
    }

    #[test]
    fn saving_does_not_hold_the_index_lock() {
        let state = PatchNotesState::default();
        state.with_loaded(|| index_of(&["a"]), |_| ());
        let mut free = None;
        state.persist_with(|_| {
            free = Some(state.index.try_lock().is_ok());
            Ok(())
        });
        assert_eq!(free, Some(true));
    }

    #[test]
    fn a_write_during_a_save_does_not_change_what_is_saved() {
        let state = PatchNotesState::default();
        state.with_loaded(|| index_of(&["a"]), |_| ());
        let mut saved = Vec::new();
        state.persist_with(|index| {
            state.with_loaded(Index::default, |live| live.patches.push(patch("b")));
            saved = index.patches.iter().map(|p| p.id.clone()).collect();
            Ok(())
        });
        assert_eq!(saved, vec!["a"]);
        let live = state.shared(Index::default);
        assert_eq!(live.patches.len(), 2);
    }

    #[test]
    fn an_index_loaded_from_an_older_schema_is_saved_once() {
        let state = PatchNotesState::default();
        state.shared(|| state.track_load((index_of(&["a"]), true)));
        let mut saved = Vec::new();
        state.rewrite_if_migrated(|index| {
            saved = index.patches.iter().map(|p| p.id.clone()).collect();
            Ok(())
        });
        assert_eq!(saved, vec!["a"]);
        let mut again = false;
        state.rewrite_if_migrated(|_| {
            again = true;
            Ok(())
        });
        assert!(!again);
    }

    #[test]
    fn an_index_loaded_in_the_current_schema_is_not_rewritten() {
        let state = PatchNotesState::default();
        state.shared(|| state.track_load((index_of(&["a"]), false)));
        let mut called = false;
        state.rewrite_if_migrated(|_| {
            called = true;
            Ok(())
        });
        assert!(!called);
    }

    #[test]
    fn persist_before_the_index_is_loaded_saves_nothing() {
        let state = PatchNotesState::default();
        let mut called = false;
        state.persist_with(|_| {
            called = true;
            Ok(())
        });
        assert!(!called);
    }

    fn state_with_queue() -> (PatchNotesState, mpsc::Receiver<Job>, Arc<Registry>) {
        let state = PatchNotesState::default();
        let (tx, rx) = mpsc::channel();
        assert!(state.jobs.set(tx).is_ok());
        let sleeper: Sleeper = Arc::new(|_| {});
        let registry = Registry::new(GameFlag::new(false), sleeper);
        assert!(state.registry.set(registry.clone()).is_ok());
        (state, rx, registry)
    }

    #[test]
    fn indexing_is_on_until_switched_off() {
        let (state, rx, _registry) = state_with_queue();
        state.ingest_new(Vec::new());
        assert!(rx.try_recv().is_ok());
    }

    #[test]
    fn indexing_is_on_before_the_registry_is_attached() {
        let state = PatchNotesState::default();
        let (tx, rx) = mpsc::channel();
        assert!(state.jobs.set(tx).is_ok());
        state.ingest_new(Vec::new());
        assert!(rx.try_recv().is_ok());
    }

    #[test]
    fn switched_off_drops_jobs_instead_of_queueing_them() {
        let (state, rx, registry) = state_with_queue();
        registry.set_enabled(INDEX_JOB.id, false);
        state.ingest_new(Vec::new());
        state.ingest_steam_news(Vec::new());
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn the_global_switch_drops_jobs_too() {
        let (state, rx, registry) = state_with_queue();
        registry.set_all_enabled(false);
        state.ingest_new(Vec::new());
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn another_jobs_switch_does_not_stop_indexing() {
        let (state, rx, registry) = state_with_queue();
        registry.set_enabled("addon-scan", false);
        state.ingest_new(Vec::new());
        assert!(rx.try_recv().is_ok());
    }

    fn woken_within(state: &PatchNotesState, wait: Duration) -> bool {
        let runtime = tokio::runtime::Builder::new_current_thread().enable_time().build().unwrap();
        let wake = state.poll_now.clone();
        runtime.block_on(async move { tokio::time::timeout(wait, wake.notified()).await.is_ok() })
    }

    #[test]
    fn turning_indexing_back_on_wakes_the_poll_loop_at_once() {
        let (state, _rx, registry) = state_with_queue();
        state.wake_on_enable(&registry);
        registry.set_enabled(INDEX_JOB.id, false);
        assert!(!woken_within(&state, Duration::from_millis(50)), "switching off must not wake it");

        registry.set_enabled(INDEX_JOB.id, true);
        assert!(woken_within(&state, Duration::from_secs(2)));
    }

    #[test]
    fn turning_the_global_switch_back_on_wakes_the_poll_loop() {
        let (state, _rx, registry) = state_with_queue();
        registry.declare(INDEX_JOB);
        state.wake_on_enable(&registry);
        registry.set_all_enabled(false);
        registry.set_all_enabled(true);
        assert!(woken_within(&state, Duration::from_secs(2)));
    }

    #[test]
    fn enabling_another_job_does_not_wake_the_poll_loop() {
        let (state, _rx, registry) = state_with_queue();
        state.wake_on_enable(&registry);
        registry.set_enabled("addon-scan", false);
        registry.set_enabled("addon-scan", true);
        assert!(!woken_within(&state, Duration::from_millis(50)));
    }

    #[test]
    fn switching_back_on_queues_jobs_again() {
        let (state, rx, registry) = state_with_queue();
        registry.set_enabled(INDEX_JOB.id, false);
        registry.set_enabled(INDEX_JOB.id, true);
        state.ingest_new(Vec::new());
        assert!(rx.try_recv().is_ok());
    }
}
