use std::collections::HashMap;
use std::fmt;
use std::io;
use std::path::{Path, PathBuf};

use dp_versioned::{Migration, ReadError};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::file::{peek_build_id, BuildsFile, FileError, Section, LOCAL_ID_LIMIT};
use crate::history::{self, Version};
use crate::save::{save_with, Conflict, SaveError, SaveOp, SaveOutcome};
use crate::wire::{HeroBuildResult, WireError};

pub const QUEUE_FILE: &str = "queue.json";
const MIGRATIONS: &[Migration] = &[];

/// A "Save to game" that waits for Deadlock to close.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct QueuedSave {
    pub id: String,
    pub queued_at: u64,
    /// The build's name, shown in the UI and kept as the history version's name.
    pub label: String,
    pub build_id: u32,
    pub ops: Vec<SaveOp>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct QueuedSaveView {
    pub id: String,
    pub queued_at: u64,
    pub label: String,
    pub build_id: u32,
}

impl From<&QueuedSave> for QueuedSaveView {
    fn from(save: &QueuedSave) -> Self {
        Self { id: save.id.clone(), queued_at: save.queued_at, label: save.label.clone(), build_id: save.build_id }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QueuedConflict {
    pub save_id: String,
    pub conflict: Conflict,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Choice {
    KeepOurs,
    KeepGame,
}

#[derive(Debug)]
pub enum FlushReport {
    Nothing,
    /// The queue was written (or the file already held it) and those saves left the queue.
    Saved {
        backup: Option<PathBuf>,
        saves: Vec<QueuedSave>,
    },
    Conflict(Vec<QueuedConflict>),
    GameRunning,
    Failed(SaveError),
}

#[derive(Debug)]
pub enum QueueError {
    Read(ReadError),
    Io(io::Error),
    File(FileError),
    /// A queued build's blob would not decode, so it could not be given a new id.
    Build(WireError),
    NoLocalId,
}

impl fmt::Display for QueueError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Read(e) => write!(f, "{e}"),
            Self::Io(e) => write!(f, "{e}"),
            Self::File(e) => write!(f, "{e}"),
            Self::Build(e) => write!(f, "{e}"),
            Self::NoLocalId => f.write_str("no local build id is free"),
        }
    }
}

impl std::error::Error for QueueError {}

/// Adds `save` and returns the id it was given. A newer save of a build replaces the last queued one
/// when it was made from what that one writes; its ops then carry the older save's bases, so the
/// file goes straight from what the game had to the newest draft and a conflict shows once.
pub fn enqueue(dir: &Path, account: u32, mut save: QueuedSave) -> Result<String, QueueError> {
    let path = queue_path(dir, account);
    let mut saves = load(&path)?;
    // Picked before a replaced save leaves, so its id is never handed out again.
    save.id = fresh_id(&saves, save.queued_at);
    if let Some(at) = saves.iter().rposition(|s| s.build_id == save.build_id) {
        if let Some(ops) = merged(&saves[at], &save) {
            saves.remove(at);
            save.ops = ops;
        }
    }
    let id = save.id.clone();
    saves.push(save);
    store(&path, &saves)?;
    Ok(id)
}

pub fn pending(dir: &Path, account: u32) -> Result<Vec<QueuedSave>, QueueError> {
    load(&queue_path(dir, account))
}

pub fn cancel(dir: &Path, account: u32, id: &str) -> Result<bool, QueueError> {
    let path = queue_path(dir, account);
    let mut saves = load(&path)?;
    let before = saves.len();
    saves.retain(|s| s.id != id);
    if saves.len() == before {
        return Ok(false);
    }
    store(&path, &saves)?;
    Ok(true)
}

