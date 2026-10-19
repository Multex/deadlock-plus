use std::path::PathBuf;
use std::time::Duration;

use dp_gamedata::CcSet;
use dp_mvp::{grade_lobby, LobbyMetadata, LOBBY_TOTALS_VERSION};

use super::adapter::{grade_meta, parse_lobby};
use super::queue::{plan_run, Job, Source, FETCH_GAP};
use super::store::{record_failure, GradeRecord, Store};

/// What one background run needs from the outside world, behind a trait so a run is testable without the app,
/// the disk or the network.
pub(super) trait Deps {
    fn record(&self, match_id: u64) -> Option<GradeRecord>;
    fn save(&self, record: &GradeRecord);
    /// The API copy the match detail view cached when it was opened.
    fn cached(&self, match_id: u64) -> Option<LobbyMetadata>;
    /// The game-captured detail: complete for grading but without the paths that tell leavers apart.
    fn captured(&self, match_id: u64) -> Option<LobbyMetadata>;
    async fn fetch(&self, match_id: u64) -> Result<LobbyMetadata, Source>;
    /// A monotonic clock; only differences matter.
    fn now(&self) -> Duration;
    async fn sleep(&self, wait: Duration);
    /// False when the run was cancelled.
    fn progress(&self, done: usize, total: usize) -> bool;
    /// True once a newly opened match should jump the queue.
    fn interrupted(&self) -> bool;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum RunEnd {
    Done,
    /// The API asked to be left alone.
    Stopped,
    Cancelled,
    /// A match was opened mid-run; the next run plans it first.
    Interrupted,
}

/// Runs `jobs` in order, one at a time. A wait from the API ends the run with nothing counted against the match.
pub(super) async fn run_jobs(deps: &impl Deps, jobs: &[Job], cc: &CcSet, version: &str) -> RunEnd {
    let mut last_fetch = None;
    for (done, job) in jobs.iter().enumerate() {
        if !deps.progress(done, jobs.len()) {
            return RunEnd::Cancelled;
        }
        if deps.interrupted() {
            return RunEnd::Interrupted;
        }
        match *job {
            Job::Regrade(match_id) => regrade(deps, match_id, cc, version),
            Job::Fetch(match_id) => {
                if fetch(deps, match_id, cc, version, &mut last_fetch).await == Some(Source::Stop) {
                    return RunEnd::Stopped;
                }
            }
        }
    }
    deps.progress(jobs.len(), jobs.len());
    RunEnd::Done
}

fn regrade(deps: &impl Deps, match_id: u64, cc: &CcSet, version: &str) {
    let Some(mut record) = deps.record(match_id) else { return };
    let Some(totals) = &record.totals else { return };
    record.grade = Some(grade_lobby(totals, &|name: &str| cc.contains(name)));
    record.grade_version = version.to_string();
    deps.save(&record);
}

/// The API copy wins over the game's: the detail cache, then the capture unless the record already came from it,
/// then the API. Returns the failed source, if any.
async fn fetch(
    deps: &impl Deps,
    match_id: u64,
    cc: &CcSet,
    version: &str,
    last_fetch: &mut Option<Duration>,
) -> Option<Source> {
    let previous = deps.record(match_id);
    if let Some(meta) = deps.cached(match_id) {
        deps.save(&graded(match_id, &meta, false, cc, version));
        return None;
    }
    if !previous.as_ref().is_some_and(|r| r.provisional) {
        if let Some(meta) = deps.captured(match_id) {
            deps.save(&graded(match_id, &meta, true, cc, version));
            return None;
        }
    }
    if let Some(at) = *last_fetch {
        let since = deps.now().saturating_sub(at);
        if since < FETCH_GAP {
            deps.sleep(FETCH_GAP - since).await;
        }
    }
    let fetched = deps.fetch(match_id).await;
    *last_fetch = Some(deps.now());
    match fetched {
        Ok(meta) => {
            deps.save(&graded(match_id, &meta, false, cc, version));
            None
        }
        Err(source) => {
            if source.counts_as_failure() {
                deps.save(&record_failure(previous, match_id));
            }
            Some(source)
        }
    }
}

/// An ineligible match is never provisional: mode, outcome, length and player count read the same in the game's
/// copy, so the API copy would not change the answer.
fn graded(match_id: u64, meta: &LobbyMetadata, provisional: bool, cc: &CcSet, version: &str) -> GradeRecord {
    let (totals, grade) = grade_meta(meta, cc).unzip();
    GradeRecord {
        match_id,
        provisional: provisional && totals.is_some(),
        totals_version: LOBBY_TOTALS_VERSION,
        grade_version: version.to_string(),
        totals,
        grade,
        failed_runs: 0,
    }
}

/// Every match a run considers: graded or once-graded files (older shapes included), plus `extra_ids`.
pub(super) fn plan_for(opened: Option<u64>, store: &Store, extra_ids: &[u64], version: &str) -> Vec<Job> {
    let stored = store.stored_ids();
    let records: Vec<GradeRecord> = stored.iter().filter_map(|&id| store.record(id)).collect();
    let ids: Vec<u64> = stored.into_iter().chain(extra_ids.iter().copied()).collect();
    plan_run(opened, &records, &ids, version)
}

/// The match detail view's raw metadata cache.
pub(super) struct DetailCache {
    pub dir: PathBuf,
}

impl DetailCache {
    pub fn get(&self, match_id: u64) -> Option<LobbyMetadata> {
        let bytes = dp_storage::matches::peek(&self.dir, &match_id.to_string()).ok()??;
        parse_lobby(&bytes)
    }
}

#[cfg(test)]
mod tests {
    use std::cell::{Cell, RefCell};
    use std::collections::{HashMap, HashSet};

