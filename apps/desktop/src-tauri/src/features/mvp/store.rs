use std::io;
use std::path::{Path, PathBuf};

use dp_mvp::{MatchGrade, ModelCache, MODEL_VERSION};
use serde::{Deserialize, Serialize};

/// Folder under the app data directory: `model.json` and one `grades/<match id>.json` per checked match.
pub const MVP_DIR: &str = "mvp";
const MODEL_FILE: &str = "model.json";
const GRADES_DIR: &str = "grades";

/// What a check of one match left behind. Kept for good: a later model refresh never re-grades it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StoredGrade {
    pub match_id: u64,
    /// Graded from the game-captured detail; replaced once the API has the match.
    pub provisional: bool,
    /// `None`: the match is not gradable (mode, outcome, length or player count).
    pub grade: Option<MatchGrade>,
}

/// One file per match, so each write is small and atomic however many matches are stored.
pub struct Store {
    dir: PathBuf,
}

impl Store {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    /// A cache from an older model version is treated as missing: its tables do not fit the current math.
    pub fn load_model(&self) -> Option<ModelCache> {
        let bytes = std::fs::read(self.model_path()).ok()?;
        match serde_json::from_slice::<ModelCache>(&bytes) {
            Ok(model) => usable(&model).then_some(model),
            Err(e) => {
                log::warn!("match grade model is unreadable and will be rebuilt: {e}");
                None
            }
        }
    }

    /// Replaces the model whole or not at all.
    pub fn save_model(&self, model: &ModelCache) -> io::Result<()> {
        std::fs::create_dir_all(&self.dir)?;
        dp_atomic::write_atomic(&self.model_path(), &serde_json::to_vec(model).map_err(io::Error::other)?)
    }

    pub fn grade(&self, match_id: u64) -> Option<StoredGrade> {
        let bytes = std::fs::read(self.grade_path(match_id)).ok()?;
        serde_json::from_slice(&bytes).ok()
    }

    pub fn save_grade(&self, stored: &StoredGrade) -> io::Result<()> {
        std::fs::create_dir_all(grades_dir(&self.dir))?;
        let bytes = serde_json::to_vec(stored).map_err(io::Error::other)?;
        dp_atomic::write_atomic(&self.grade_path(stored.match_id), &bytes)
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

/// Whether the background run still has work on a match: never checked, or only graded from the game's copy.
pub fn needs_grade(stored: Option<&StoredGrade>) -> bool {
    stored.is_none_or(|s| s.provisional)
}

pub fn usable(model: &ModelCache) -> bool {
    model.model_version == MODEL_VERSION
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-mvp-store-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    const SAMPLE: &str = include_str!("../../../../../../crates/ring1/dp-mvp/fixtures/sample.json");

    /// A real model built from the pure crate's recorded sample.
    pub(crate) fn model() -> ModelCache {
        let sample = dp_mvp::Sample::from_matches(&dp_mvp::parse_matches(SAMPLE).unwrap()).unwrap();
        dp_mvp::build(&sample, 1_792_196_050, sample.rows.len()).expect("fixture sample builds")
    }

    fn grade(match_id: u64) -> MatchGrade {
        MatchGrade {
            match_id,
            model_version: MODEL_VERSION,
            built_at: 1,
            leaver: false,
            paths_checked: true,
            players: Vec::new(),
        }
    }

    #[test]
    fn the_model_round_trips_and_a_missing_one_is_none() {
        let store = Store::new(temp_dir("model"));
        assert_eq!(store.load_model(), None);
        let saved = model();
        store.save_model(&saved).unwrap();
        // JSON floats may move in the last bit, so compare the shape and the values within a tolerance.
        let loaded = store.load_model().expect("saved model loads");
        assert_eq!((loaded.built_at, &loaded.sample), (saved.built_at, &saved.sample));
        assert_eq!(loaded.heroes.keys().collect::<Vec<_>>(), saved.heroes.keys().collect::<Vec<_>>());
        assert_eq!(loaded.calibration.len(), saved.calibration.len());
        assert!(loaded.calibration.iter().zip(&saved.calibration).all(|(a, b)| (a - b).abs() < 1e-9));
    }

    #[test]
    fn a_corrupt_or_older_model_is_none() {
        let dir = temp_dir("old-model");
        let store = Store::new(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("model.json"), "{ not json").unwrap();
        assert_eq!(store.load_model(), None);
        let old = ModelCache { model_version: MODEL_VERSION + 1, ..model() };
        store.save_model(&old).unwrap();
        assert_eq!(store.load_model(), None);
    }

    #[test]
    fn grades_land_one_file_per_match_and_read_back() {
        let dir = temp_dir("grades");
        let store = Store::new(&dir);
        assert_eq!(store.grade(7), None);
        let graded = StoredGrade { match_id: 7, provisional: false, grade: Some(grade(7)) };
        let skipped = StoredGrade { match_id: 8, provisional: false, grade: None };
        store.save_grade(&graded).unwrap();
        store.save_grade(&skipped).unwrap();
        assert_eq!(store.grade(7), Some(graded));
        assert_eq!(store.grade(8), Some(skipped));
        assert!(dir.join("grades").join("7.json").is_file());
        assert_eq!(std::fs::read_dir(dir.join("grades")).unwrap().count(), 2);
    }

    #[test]
    fn a_corrupt_grade_file_reads_as_unchecked() {
        let dir = temp_dir("bad-grade");
        std::fs::create_dir_all(dir.join("grades")).unwrap();
        std::fs::write(dir.join("grades").join("9.json"), "[").unwrap();
        assert_eq!(Store::new(&dir).grade(9), None);
    }

    #[test]
    fn only_unchecked_or_provisional_matches_need_a_grade() {
        assert!(needs_grade(None));
        assert!(needs_grade(Some(&StoredGrade { match_id: 1, provisional: true, grade: Some(grade(1)) })));
        assert!(!needs_grade(Some(&StoredGrade { match_id: 1, provisional: false, grade: Some(grade(1)) })));
        assert!(!needs_grade(Some(&StoredGrade { match_id: 1, provisional: false, grade: None })));
    }
}