/// Writes every queued save in one `save_with` call: one re-read, one write, one backup. Anything
/// but a successful write keeps the whole queue. History failures are logged, never fatal: the
/// build file already holds the saves.
pub fn flush(
    dir: &Path,
    account: u32,
    path: &Path,
    backups_dir: &Path,
    now: u64,
    game_running: &dyn Fn() -> bool,
    history_dir: &Path,
) -> Result<FlushReport, QueueError> {
    let queue = queue_path(dir, account);
    let saves = load(&queue)?;
    if saves.is_empty() {
        return Ok(FlushReport::Nothing);
    }
    let ops: Vec<SaveOp> = saves.iter().flat_map(|s| s.ops.iter().cloned()).collect();
    let backup = match save_with(game_running, path, backups_dir, account, now, &ops) {
        Ok(SaveOutcome::Written { backup }) => backup,
        Ok(SaveOutcome::Unchanged) => None,
        Ok(SaveOutcome::Conflict(conflicts)) => return Ok(FlushReport::Conflict(attribute(&saves, conflicts))),
        Err(SaveError::GameRunning) => return Ok(FlushReport::GameRunning),
        Err(e) => return Ok(FlushReport::Failed(e)),
    };
    for save in &saves {
        record_history(history_dir, account, now, save);
    }
    // Re-read so a save queued while the file was written stays queued.
    let mut left = load(&queue)?;
    left.retain(|s| !saves.iter().any(|done| done.id == s.id));
    store(&queue, &left)?;
    Ok(FlushReport::Saved { backup, saves })
}

/// `KeepOurs` points the save's bases at what the file holds now (after the saves queued before it),
/// so the next flush writes ours over the game's version. A new build whose local id the game has
/// since taken gets a free id instead, so both builds survive. Returns false for an unknown id.
pub fn resolve_conflict(dir: &Path, account: u32, path: &Path, id: &str, choice: Choice) -> Result<bool, QueueError> {
    let queue = queue_path(dir, account);
    let mut saves = load(&queue)?;
    let Some(at) = saves.iter().position(|s| s.id == id) else { return Ok(false) };
    match choice {
        Choice::KeepGame => {
            saves.remove(at);
        }
        Choice::KeepOurs => {
            let file = match std::fs::read(path) {
                Ok(bytes) => BuildsFile::parse(&bytes).map_err(QueueError::File)?,
                Err(e) if e.kind() == io::ErrorKind::NotFound => BuildsFile::empty(),
                Err(e) => return Err(QueueError::Io(e)),
            };
            let mut state: HashMap<Key, Option<Vec<u8>>> = HashMap::new();
            for op in saves[..at].iter().flat_map(|s| &s.ops) {
                if let Some((key, result)) = writes(op) {
                    state.insert(key, result);
                }
            }
            renumber_taken_new_builds(&file, &state, &mut saves, at)?;
            for op in &mut saves[at].ops {
                if let Some((key, base)) = guard_mut(op) {
                    *base = state.get(&key).cloned().unwrap_or_else(|| file.get(key.0, key.1).map(<[u8]>::to_vec));
                }
                if let Some((key, result)) = writes(op) {
                    state.insert(key, result);
                }
            }
        }
    }
    store(&queue, &saves)?;
    Ok(true)
}

type Key = (Section, u32);

/// Gives each new local build in `saves[at]` whose id is held by another build a fresh id, above
/// every local id in the file and in the queue, as the app picks one for a new build.
fn renumber_taken_new_builds(
    file: &BuildsFile,
    state: &HashMap<Key, Option<Vec<u8>>>,
    saves: &mut [QueuedSave],
    at: usize,
) -> Result<(), QueueError> {
    let holder = |key: Key| state.get(&key).cloned().unwrap_or_else(|| file.get(key.0, key.1).map(<[u8]>::to_vec));
    let mut renamed: HashMap<u32, u32> = HashMap::new();
    let mut next = None;
    for op in &saves[at].ops {
        let SaveOp::Upsert { section, blob, base: None, .. } = op else { continue };
        let Some(id) = peek_build_id(blob).filter(|&id| id < LOCAL_ID_LIMIT) else { continue };
        // Already written by an earlier flush whose queue entry was not cleared.
        if holder((*section, id)).as_ref() == Some(blob) || renamed.contains_key(&id) {
            continue;
        }
        if [Section::Unpublished, Section::Favorites].iter().all(|&s| holder((s, id)).is_none()) {
            continue;
        }
        let fresh = match next {
            Some(n) => n,
            None => first_free_local_id(file, saves).ok_or(QueueError::NoLocalId)?,
        };
        if fresh >= LOCAL_ID_LIMIT {
            return Err(QueueError::NoLocalId);
        }
        renamed.insert(id, fresh);
        next = Some(fresh + 1);
    }
    if renamed.is_empty() {
        return Ok(());
    }
    let save = &mut saves[at];
    for op in &mut save.ops {
        match op {
            SaveOp::Upsert { blob, .. } | SaveOp::Favourite { blob } => {
                if let Some(&fresh) = peek_build_id(blob).and_then(|id| renamed.get(&id)) {
                    *blob = with_build_id(blob, fresh)?;
                }
            }
            SaveOp::SetLastUsed { id, .. } => {
                if let Some(&fresh) = renamed.get(id) {
                    *id = fresh;
                }
            }
            SaveOp::Delete { .. } | SaveOp::Unfavourite { .. } => {}
        }
    }
    if let Some(&fresh) = renamed.get(&save.build_id) {
        save.build_id = fresh;
    }
    Ok(())
}