    use dp_mvp::LOBBY_TOTALS_VERSION;

    use std::time::SystemTime;

    use super::super::store::{freshness, Freshness};
    use super::*;

    const V: &str = "1:new";
    const META: &str = include_str!("../../../../../../crates/ring1/dp-mvp/fixtures/lobby-118862917.json");

    fn meta(match_id: u64) -> LobbyMetadata {
        let mut m = LobbyMetadata::from_slice(META.as_bytes()).unwrap();
        m.match_info.match_id = match_id;
        m
    }

    fn short_meta(match_id: u64) -> LobbyMetadata {
        let mut m = meta(match_id);
        m.match_info.duration_s = 300;
        m
    }

    fn cc() -> CcSet {
        CcSet::bundled()
    }

    fn graded(match_id: u64) -> GradeRecord {
        let totals = dp_mvp::lobby_totals(&meta(match_id).match_info);
        let grade = dp_mvp::grade_lobby(&totals, &|_: &str| false);
        GradeRecord {
            match_id,
            provisional: false,
            totals_version: LOBBY_TOTALS_VERSION,
            grade_version: "0:old".into(),
            totals: Some(totals),
            grade: Some(grade),
            failed_runs: 0,
        }
    }

    #[derive(Default)]
    struct Fake {
        records: RefCell<HashMap<u64, GradeRecord>>,
        cached: HashSet<u64>,
        captured: HashSet<u64>,
        /// Missing: the API answers with the fixture.
        api: HashMap<u64, Source>,
        ineligible: HashSet<u64>,
        calls: RefCell<Vec<String>>,
        fetched_at: RefCell<Vec<Duration>>,
        clock: Cell<Duration>,
        progress: RefCell<Vec<(usize, usize)>>,
        cancel_at: Option<usize>,
        interrupt_at: Option<usize>,
        saves: Cell<usize>,
    }

    impl Fake {
        fn with(records: impl IntoIterator<Item = GradeRecord>) -> Self {
            let fake = Fake::default();
            fake.records.borrow_mut().extend(records.into_iter().map(|r| (r.match_id, r)));
            fake
        }

        fn meta(&self, match_id: u64) -> LobbyMetadata {
            if self.ineligible.contains(&match_id) {
                short_meta(match_id)
            } else {
                meta(match_id)
            }
        }

        fn calls(&self) -> Vec<String> {
            self.calls.borrow().clone()
        }

        fn get(&self, match_id: u64) -> Option<GradeRecord> {
            self.records.borrow().get(&match_id).cloned()
        }
    }

    impl Deps for Fake {
        fn record(&self, match_id: u64) -> Option<GradeRecord> {
            self.get(match_id)
        }

        fn save(&self, record: &GradeRecord) {
            self.saves.set(self.saves.get() + 1);
            self.records.borrow_mut().insert(record.match_id, record.clone());
        }

        fn cached(&self, match_id: u64) -> Option<LobbyMetadata> {
            self.calls.borrow_mut().push(format!("cached {match_id}"));
            self.cached.contains(&match_id).then(|| self.meta(match_id))
        }

        fn captured(&self, match_id: u64) -> Option<LobbyMetadata> {
            self.calls.borrow_mut().push(format!("captured {match_id}"));
            self.captured.contains(&match_id).then(|| self.meta(match_id))
        }

        async fn fetch(&self, match_id: u64) -> Result<LobbyMetadata, Source> {
            self.calls.borrow_mut().push(format!("fetch {match_id}"));
            self.fetched_at.borrow_mut().push(self.clock.get());
            match self.api.get(&match_id) {
                None | Some(Source::Got) => Ok(self.meta(match_id)),
                Some(failed) => Err(*failed),
            }
        }

        fn now(&self) -> Duration {
            self.clock.get()
        }

        async fn sleep(&self, wait: Duration) {
            self.clock.set(self.clock.get() + wait);
        }

