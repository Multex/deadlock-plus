use std::io;
use std::path::{Path, PathBuf};

use dp_mvp::{LobbyGrade, LobbyTotals, LOBBY_TOTALS_VERSION};
use serde::{Deserialize, Serialize};

/// Folder under the app data directory: one `grades/<match id>.json` per checked match.
pub const MVP_DIR: &str = "mvp";
const MODEL_FILE: &str = "model.json";
const GRADES_DIR: &str = "grades";

/// Fetch runs that may fail for one match before its grade is dropped and it is no longer fetched.
pub const MAX_FAILED_RUNS: u32 = 3;

/// What a check of one match left behind. The totals are kept so a CC-list or points change re-grades locally.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GradeRecord {
    pub match_id: u64,
    /// Graded from the game-captured detail; replaced once the API has the match.
    pub provisional: bool,
    pub totals_version: u32,
    pub grade_version: String,
    /// `None`: the match is not gradable, or the record gave up. Stored so it is not fetched again.
    pub totals: Option<LobbyTotals>,
    pub grade: Option<LobbyGrade>,
    pub failed_runs: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Freshness {
    Fresh,
    /// Totals are current; grade them again locally.
    Regrade,
    Refetch,
    Missing,
}

/// One file per match, so each write is small and atomic however many matches are stored.
pub struct Store {
    dir: PathBuf,
}

impl Store {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    /// A file in the older grade shape fails to parse and reads as missing.
    pub fn record(&self, match_id: u64) -> Option<GradeRecord> {
        let bytes = std::fs::read(self.grade_path(match_id)).ok()?;
        serde_json::from_slice(&bytes).ok()
    }

    pub fn save_record(&self, record: &GradeRecord) -> io::Result<()> {
        std::fs::create_dir_all(grades_dir(&self.dir))?;
        let bytes = serde_json::to_vec(record).map_err(io::Error::other)?;
        dp_atomic::write_atomic(&self.grade_path(record.match_id), &bytes)
    }

    /// Match ids that have a grade file, parsable or not.
    pub fn stored_ids(&self) -> Vec<u64> {
        let Ok(entries) = std::fs::read_dir(grades_dir(&self.dir)) else { return Vec::new() };
        let mut ids: Vec<u64> = entries
            .filter_map(|e| {
                let path = e.ok()?.path();
                if path.extension()? != "json" {
                    return None;
                }
                path.file_stem()?.to_str()?.parse().ok()
            })
            .collect();
        ids.sort_unstable();
        ids
    }

    /// Deletes the pre-lobby-grading model cache; grades stay.
    pub fn remove_legacy_model(&self) -> io::Result<()> {
        match std::fs::remove_file(self.model_path()) {
            Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        }
    }

    fn model_path(&self) -> PathBuf {
        self.dir.join(MODEL_FILE)
    }

    fn grade_path(&self, match_id: u64) -> PathBuf {
        grades_dir(&self.dir).join(format!("{match_id}.json"))
    }
}

fn grades_dir(dir: &Path) -> PathBuf {
    dir.join(GRADES_DIR)
}

pub fn gave_up(record: Option<&GradeRecord>) -> bool {
    record.is_some_and(|r| r.failed_runs >= MAX_FAILED_RUNS)
}

pub fn freshness(record: Option<&GradeRecord>, grade_version: &str) -> Freshness {
    let Some(r) = record else { return Freshness::Missing };
    if gave_up(record) {
        return Freshness::Fresh;
    }
    if r.totals_version != LOBBY_TOTALS_VERSION || r.provisional {
        return Freshness::Refetch;
    }
    if r.totals.is_some() && r.grade_version != grade_version {
        return Freshness::Regrade;
    }
    Freshness::Fresh
}