fn first_free_local_id(file: &BuildsFile, saves: &[QueuedSave]) -> Option<u32> {
    let from_file = file.next_local_id()?;
    let queued = saves
        .iter()
        .flat_map(|s| &s.ops)
        .filter_map(|op| match op {
            SaveOp::Upsert { blob, .. } | SaveOp::Favourite { blob } => peek_build_id(blob),
            _ => None,
        })
        .filter(|&id| id < LOCAL_ID_LIMIT)
        .max();
    match queued {
        Some(id) => Some(from_file.max(id + 1)),
        None => Some(from_file),
    }
}

fn with_build_id(blob: &[u8], id: u32) -> Result<Vec<u8>, QueueError> {
    let mut build = HeroBuildResult::decode(blob).map_err(QueueError::Build)?;
    build.hero_build.get_or_insert_with(Default::default).hero_build_id = Some(id);
    Ok(build.encode())
}

fn load(path: &Path) -> Result<Vec<QueuedSave>, QueueError> {
    Ok(dp_versioned::read(path, MIGRATIONS).map_err(QueueError::Read)?.unwrap_or_default())
}

fn store(path: &Path, saves: &[QueuedSave]) -> Result<(), QueueError> {
    dp_versioned::write(path, MIGRATIONS, &saves).map_err(QueueError::Io)
}

fn fresh_id(saves: &[QueuedSave], queued_at: u64) -> String {
    (0u32..)
        .map(|n| format!("{queued_at}-{n}"))
        .find(|id| saves.iter().all(|s| &s.id != id))
        .expect("a queue holds fewer than u32::MAX saves")
}

/// The build an op's base is checked against, as `plan_save` checks it.
fn guard(op: &SaveOp) -> Option<(Key, &Option<Vec<u8>>)> {
    match op {
        SaveOp::Upsert { section, blob, base, .. } => Some(((*section, peek_build_id(blob)?), base)),
        SaveOp::Delete { section, id, base } if base.is_some() => Some(((*section, *id), base)),
        _ => None,
    }
}

fn guard_mut(op: &mut SaveOp) -> Option<(Key, &mut Option<Vec<u8>>)> {
    match op {
        SaveOp::Upsert { section, blob, base, .. } => Some(((*section, peek_build_id(blob)?), base)),
        SaveOp::Delete { section, id, base } if base.is_some() => Some(((*section, *id), base)),
        _ => None,
    }
}

/// The entry an op leaves behind (`None` = removed).
fn writes(op: &SaveOp) -> Option<(Key, Option<Vec<u8>>)> {
    match op {
        SaveOp::Upsert { section, blob, .. } => Some(((*section, peek_build_id(blob)?), Some(blob.clone()))),
        SaveOp::Delete { section, id, .. } => Some(((*section, *id), None)),
        SaveOp::Favourite { blob } => Some(((Section::Favorites, peek_build_id(blob)?), Some(blob.clone()))),
        SaveOp::Unfavourite { id } => Some(((Section::Favorites, *id), None)),
        SaveOp::SetLastUsed { .. } => None,
    }
}