        fn progress(&self, done: usize, total: usize) -> bool {
            self.progress.borrow_mut().push((done, total));
            self.cancel_at != Some(done)
        }

        fn interrupted(&self) -> bool {
            self.interrupt_at.is_some_and(|at| self.progress.borrow().len() > at)
        }
    }

    fn run(fake: &Fake, jobs: &[Job]) -> RunEnd {
        tauri::async_runtime::block_on(run_jobs(fake, jobs, &cc(), V))
    }

    #[test]
    fn a_regrade_grades_the_stored_totals_again_without_any_read_or_fetch() {
        let fake = Fake::with([graded(5)]);
        assert_eq!(run(&fake, &[Job::Regrade(5)]), RunEnd::Done);
        assert!(fake.calls().is_empty(), "{:?}", fake.calls());
        let r = fake.get(5).unwrap();
        assert_eq!(r.grade_version, V);
        let expected = dp_mvp::grade_lobby(r.totals.as_ref().unwrap(), &|n: &str| cc().contains(n));
        assert_eq!(r.grade, Some(expected));
        assert_eq!(freshness(Some(&r), V), Freshness::Fresh);
    }

    #[test]
    fn a_fetch_tries_the_cache_then_the_game_capture_then_the_api() {
        let fake = Fake { cached: [1].into(), captured: [1, 2].into(), ..Fake::default() };
        assert_eq!(run(&fake, &[Job::Fetch(1), Job::Fetch(2), Job::Fetch(3)]), RunEnd::Done);
        assert_eq!(fake.calls(), ["cached 1", "cached 2", "captured 2", "cached 3", "captured 3", "fetch 3"]);
        for (id, provisional) in [(1, false), (2, true), (3, false)] {
            let r = fake.get(id).unwrap();
            assert_eq!((r.provisional, r.grade_version.as_str(), r.failed_runs), (provisional, V, 0), "{id}");
            assert!(r.grade.is_some() && r.totals.is_some(), "{id}");
            assert_eq!(r.totals_version, LOBBY_TOTALS_VERSION);
        }
    }

    #[test]
    fn a_provisional_record_skips_the_game_capture_and_asks_the_api() {
        let fake = Fake { captured: [4].into(), ..Fake::with([GradeRecord { provisional: true, ..graded(4) }]) };
        run(&fake, &[Job::Fetch(4)]);
        assert_eq!(fake.calls(), ["cached 4", "fetch 4"]);
        assert!(!fake.get(4).unwrap().provisional);
    }

    #[test]
    fn a_wait_ends_the_run_without_counting_a_failure() {
        let before = GradeRecord { provisional: true, ..graded(9) };
        let fake = Fake { api: [(9, Source::Stop)].into(), ..Fake::with([before.clone()]) };
        assert_eq!(run(&fake, &[Job::Fetch(9), Job::Fetch(8), Job::Regrade(7)]), RunEnd::Stopped);
        assert_eq!(fake.get(9), Some(before));
        assert_eq!(fake.calls(), ["cached 9", "fetch 9"]);
        assert_eq!(fake.saves.get(), 0);
    }

    #[test]
    fn not_yet_and_fail_count_one_failed_run_and_keep_the_grade() {
        let held = GradeRecord { provisional: true, ..graded(2) };
        let fake = Fake { api: [(1, Source::NotYet), (2, Source::Fail)].into(), ..Fake::with([held.clone()]) };
        assert_eq!(run(&fake, &[Job::Fetch(2), Job::Fetch(1)]), RunEnd::Done);
        assert_eq!(fake.get(2), Some(GradeRecord { failed_runs: 1, ..held }));
        let missing = fake.get(1).unwrap();
        assert_eq!((missing.failed_runs, missing.grade.is_none()), (1, true));
    }

    #[test]
    fn the_third_failed_run_drops_the_grade() {
        let fake = Fake {
            api: [(6, Source::NotYet)].into(),
            ..Fake::with([GradeRecord { provisional: true, failed_runs: 2, ..graded(6) }])
        };
        run(&fake, &[Job::Fetch(6)]);
        let r = fake.get(6).unwrap();
        assert_eq!((r.failed_runs, r.grade.is_none(), r.totals.is_none()), (3, true, true));
        assert_eq!(freshness(Some(&r), V), Freshness::Fresh);
    }

    #[test]
    fn api_fetches_are_a_second_apart_and_local_reads_do_not_wait() {
        let fake = Fake { cached: [2].into(), ..Fake::default() };
        run(&fake, &[Job::Fetch(4), Job::Fetch(3), Job::Fetch(2), Job::Fetch(1)]);
        let at = fake.fetched_at.borrow().clone();
        assert_eq!(at.len(), 3);
        assert_eq!(at[0], Duration::ZERO, "the first fetch does not wait");
        assert!(at.windows(2).all(|w| w[1] - w[0] >= FETCH_GAP), "{at:?}");
        assert_eq!(fake.clock.get(), 2 * FETCH_GAP, "{at:?}");
    }

