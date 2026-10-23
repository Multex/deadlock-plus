use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::backup::{write_with_backup, WriteError};
use crate::file::{peek_build_id, BuildsFile, FileError, Section, LOCAL_ID_LIMIT};

/// One change to splice into the build file. `base` is the exact blob the draft started from
/// (`None` for a new build); the save refuses when the file no longer holds it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum SaveOp {
    Upsert { section: Section, blob: Vec<u8>, base: Option<Vec<u8>>, hero_class: Option<String> },
    Delete { section: Section, id: u32, base: Option<Vec<u8>> },
    Favourite { blob: Vec<u8> },
    Unfavourite { id: u32 },
    SetLastUsed { hero_class: String, id: u32 },
}

/// A build the file changed since the draft started from `base`. `current` is what the file holds
/// now (`None` once it is gone), `ours` what the save would write (`None` for a delete).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Conflict {
    pub section: Section,
    pub id: u32,
    pub base: Option<Vec<u8>>,
    pub current: Option<Vec<u8>>,
    pub ours: Option<Vec<u8>>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Planned {
    Write { bytes: Vec<u8>, changed: bool },
    Conflict(Vec<Conflict>),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SaveOutcome {
    Written { backup: Option<PathBuf> },
    Unchanged,
    Conflict(Vec<Conflict>),
}

#[derive(Debug)]
pub enum SaveError {
    GameRunning,
    Read(std::io::Error),
    File(FileError),
    Write(WriteError),
}

impl std::fmt::Display for SaveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SaveError::GameRunning => f.write_str("Deadlock is running. The build file was not changed."),
            SaveError::Read(e) => write!(f, "The build file could not be read: {e}"),
            SaveError::File(e) => write!(f, "The build file could not be read: {e}"),
            SaveError::Write(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for SaveError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            SaveError::GameRunning => None,
            SaveError::Read(e) => Some(e),
            SaveError::File(e) => Some(e),
            SaveError::Write(e) => Some(e),
        }
    }
}

impl From<FileError> for SaveError {
    fn from(e: FileError) -> Self {
        SaveError::File(e)
    }
}

/// Applies `ops` in order to the file as it is now (`None` = no file yet). Each op's base is
/// checked against the result of the ops before it, so several queued saves of one build chain.
/// Any conflict means nothing is written.
pub fn plan_save(current: Option<&[u8]>, ops: &[SaveOp]) -> Result<Planned, SaveError> {
    let start = match current {
        Some(bytes) => BuildsFile::parse(bytes)?,
        None => BuildsFile::empty(),
    };
    let mut file = start.clone();
    let mut conflicts = Vec::new();
    for op in ops {
        if let Some(conflict) = check(&file, op)? {
            conflicts.push(conflict);
            continue;
        }
        apply(&mut file, op)?;
    }
    if !conflicts.is_empty() {
        return Ok(Planned::Conflict(conflicts));
    }
    let bytes = file.to_bytes()?;
    // Re-encoding both sides compares content, not compression or KV3 revision.
    let changed = bytes != start.to_bytes()?;
    Ok(Planned::Write { bytes, changed })
}

fn check(file: &BuildsFile, op: &SaveOp) -> Result<Option<Conflict>, FileError> {
    let (section, id, base, ours) = match op {
        SaveOp::Upsert { section, blob, base, .. } => {
            (*section, peek_build_id(blob).ok_or(FileError::NoBuildId)?, base, Some(blob))
        }
        SaveOp::Delete { section, id, base: base @ Some(_) } => (*section, *id, base, None),
        _ => return Ok(None),
    };
    let conflict = |section, current: Option<&[u8]>| Conflict {
        section,
        id,
        base: base.clone(),
        current: current.map(<[u8]>::to_vec),
        ours: ours.cloned(),
    };
    let current = file.get(section, id);
    if current != base.as_deref() {
        // A write that landed before its queue entry was cleared replays as a no-op.
        if current == ours.map(Vec::as_slice) {
            return Ok(None);
        }
        return Ok(Some(conflict(section, current)));
    }
    // Local ids share one space across both sections, so a new id taken in either is a clash.
    if base.is_none() && id < LOCAL_ID_LIMIT {
        for other in [Section::Unpublished, Section::Favorites] {
            if let Some(taken) = file.get(other, id) {
                return Ok(Some(conflict(other, Some(taken))));
            }
        }
    }
    Ok(None)
}