/// `newer`'s ops rebased onto `older`'s bases, when every build `older` checks is checked by `newer`
/// against exactly what `older` writes. Unchecked ops of `older` run first and are kept.
fn merged(older: &QueuedSave, newer: &QueuedSave) -> Option<Vec<SaveOp>> {
    let mut first_base: HashMap<Key, Option<Vec<u8>>> = HashMap::new();
    let mut result: HashMap<Key, Option<Vec<u8>>> = HashMap::new();
    for op in &older.ops {
        if let Some((key, base)) = guard(op) {
            first_base.entry(key).or_insert_with(|| base.clone());
        }
        if let Some((key, written)) = writes(op) {
            result.insert(key, written);
        }
    }
    if first_base.is_empty() {
        return None;
    }
    let newer_bases: HashMap<Key, &Option<Vec<u8>>> = newer.ops.iter().filter_map(guard).collect();
    let chains = first_base.keys().all(|key| newer_bases.get(key).is_some_and(|base| result.get(key) == Some(*base)));
    if !chains {
        return None;
    }
    let mut ops: Vec<SaveOp> = older.ops.iter().filter(|op| guard(op).is_none()).cloned().collect();
    for mut op in newer.ops.iter().cloned() {
        if let Some((key, base)) = guard_mut(&mut op) {
            if let Some(original) = first_base.get(&key) {
                *base = original.clone();
            }
        }
        ops.push(op);
    }
    Some(ops)
}

fn attribute(saves: &[QueuedSave], conflicts: Vec<Conflict>) -> Vec<QueuedConflict> {
    conflicts
        .into_iter()
        .map(|conflict| {
            let save_id = saves
                .iter()
                .find(|s| s.ops.iter().any(|op| raised(op, &conflict)))
                .map(|s| s.id.clone())
                .unwrap_or_default();
            QueuedConflict { save_id, conflict }
        })
        .collect()
}

/// A conflict carries the op's own base and blob, which pick out the op that raised it.
fn raised(op: &SaveOp, conflict: &Conflict) -> bool {
    match op {
        SaveOp::Upsert { blob, base, .. } => conflict.ours.as_ref() == Some(blob) && *base == conflict.base,
        SaveOp::Delete { id, base, .. } => conflict.ours.is_none() && *id == conflict.id && *base == conflict.base,
        _ => false,
    }
}

fn record_history(history_dir: &Path, account: u32, now: u64, save: &QueuedSave) {
    for op in &save.ops {
        let result = match op {
            SaveOp::Upsert { blob, .. } => match peek_build_id(blob) {
                Some(id) => history::record(
                    history_dir,
                    account,
                    id,
                    Version { saved_at: now, blob: blob.clone(), name: save.label.clone(), note: None },
                ),
                None => Ok(()),
            },
            SaveOp::Delete { id, .. } => history::forget(history_dir, account, *id),
            _ => Ok(()),
        };
        if let Err(e) = result {
            log::warn!("build history for queued save {} not updated: {e}", save.id);
        }
    }
}