    #[test]
    fn an_ineligible_match_is_saved_without_totals_so_it_is_not_fetched_again() {
        let fake = Fake { ineligible: [3, 4].into(), captured: [4].into(), ..Fake::default() };
        run(&fake, &[Job::Fetch(3), Job::Fetch(4)]);
        for id in [3, 4] {
            let r = fake.get(id).unwrap();
            assert_eq!((r.totals.is_none(), r.grade.is_none(), r.provisional, r.failed_runs), (true, true, false, 0));
            assert_eq!(freshness(Some(&r), V), Freshness::Fresh, "{id}");
        }
    }

    #[test]
    fn progress_covers_the_whole_run_and_a_cancel_stops_it() {
        let fake = Fake::with([graded(1), graded(2)]);
        run(&fake, &[Job::Regrade(1), Job::Regrade(2)]);
        assert_eq!(*fake.progress.borrow(), [(0, 2), (1, 2), (2, 2)]);

        let fake = Fake { cancel_at: Some(1), ..Fake::with([graded(1), graded(2)]) };
        assert_eq!(run(&fake, &[Job::Regrade(1), Job::Regrade(2)]), RunEnd::Cancelled);
        assert_eq!(fake.get(2).unwrap().grade_version, "0:old");
    }

    #[test]
    fn an_opened_match_interrupts_the_run_between_jobs() {
        let fake = Fake { interrupt_at: Some(1), ..Fake::with([graded(1), graded(2)]) };
        assert_eq!(run(&fake, &[Job::Regrade(1), Job::Regrade(2)]), RunEnd::Interrupted);
        assert_eq!(fake.get(1).unwrap().grade_version, V);
        assert_eq!(fake.get(2).unwrap().grade_version, "0:old");
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-mvp-run-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn the_plan_puts_the_opened_match_first_and_covers_old_shape_files() {
        let dir = temp_dir("plan");
        let store = Store::new(&dir);
        store.save_record(&graded(10)).unwrap();
        store.save_record(&GradeRecord { grade_version: V.into(), ..graded(11) }).unwrap();
        std::fs::write(dir.join("grades").join("12.json"), r#"{"match_id":12,"provisional":false,"grade":null}"#)
            .unwrap();
        assert_eq!(plan_for(None, &store, &[13], V), [Job::Regrade(10), Job::Fetch(13), Job::Fetch(12)]);
        assert_eq!(plan_for(Some(5), &store, &[13], V)[0], Job::Fetch(5));
        assert_eq!(plan_for(Some(12), &store, &[], V), [Job::Fetch(12), Job::Regrade(10)]);
    }

    #[test]
    fn reading_the_detail_cache_keeps_its_expiry_and_a_fetch_never_writes_it() {
        let dir = temp_dir("cache");
        let opened = SystemTime::UNIX_EPOCH + Duration::from_secs(1_000_000);
        dp_storage::matches::write(&dir, "21", META.as_bytes(), opened).unwrap();
        let cache = DetailCache { dir: dir.clone() };
        assert!(cache.get(21).is_some());
        assert!(cache.get(22).is_none());
        let modified = std::fs::metadata(dir.join("21.json")).unwrap().modified().unwrap();
        assert_eq!(modified, opened);

        struct Cached(Fake, DetailCache);
        impl Deps for Cached {
            fn record(&self, id: u64) -> Option<GradeRecord> {
                self.0.record(id)
            }
            fn save(&self, r: &GradeRecord) {
                self.0.save(r)
            }
            fn cached(&self, id: u64) -> Option<LobbyMetadata> {
                self.1.get(id)
            }
            fn captured(&self, id: u64) -> Option<LobbyMetadata> {
                self.0.captured(id)
            }
            async fn fetch(&self, id: u64) -> Result<LobbyMetadata, Source> {
                self.0.fetch(id).await
            }
            fn now(&self) -> Duration {
                self.0.now()
            }
            async fn sleep(&self, wait: Duration) {
                self.0.sleep(wait).await
            }
            fn progress(&self, done: usize, total: usize) -> bool {
                self.0.progress(done, total)
            }
            fn interrupted(&self) -> bool {
                self.0.interrupted()
            }
        }
        let deps = Cached(Fake::default(), DetailCache { dir: dir.clone() });
        tauri::async_runtime::block_on(run_jobs(&deps, &[Job::Fetch(22)], &cc(), V));
        assert!(deps.0.get(22).is_some_and(|r| r.grade.is_some()));
        assert!(!dir.join("22.json").exists());
    }
}