fn apply(file: &mut BuildsFile, op: &SaveOp) -> Result<(), FileError> {
    match op {
        SaveOp::Upsert { section, blob, hero_class, .. } => {
            file.upsert_sorted(*section, blob.clone())?;
            if let Some(hero) = hero_class {
                file.set_last_used(hero, peek_build_id(blob).ok_or(FileError::NoBuildId)?);
            }
        }
        SaveOp::Delete { section, id, .. } => {
            file.remove(*section, *id);
        }
        SaveOp::Favourite { blob } => file.upsert_sorted(Section::Favorites, blob.clone())?,
        SaveOp::Unfavourite { id } => {
            file.remove(Section::Favorites, *id);
        }
        SaveOp::SetLastUsed { hero_class, id } => file.set_last_used(hero_class, *id),
    }
    Ok(())
}

pub fn save_now(
    path: &Path,
    backups_dir: &Path,
    account_id32: u32,
    now: u64,
    ops: &[SaveOp],
) -> Result<SaveOutcome, SaveError> {
    save_with(&crate::paths::game_running_now, path, backups_dir, account_id32, now, ops)
}

/// `save_now` with the game check passed in, so callers can test without depending on Deadlock.
pub fn save_with(
    game_running: &dyn Fn() -> bool,
    path: &Path,
    backups_dir: &Path,
    account_id32: u32,
    now: u64,
    ops: &[SaveOp],
) -> Result<SaveOutcome, SaveError> {
    if game_running() {
        return Err(SaveError::GameRunning);
    }
    let current = match std::fs::read(path) {
        Ok(bytes) => Some(bytes),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(SaveError::Read(e)),
    };
    match plan_save(current.as_deref(), ops)? {
        Planned::Conflict(conflicts) => Ok(SaveOutcome::Conflict(conflicts)),
        Planned::Write { changed: false, .. } => Ok(SaveOutcome::Unchanged),
        Planned::Write { bytes, changed: true } => {
            // The game may have started while we planned; its next write would drop ours.
            if game_running() {
                return Err(SaveError::GameRunning);
            }
            let backup = write_with_backup(path, &bytes, backups_dir, account_id32, now).map_err(SaveError::Write)?;
            Ok(SaveOutcome::Written { backup })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::fs;

    fn varint(mut v: u64, out: &mut Vec<u8>) {
        while v >= 0x80 {
            out.push((v as u8) | 0x80);
            v >>= 7;
        }
        out.push(v as u8);
    }

    /// `HeroBuildResult { 1: CMsgHeroBuild { 1: id, 2: name } }`, enough for `peek_build_id`.
    fn blob(id: u32, name: &str) -> Vec<u8> {
        let mut inner = vec![0x08];
        varint(u64::from(id), &mut inner);
        inner.push(0x12);
        varint(name.len() as u64, &mut inner);
        inner.extend_from_slice(name.as_bytes());
        let mut out = vec![0x0a];
        varint(inner.len() as u64, &mut out);
        out.extend(inner);
        out
    }

    fn file_with(entries: &[(Section, Vec<u8>)]) -> Vec<u8> {
        let mut file = BuildsFile::empty();
        for (section, b) in entries {
            file.upsert_sorted(*section, b.clone()).unwrap();
        }
        file.to_bytes().unwrap()
    }

    fn written(planned: Planned) -> (BuildsFile, bool) {
        match planned {
            Planned::Write { bytes, changed } => (BuildsFile::parse(&bytes).unwrap(), changed),
            Planned::Conflict(c) => panic!("unexpected conflict: {c:?}"),
        }
    }

    fn ids(file: &BuildsFile, section: Section) -> Vec<u32> {
        file.entries(section).iter().map(|b| peek_build_id(b).unwrap()).collect()
    }

    fn upsert(section: Section, blob: Vec<u8>, base: Option<Vec<u8>>, hero: Option<&str>) -> SaveOp {
        SaveOp::Upsert { section, blob, base, hero_class: hero.map(str::to_string) }
    }

    #[test]
    fn a_new_build_is_inserted_sorted_and_becomes_last_used() {
        let current = file_with(&[(Section::Unpublished, blob(1, "a")), (Section::Unpublished, blob(5, "e"))]);
        let op = upsert(Section::Unpublished, blob(3, "c"), None, Some("hero_inferno"));
        let (file, changed) = written(plan_save(Some(&current), &[op]).unwrap());
        assert!(changed);
        assert_eq!(ids(&file, Section::Unpublished), vec![1, 3, 5]);
        assert_eq!(file.get(Section::Unpublished, 3), Some(blob(3, "c").as_slice()));
        assert_eq!(file.last_used("hero_inferno"), Some(3));
    }

    #[test]
    fn an_edit_whose_base_matches_replaces_the_build() {
        let current = file_with(&[(Section::Unpublished, blob(2, "old"))]);
        let op = upsert(Section::Unpublished, blob(2, "new"), Some(blob(2, "old")), None);
        let (file, changed) = written(plan_save(Some(&current), &[op]).unwrap());
        assert!(changed);
        assert_eq!(file.entries(Section::Unpublished), vec![blob(2, "new").as_slice()]);
    }

    #[test]
    fn an_edit_of_a_build_changed_in_game_is_a_conflict_with_both_versions() {
        let current = file_with(&[(Section::Unpublished, blob(2, "in game"))]);
        let op = upsert(Section::Unpublished, blob(2, "ours"), Some(blob(2, "old")), Some("hero_inferno"));
        assert_eq!(
            plan_save(Some(&current), &[op]).unwrap(),
            Planned::Conflict(vec![Conflict {
                section: Section::Unpublished,
                id: 2,
                base: Some(blob(2, "old")),
                current: Some(blob(2, "in game")),
                ours: Some(blob(2, "ours")),
            }])
        );
    }

    #[test]
    fn an_edit_of_a_build_deleted_in_game_is_a_conflict() {
        let current = file_with(&[(Section::Unpublished, blob(1, "other"))]);
        let op = upsert(Section::Unpublished, blob(2, "ours"), Some(blob(2, "old")), None);
        let Planned::Conflict(conflicts) = plan_save(Some(&current), &[op]).unwrap() else { panic!("no conflict") };
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].current, None);
    }

    #[test]
    fn a_new_build_whose_id_was_taken_in_game_is_a_conflict() {
        let current = file_with(&[(Section::Favorites, blob(4, "made in game"))]);
        let op = upsert(Section::Unpublished, blob(4, "ours"), None, None);
        let Planned::Conflict(conflicts) = plan_save(Some(&current), &[op]).unwrap() else { panic!("no conflict") };
        assert_eq!(conflicts[0].section, Section::Favorites);
        assert_eq!(conflicts[0].current, Some(blob(4, "made in game")));
        assert_eq!(conflicts[0].ours, Some(blob(4, "ours")));
    }

    #[test]
    fn an_upsert_already_in_the_file_is_not_a_conflict() {
        let current = file_with(&[(Section::Unpublished, blob(2, "ours"))]);
        let op = upsert(Section::Unpublished, blob(2, "ours"), Some(blob(2, "old")), None);
        let (file, changed) = written(plan_save(Some(&current), &[op]).unwrap());
        assert!(!changed);
        assert_eq!(file.get(Section::Unpublished, 2), Some(blob(2, "ours").as_slice()));
    }

    #[test]
    fn a_delete_of_an_already_gone_build_is_not_a_conflict() {
        let current = file_with(&[(Section::Unpublished, blob(1, "other"))]);
        let op = SaveOp::Delete { section: Section::Unpublished, id: 2, base: Some(blob(2, "a")) };
        assert!(!written(plan_save(Some(&current), &[op]).unwrap()).1);
    }

    #[test]
    fn an_edit_over_a_third_version_still_conflicts() {
        let current = file_with(&[(Section::Unpublished, blob(2, "third"))]);
        let op = upsert(Section::Unpublished, blob(2, "ours"), Some(blob(2, "old")), None);
        assert!(matches!(plan_save(Some(&current), &[op]).unwrap(), Planned::Conflict(_)));
    }

    #[test]
    fn a_later_op_is_checked_against_the_earlier_ops_result() {
        let current = file_with(&[(Section::Unpublished, blob(2, "v0"))]);
        let ops = [
            upsert(Section::Unpublished, blob(2, "v1"), Some(blob(2, "v0")), None),
            upsert(Section::Unpublished, blob(2, "v2"), Some(blob(2, "v1")), None),
        ];
        let (file, _) = written(plan_save(Some(&current), &ops).unwrap());
        assert_eq!(file.get(Section::Unpublished, 2), Some(blob(2, "v2").as_slice()));
    }

    #[test]
    fn a_missing_file_is_created_in_the_games_shape() {
        let op = upsert(Section::Unpublished, blob(1, "first"), None, Some("hero_haze"));
        let (file, changed) = written(plan_save(None, &[op]).unwrap());
        assert!(changed);
        assert_eq!(ids(&file, Section::Unpublished), vec![1]);
        assert!(file.entries(Section::Favorites).is_empty());
        assert_eq!(file.last_used("hero_haze"), Some(1));
    }

    #[test]
    fn untouched_entries_stay_byte_equal() {
        let others = [
            (Section::Favorites, blob(1500, "fav")),
            (Section::Unpublished, blob(1, "keep")),
            (Section::SavedLastUsed, blob(2000, "published edit")),
        ];
        let current = file_with(&others);
        let op = upsert(Section::Unpublished, blob(2, "new"), None, None);
        let (file, _) = written(plan_save(Some(&current), &[op]).unwrap());
        for (section, b) in &others {
            assert_eq!(file.get(*section, peek_build_id(b).unwrap()), Some(b.as_slice()));
        }
    }

    #[test]
    fn an_edit_of_a_published_build_goes_to_saved_last_used() {
        let current = file_with(&[(Section::SavedLastUsed, blob(2000, "old"))]);
        let op = upsert(Section::SavedLastUsed, blob(2000, "new"), Some(blob(2000, "old")), Some("hero_haze"));
        let (file, _) = written(plan_save(Some(&current), &[op]).unwrap());
        assert_eq!(file.get(Section::SavedLastUsed, 2000), Some(blob(2000, "new").as_slice()));
        assert_eq!(file.last_used("hero_haze"), Some(2000));
    }

    #[test]
    fn delete_removes_the_build() {
        let current = file_with(&[(Section::Unpublished, blob(1, "a")), (Section::Unpublished, blob(2, "b"))]);
        let op = SaveOp::Delete { section: Section::Unpublished, id: 1, base: Some(blob(1, "a")) };
        let (file, changed) = written(plan_save(Some(&current), &[op]).unwrap());
        assert!(changed);
        assert_eq!(ids(&file, Section::Unpublished), vec![2]);
    }

    #[test]
    fn delete_of_a_build_changed_in_game_is_a_conflict() {
        let current = file_with(&[(Section::Unpublished, blob(1, "edited in game"))]);
        let op = SaveOp::Delete { section: Section::Unpublished, id: 1, base: Some(blob(1, "a")) };
        let Planned::Conflict(conflicts) = plan_save(Some(&current), &[op]).unwrap() else { panic!("no conflict") };
        assert_eq!(conflicts[0].ours, None);
        assert_eq!(conflicts[0].current, Some(blob(1, "edited in game")));
    }

    #[test]
    fn favourite_and_unfavourite_write_the_local_favorites_entry() {
        let current = file_with(&[(Section::Favorites, blob(1200, "x"))]);
        let (file, _) = written(plan_save(Some(&current), &[SaveOp::Favourite { blob: blob(1100, "y") }]).unwrap());
        assert_eq!(ids(&file, Section::Favorites), vec![1100, 1200]);
        let (file, changed) = written(plan_save(Some(&current), &[SaveOp::Unfavourite { id: 1200 }]).unwrap());
        assert!(changed);
        assert!(file.entries(Section::Favorites).is_empty());
    }

    #[test]
    fn set_last_used_points_the_hero_at_the_build() {
        let current = file_with(&[]);
        let op = SaveOp::SetLastUsed { hero_class: "hero_wraith".into(), id: 7 };
        let (file, changed) = written(plan_save(Some(&current), &[op]).unwrap());
        assert!(changed);
        assert_eq!(file.last_used("hero_wraith"), Some(7));
    }

    #[test]
    fn a_plan_that_changes_nothing_is_not_a_change() {
        let current = file_with(&[(Section::Unpublished, blob(1, "a"))]);
        let op = upsert(Section::Unpublished, blob(1, "a"), Some(blob(1, "a")), None);
        assert!(!written(plan_save(Some(&current), &[op]).unwrap()).1);
        assert!(!written(plan_save(Some(&current), &[SaveOp::Unfavourite { id: 9 }]).unwrap()).1);
        assert!(!written(plan_save(None, &[]).unwrap()).1);
    }

    #[test]
    fn save_ops_serialize_sections_by_their_file_key() {
        let ops = vec![
            SaveOp::Upsert {
                section: Section::SavedLastUsed,
                blob: vec![1, 2],
                base: None,
                hero_class: Some("h".into()),
            },
            SaveOp::Delete { section: Section::Unpublished, id: 3, base: Some(vec![4]) },
        ];
        let json = serde_json::to_string(&ops).unwrap();
        assert_eq!(
            json,
            r#"[{"Upsert":{"section":"SavedLastUsed","blob":[1,2],"base":null,"hero_class":"h"}},{"Delete":{"section":"Unpublished","id":3,"base":[4]}}]"#
        );
        assert_eq!(serde_json::from_str::<Vec<SaveOp>>(&json).unwrap(), ops);
        let conflict = Conflict { section: Section::Favorites, id: 1, base: None, current: None, ours: None };
        let json = serde_json::to_string(&conflict).unwrap();
        assert_eq!(json, r#"{"section":"Favorites","id":1,"base":null,"current":null,"ours":null}"#);
        assert_eq!(serde_json::from_str::<Conflict>(&json).unwrap(), conflict);
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-save-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn save_writes_the_planned_file_and_keeps_a_backup() {
        let dir = temp_dir("write");
        let path = dir.join("cached_hero_builds.kv3");
        let original = file_with(&[(Section::Unpublished, blob(1, "a"))]);
        fs::write(&path, &original).unwrap();
        let op = upsert(Section::Unpublished, blob(2, "b"), None, None);
        let outcome = save_with(&|| false, &path, &dir.join("backups"), 7, 42, &[op]).unwrap();
        let SaveOutcome::Written { backup: Some(backup) } = outcome else { panic!("not written: {outcome:?}") };
        assert_eq!(fs::read(&backup).unwrap(), original);
        assert_eq!(ids(&BuildsFile::parse(&fs::read(&path).unwrap()).unwrap(), Section::Unpublished), vec![1, 2]);
    }

    #[test]
    fn save_creates_a_missing_file() {
        let dir = temp_dir("create");
        let path = dir.join("cached_hero_builds.kv3");
        let op = upsert(Section::Unpublished, blob(1, "a"), None, None);
        let outcome = save_with(&|| false, &path, &dir.join("backups"), 7, 1, &[op]).unwrap();
        assert_eq!(outcome, SaveOutcome::Written { backup: None });
        assert_eq!(ids(&BuildsFile::parse(&fs::read(&path).unwrap()).unwrap(), Section::Unpublished), vec![1]);
    }

    #[test]
    fn save_refuses_while_the_game_runs_and_leaves_the_file_alone() {
        let dir = temp_dir("running");
        let path = dir.join("cached_hero_builds.kv3");
        let original = file_with(&[(Section::Unpublished, blob(1, "a"))]);
        fs::write(&path, &original).unwrap();
        let op = upsert(Section::Unpublished, blob(2, "b"), None, None);
        let result = save_with(&|| true, &path, &dir.join("backups"), 7, 1, std::slice::from_ref(&op));
        assert!(matches!(result, Err(SaveError::GameRunning)));
        // Closed at the first check, started before the write.
        let calls = Cell::new(0);
        let late = || {
            calls.set(calls.get() + 1);
            calls.get() > 1
        };
        let result = save_with(&late, &path, &dir.join("backups"), 7, 1, &[op]);
        assert!(matches!(result, Err(SaveError::GameRunning)));
        assert_eq!(fs::read(&path).unwrap(), original);
        assert!(!dir.join("backups").exists());
    }

    #[test]
    fn save_leaves_the_file_alone_on_a_conflict_or_no_change() {
        let dir = temp_dir("noop");
        let path = dir.join("cached_hero_builds.kv3");
        let original = file_with(&[(Section::Unpublished, blob(1, "in game"))]);
        fs::write(&path, &original).unwrap();
        let conflict = upsert(Section::Unpublished, blob(1, "ours"), Some(blob(1, "old")), None);
        let outcome = save_with(&|| false, &path, &dir.join("backups"), 7, 1, &[conflict]).unwrap();
        assert!(matches!(outcome, SaveOutcome::Conflict(_)));
        let same = upsert(Section::Unpublished, blob(1, "in game"), Some(blob(1, "in game")), None);
        assert_eq!(save_with(&|| false, &path, &dir.join("backups"), 7, 1, &[same]).unwrap(), SaveOutcome::Unchanged);
        assert_eq!(fs::read(&path).unwrap(), original);
        assert!(!dir.join("backups").exists());
    }
}