/// Counts one failed fetch run. The third drops the grade, so the match is no longer fetched.
pub fn record_failure(previous: Option<GradeRecord>, match_id: u64) -> GradeRecord {
    let mut r = previous.unwrap_or(GradeRecord {
        match_id,
        provisional: true,
        totals_version: 0,
        grade_version: String::new(),
        totals: None,
        grade: None,
        failed_runs: 0,
    });
    r.failed_runs += 1;
    if r.failed_runs >= MAX_FAILED_RUNS {
        r.totals = None;
        r.grade = None;
    }
    r
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-mvp-store-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    const LOBBY_META: &str = include_str!("../../../../../../crates/ring1/dp-mvp/fixtures/lobby-118862917.json");

    fn lobby_totals() -> LobbyTotals {
        dp_mvp::lobby_totals(&dp_mvp::LobbyMetadata::from_slice(LOBBY_META.as_bytes()).unwrap().match_info)
    }

    fn record(match_id: u64) -> GradeRecord {
        let totals = lobby_totals();
        let grade = dp_mvp::grade_lobby(&totals, &|name: &str| name.contains("stun"));
        GradeRecord {
            match_id,
            provisional: false,
            totals_version: LOBBY_TOTALS_VERSION,
            grade_version: "1:abc".into(),
            totals: Some(totals),
            grade: Some(grade),
            failed_runs: 0,
        }
    }

    #[test]
    fn a_missing_or_old_shape_file_is_missing() {
        assert_eq!(freshness(None, "1:abc"), Freshness::Missing);
        let dir = temp_dir("old-shape");
        std::fs::create_dir_all(dir.join("grades")).unwrap();
        std::fs::write(dir.join("grades").join("5.json"), r#"{"match_id":5,"provisional":false,"grade":null}"#)
            .unwrap();
        let store = Store::new(&dir);
        assert_eq!(store.record(5), None);
        assert_eq!(freshness(store.record(5).as_ref(), "1:abc"), Freshness::Missing);
    }

    #[test]
    fn a_totals_version_mismatch_or_provisional_record_is_refetched() {
        let stale = GradeRecord { totals_version: LOBBY_TOTALS_VERSION + 1, ..record(1) };
        assert_eq!(freshness(Some(&stale), "1:abc"), Freshness::Refetch);
        let provisional = GradeRecord { provisional: true, ..record(1) };
        assert_eq!(freshness(Some(&provisional), "1:abc"), Freshness::Refetch);
    }

    #[test]
    fn a_grade_version_mismatch_regrades_and_a_match_is_fresh() {
        assert_eq!(freshness(Some(&record(1)), "1:abc"), Freshness::Fresh);
        assert_eq!(freshness(Some(&record(1)), "2:abc"), Freshness::Regrade);
        assert_eq!(freshness(Some(&record(1)), "1:def"), Freshness::Regrade);
    }

    #[test]
    fn an_ineligible_record_is_fresh_whatever_the_grade_version() {
        let ineligible = GradeRecord { totals: None, grade: None, ..record(1) };
        assert_eq!(freshness(Some(&ineligible), "9:zzz"), Freshness::Fresh);
    }

    #[test]
    fn three_failed_runs_give_up_and_drop_the_grade() {
        let mut r = record_failure(None, 3);
        assert_eq!((r.failed_runs, gave_up(Some(&r))), (1, false));
        assert_eq!(freshness(Some(&r), "1:abc"), Freshness::Refetch);
        r = record_failure(Some(r), 3);
        r = record_failure(Some(r), 3);
        assert!(gave_up(Some(&r)));
        assert_eq!(freshness(Some(&r), "1:abc"), Freshness::Fresh);
        let held = record_failure(Some(GradeRecord { failed_runs: 2, ..record(4) }), 4);
        assert!(gave_up(Some(&held)) && held.grade.is_none() && held.totals.is_none());
        assert!(!gave_up(None));
    }

    #[test]
    fn records_round_trip_and_ids_are_listed() {
        let dir = temp_dir("records");
        let store = Store::new(&dir);
        assert!(store.stored_ids().is_empty());
        let full = record(7);
        let none = GradeRecord { totals: None, grade: None, ..record(8) };
        store.save_record(&full).unwrap();
        store.save_record(&none).unwrap();
        assert_eq!(store.record(7).as_ref().map(|r| (r.match_id, r.totals.is_some())), Some((7, true)));
        assert_eq!(store.record(8), Some(none));
        assert_eq!(store.stored_ids(), vec![7, 8]);
    }

    #[test]
    fn removing_the_legacy_model_keeps_the_grades() {
        let dir = temp_dir("legacy");
        let store = Store::new(&dir);
        store.remove_legacy_model().unwrap();
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("model.json"), "{}").unwrap();
        assert!(dir.join("model.json").exists());
        store.save_record(&record(7)).unwrap();
        store.remove_legacy_model().unwrap();
        assert!(!dir.join("model.json").exists());
        assert!(dir.join("grades").join("7.json").is_file());
    }
}