fn queue_path(dir: &Path, account: u32) -> PathBuf {
    dir.join(account.to_string()).join(QUEUE_FILE)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backup::list_backups;
    use crate::wire::HeroBuild;
    use std::cell::Cell;
    use std::fs;

    const ACCOUNT: u32 = 7;

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

    struct Env {
        dir: PathBuf,
        file: PathBuf,
        backups: PathBuf,
        history: PathBuf,
    }

    impl Env {
        fn new(name: &str) -> Self {
            let root = std::env::temp_dir().join(format!("deadlock-plus-queue-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&root);
            fs::create_dir_all(&root).unwrap();
            Env {
                dir: root.join("queue"),
                file: root.join("cached_hero_builds.kv3"),
                backups: root.join("backups"),
                history: root.join("history"),
            }
        }

        fn write_file(&self, entries: &[(Section, Vec<u8>)]) {
            let mut file = BuildsFile::empty();
            for (section, b) in entries {
                file.upsert_sorted(*section, b.clone()).unwrap();
            }
            fs::write(&self.file, file.to_bytes().unwrap()).unwrap();
        }

        fn read_file(&self) -> BuildsFile {
            BuildsFile::parse(&fs::read(&self.file).unwrap()).unwrap()
        }

        fn flush_with(&self, now: u64, game_running: &dyn Fn() -> bool) -> FlushReport {
            flush(&self.dir, ACCOUNT, &self.file, &self.backups, now, game_running, &self.history).unwrap()
        }

        fn flush(&self, now: u64) -> FlushReport {
            self.flush_with(now, &|| false)
        }

        fn pending(&self) -> Vec<QueuedSave> {
            pending(&self.dir, ACCOUNT).unwrap()
        }

        fn enqueue(&self, save: QueuedSave) -> String {
            enqueue(&self.dir, ACCOUNT, save).unwrap()
        }
    }

    fn edit(id: u32, label: &str, ours: Vec<u8>, base: Option<Vec<u8>>) -> QueuedSave {
        QueuedSave {
            id: String::new(),
            queued_at: 100,
            label: label.into(),
            build_id: id,
            ops: vec![SaveOp::Upsert { section: Section::Unpublished, blob: ours, base, hero_class: None }],
        }
    }

    fn labels(saves: &[QueuedSave]) -> Vec<&str> {
        saves.iter().map(|s| s.label.as_str()).collect()
    }

    #[test]
    fn enqueue_pending_and_cancel_keep_the_order() {
        let env = Env::new("order");
        let a = env.enqueue(edit(1, "a", blob(1, "a"), None));
        let b = env.enqueue(edit(2, "b", blob(2, "b"), None));
        let c = env.enqueue(edit(3, "c", blob(3, "c"), None));
        assert_eq!(labels(&env.pending()), vec!["a", "b", "c"]);
        assert_eq!(env.pending().iter().map(|s| s.id.clone()).collect::<Vec<_>>(), vec![a.clone(), b.clone(), c]);
        assert!(cancel(&env.dir, ACCOUNT, &b).unwrap());
        assert!(!cancel(&env.dir, ACCOUNT, &b).unwrap());
        assert_eq!(labels(&env.pending()), vec!["a", "c"]);
        let d = env.enqueue(edit(4, "d", blob(4, "d"), None));
        assert_ne!(d, a);
        assert_eq!(labels(&env.pending()), vec!["a", "c", "d"]);
    }

    #[test]
    fn the_queue_is_stored_per_account_and_survives_a_reopen() {
        let env = Env::new("persist");
        let save = edit(1, "a", blob(1, "a"), Some(blob(1, "old")));
        let id = env.enqueue(save.clone());
        assert!(queue_path(&env.dir, ACCOUNT).exists());
        assert!(pending(&env.dir, ACCOUNT + 1).unwrap().is_empty());
        let stored = env.pending();
        assert_eq!(stored, vec![QueuedSave { id: id.clone(), ..save }]);
        assert_eq!(
            QueuedSaveView::from(&stored[0]),
            QueuedSaveView { id, queued_at: 100, label: "a".into(), build_id: 1 }
        );
    }

    #[test]
    fn a_newer_save_made_from_the_queued_one_replaces_it() {
        let env = Env::new("chain");
        env.write_file(&[(Section::Unpublished, blob(5, "v0"))]);
        env.enqueue(edit(9, "other", blob(9, "x"), None));
        env.enqueue(edit(5, "v1", blob(5, "v1"), Some(blob(5, "v0"))));
        env.enqueue(edit(5, "v2", blob(5, "v2"), Some(blob(5, "v1"))));
        let saves = env.pending();
        assert_eq!(labels(&saves), vec!["other", "v2"]);
        assert_eq!(
            saves[1].ops,
            vec![SaveOp::Upsert {
                section: Section::Unpublished,
                blob: blob(5, "v2"),
                base: Some(blob(5, "v0")),
                hero_class: None
            }]
        );
        assert!(matches!(env.flush(1), FlushReport::Saved { .. }));
        assert_eq!(env.read_file().get(Section::Unpublished, 5), Some(blob(5, "v2").as_slice()));
    }

    #[test]
    fn a_newer_save_not_made_from_the_queued_one_is_kept_beside_it() {
        let env = Env::new("no-chain");
        env.enqueue(edit(5, "v1", blob(5, "v1"), Some(blob(5, "v0"))));
        env.enqueue(edit(5, "v2", blob(5, "v2"), Some(blob(5, "v0"))));
        assert_eq!(labels(&env.pending()), vec!["v1", "v2"]);
    }

    #[test]
    fn flush_writes_everything_once_with_one_backup_and_clears_the_queue() {
        let env = Env::new("flush");
        env.write_file(&[(Section::Unpublished, blob(1, "v0"))]);
        env.enqueue(edit(1, "one", blob(1, "v1"), Some(blob(1, "v0"))));
        env.enqueue(edit(2, "two", blob(2, "new"), None));
        let checks = Cell::new(0);
        let running = || {
            checks.set(checks.get() + 1);
            false
        };
        let FlushReport::Saved { backup, saves } = env.flush_with(50, &running) else { panic!("not saved") };
        assert!(backup.is_some());
        assert_eq!(labels(&saves), vec!["one", "two"]);
        // `save_with` checks the game twice, so two checks mean one write.
        assert_eq!(checks.get(), 2);
        assert_eq!(list_backups(&env.backups, ACCOUNT).len(), 1);
        let file = env.read_file();
        assert_eq!(file.get(Section::Unpublished, 1), Some(blob(1, "v1").as_slice()));
        assert_eq!(file.get(Section::Unpublished, 2), Some(blob(2, "new").as_slice()));
        assert!(env.pending().is_empty());
        assert!(matches!(env.flush(51), FlushReport::Nothing));
    }

    fn conflicted(env: &Env) -> String {
        env.write_file(&[(Section::Unpublished, blob(1, "in game"))]);
        env.enqueue(edit(1, "ours", blob(1, "ours"), Some(blob(1, "v0"))))
    }

    #[test]
    fn a_conflict_keeps_the_queue_and_returns_both_versions() {
        let env = Env::new("conflict");
        let id = conflicted(&env);
        let before = fs::read(&env.file).unwrap();
        let FlushReport::Conflict(conflicts) = env.flush(1) else { panic!("no conflict") };
        assert_eq!(
            conflicts,
            vec![QueuedConflict {
                save_id: id,
                conflict: Conflict {
                    section: Section::Unpublished,
                    id: 1,
                    base: Some(blob(1, "v0")),
                    current: Some(blob(1, "in game")),
                    ours: Some(blob(1, "ours")),
                },
            }]
        );
        assert_eq!(labels(&env.pending()), vec!["ours"]);
        assert_eq!(fs::read(&env.file).unwrap(), before);
    }

    #[test]
    fn keep_ours_then_flush_writes_ours() {
        let env = Env::new("keep-ours");
        let id = conflicted(&env);
        assert!(matches!(env.flush(1), FlushReport::Conflict(_)));
        assert!(resolve_conflict(&env.dir, ACCOUNT, &env.file, &id, Choice::KeepOurs).unwrap());
        assert!(matches!(env.flush(2), FlushReport::Saved { .. }));
        assert_eq!(env.read_file().get(Section::Unpublished, 1), Some(blob(1, "ours").as_slice()));
        assert!(env.pending().is_empty());
    }

    #[test]
    fn keep_game_drops_the_queued_save() {
        let env = Env::new("keep-game");
        let id = conflicted(&env);
        let before = fs::read(&env.file).unwrap();
        assert!(resolve_conflict(&env.dir, ACCOUNT, &env.file, &id, Choice::KeepGame).unwrap());
        assert!(env.pending().is_empty());
        assert!(!resolve_conflict(&env.dir, ACCOUNT, &env.file, &id, Choice::KeepGame).unwrap());
        assert!(matches!(env.flush(2), FlushReport::Nothing));
        assert_eq!(fs::read(&env.file).unwrap(), before);
    }

    #[test]
    fn a_running_game_keeps_the_queue() {
        let env = Env::new("running");
        env.enqueue(edit(1, "a", blob(1, "a"), None));
        assert!(matches!(env.flush_with(1, &|| true), FlushReport::GameRunning));
        assert_eq!(labels(&env.pending()), vec!["a"]);
        assert!(!env.file.exists());
    }

    #[test]
    fn an_unreadable_build_file_fails_and_keeps_the_queue() {
        let env = Env::new("bad-file");
        fs::write(&env.file, b"not kv3").unwrap();
        env.enqueue(edit(1, "a", blob(1, "a"), None));
        assert!(matches!(env.flush(1), FlushReport::Failed(SaveError::File(_))));
        assert_eq!(labels(&env.pending()), vec!["a"]);
        assert_eq!(fs::read(&env.file).unwrap(), b"not kv3");
    }

    #[test]
    fn a_write_records_history_and_a_delete_forgets_it() {
        let env = Env::new("history");
        env.enqueue(edit(3, "My build", blob(3, "v1"), None));
        assert!(matches!(env.flush(40), FlushReport::Saved { .. }));
        let versions = history::list(&env.history, ACCOUNT, 3).unwrap();
        assert_eq!(versions.len(), 1);
        assert_eq!((versions[0].saved_at, versions[0].name.as_str()), (40, "My build"));
        assert_eq!(history::get(&env.history, ACCOUNT, 3, &versions[0].id).unwrap().unwrap().blob, blob(3, "v1"));

        env.enqueue(QueuedSave {
            id: String::new(),
            queued_at: 41,
            label: "My build".into(),
            build_id: 3,
            ops: vec![SaveOp::Delete { section: Section::Unpublished, id: 3, base: Some(blob(3, "v1")) }],
        });
        assert!(matches!(env.flush(42), FlushReport::Saved { .. }));
        assert_eq!(env.read_file().get(Section::Unpublished, 3), None);
        assert!(history::list(&env.history, ACCOUNT, 3).unwrap().is_empty());
    }

    #[test]
    fn a_corrupt_queue_is_reported_and_left_alone() {
        let env = Env::new("corrupt");
        let path = queue_path(&env.dir, ACCOUNT);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, "{ nope").unwrap();
        assert!(matches!(pending(&env.dir, ACCOUNT), Err(QueueError::Read(_))));
        assert!(matches!(enqueue(&env.dir, ACCOUNT, edit(1, "a", blob(1, "a"), None)), Err(QueueError::Read(_))));
        assert!(matches!(cancel(&env.dir, ACCOUNT, "x"), Err(QueueError::Read(_))));
        let flushed = flush(&env.dir, ACCOUNT, &env.file, &env.backups, 1, &|| false, &env.history);
        assert!(matches!(flushed, Err(QueueError::Read(_))));
        assert_eq!(fs::read_to_string(&path).unwrap(), "{ nope");
    }

    fn named(id: u32, name: &str) -> Vec<u8> {
        HeroBuildResult {
            hero_build: Some(HeroBuild { hero_build_id: Some(id), name: Some(name.into()), ..Default::default() }),
            ..Default::default()
        }
        .encode()
    }

    #[test]
    fn keep_ours_on_a_new_build_whose_id_the_game_took_saves_both() {
        let env = Env::new("keep-ours-new");
        env.write_file(&[(Section::Unpublished, named(3, "old"))]);
        let mut save = edit(4, "ours", named(4, "ours"), None);
        save.ops.push(SaveOp::SetLastUsed { hero_class: "hero_astro".into(), id: 4 });
        let id = env.enqueue(save);
        env.write_file(&[(Section::Unpublished, named(3, "old")), (Section::Favorites, named(4, "game"))]);
        assert!(matches!(env.flush(1), FlushReport::Conflict(_)));
        assert!(resolve_conflict(&env.dir, ACCOUNT, &env.file, &id, Choice::KeepOurs).unwrap());
        assert_eq!(env.pending()[0].build_id, 5);
        assert!(matches!(env.flush(2), FlushReport::Saved { .. }));
        let file = env.read_file();
        assert_eq!(file.get(Section::Favorites, 4), Some(named(4, "game").as_slice()));
        assert_eq!(file.get(Section::Unpublished, 5), Some(named(5, "ours").as_slice()));
        assert_eq!(file.get(Section::Unpublished, 4), None);
        assert_eq!(file.last_used("hero_astro"), Some(5));
    }

    #[test]
    fn keep_ours_on_a_new_build_skips_ids_other_queued_saves_took() {
        let env = Env::new("keep-ours-queued");
        let id = env.enqueue(edit(4, "ours", named(4, "ours"), None));
        env.enqueue(edit(5, "next", named(5, "next"), None));
        env.write_file(&[(Section::Unpublished, named(4, "game"))]);
        assert!(matches!(env.flush(1), FlushReport::Conflict(_)));
        assert!(resolve_conflict(&env.dir, ACCOUNT, &env.file, &id, Choice::KeepOurs).unwrap());
        assert!(matches!(env.flush(2), FlushReport::Saved { .. }));
        let file = env.read_file();
        assert_eq!(file.get(Section::Unpublished, 4), Some(named(4, "game").as_slice()));
        assert_eq!(file.get(Section::Unpublished, 5), Some(named(5, "next").as_slice()));
        assert_eq!(file.get(Section::Unpublished, 6), Some(named(6, "ours").as_slice()));
    }
}
