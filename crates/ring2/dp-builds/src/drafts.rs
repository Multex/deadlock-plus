use std::fmt;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use dp_versioned::{Migration, ReadError};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::file::Section;
use crate::model::BuildView;

pub const DRAFTS_FILE: &str = "drafts.json";
const MIGRATIONS: &[Migration] = &[];

/// An unsaved edit, autosaved in app data. Only "Save to game" writes the build file.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct DraftView {
    /// Empty on a draft that was never stored; storing it assigns one.
    pub id: String,
    pub updated_at: u64,
    /// Always `build.heroId`: copied from the build each time the draft is stored.
    pub hero_id: u32,
    pub source: DraftSource,
    pub build: BuildView,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum DraftSource {
    New,
    /// An edit of a build in the file; `base` is the hex blob the edit started from.
    Local {
        #[ts(type = "\"Favorites\" | \"Unpublished\" | \"SavedLastUsed\"")]
        section: Section,
        build_id: u32,
        base: String,
    },
    /// A copy of a public build in progress.
    Public {
        build_id: u32,
    },
}

#[derive(Debug)]
pub enum DraftError {
    Read(ReadError),
    Io(io::Error),
}

impl fmt::Display for DraftError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Read(e) => write!(f, "{e}"),
            Self::Io(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for DraftError {}

/// Newest first.
pub fn list(dir: &Path, account: u32) -> Result<Vec<DraftView>, DraftError> {
    let mut drafts = load(&drafts_path(dir, account))?;
    drafts.reverse();
    Ok(drafts)
}

pub fn get(dir: &Path, account: u32, id: &str) -> Result<Option<DraftView>, DraftError> {
    Ok(load(&drafts_path(dir, account))?.into_iter().find(|d| d.id == id))
}

/// Stores `draft` as the newest one, replacing the draft with its id. An unreadable file is an error
/// and is never replaced, so a bad file cannot silently lose the drafts in it.
pub fn upsert(dir: &Path, account: u32, mut draft: DraftView, now: u64) -> Result<DraftView, DraftError> {
    let path = drafts_path(dir, account);
    let mut drafts = load(&path)?;
    if draft.id.is_empty() {
        draft.id = fresh_id(&drafts);
    }
    draft.updated_at = now;
    draft.hero_id = draft.build.hero_id;
    drafts.retain(|d| d.id != draft.id);
    drafts.push(draft.clone());
    store(&path, &drafts)?;
    Ok(draft)
}

pub fn remove(dir: &Path, account: u32, id: &str) -> Result<bool, DraftError> {
    Ok(remove_where(dir, account, |d| d.id == id)? > 0)
}

/// Drops the drafts that edit local build `build_id`, once a save wrote it. A public copy or a new
/// build saves under a fresh id, so its draft is removed by its own id instead.
pub fn clear_for_build(dir: &Path, account: u32, build_id: u32) -> Result<usize, DraftError> {
    remove_where(dir, account, |d| matches!(d.source, DraftSource::Local { build_id: b, .. } if b == build_id))
}

fn remove_where(dir: &Path, account: u32, gone: impl Fn(&DraftView) -> bool) -> Result<usize, DraftError> {
    let path = drafts_path(dir, account);
    let mut drafts = load(&path)?;
    let before = drafts.len();
    drafts.retain(|d| !gone(d));
    let removed = before - drafts.len();
    if removed > 0 {
        store(&path, &drafts)?;
    }
    Ok(removed)
}

fn load(path: &Path) -> Result<Vec<DraftView>, DraftError> {
    Ok(dp_versioned::read(path, MIGRATIONS).map_err(DraftError::Read)?.unwrap_or_default())
}

fn store(path: &Path, drafts: &[DraftView]) -> Result<(), DraftError> {
    dp_versioned::write(path, MIGRATIONS, &drafts).map_err(DraftError::Io)
}

static NEXT_SEQ: AtomicU32 = AtomicU32::new(0);

/// Milliseconds, process and a per-process counter, so two drafts made in one instant, or by two
/// app instances, never share an id.
fn fresh_id(drafts: &[DraftView]) -> String {
    let millis = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis());
    let pid = std::process::id() & 0xffff;
    loop {
        let seq = NEXT_SEQ.fetch_add(1, Ordering::Relaxed) & 0xffff;
        let id = format!("{millis:012x}-{pid:04x}-{seq:04x}");
        if drafts.iter().all(|d| d.id != id) {
            return id;
        }
    }
}

fn drafts_path(dir: &Path, account: u32) -> PathBuf {
    dir.join(account.to_string()).join(DRAFTS_FILE)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-drafts-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn draft(name: &str, source: DraftSource) -> DraftView {
        let build = BuildView { hero_id: 6, name: name.into(), ..Default::default() };
        DraftView { id: String::new(), updated_at: 0, hero_id: 0, source, build }
    }

    fn local(build_id: u32) -> DraftSource {
        DraftSource::Local { section: Section::Unpublished, build_id, base: "0a00".into() }
    }

    fn names(drafts: &[DraftView]) -> Vec<&str> {
        drafts.iter().map(|d| d.build.name.as_str()).collect()
    }

    #[test]
    fn a_new_draft_gets_an_id_a_time_and_its_builds_hero() {
        let dir = temp_dir("new");
        let saved = upsert(&dir, 1, draft("a", DraftSource::New), 100).unwrap();
        assert!(!saved.id.is_empty());
        assert_eq!((saved.updated_at, saved.hero_id), (100, 6));
        assert_eq!(list(&dir, 1).unwrap(), vec![saved.clone()]);
        assert_eq!(get(&dir, 1, &saved.id).unwrap(), Some(saved));
    }

    #[test]
    fn ids_are_unique_within_one_instant() {
        let dir = temp_dir("ids");
        let a = upsert(&dir, 1, draft("a", DraftSource::New), 100).unwrap();
        let b = upsert(&dir, 1, draft("b", DraftSource::New), 100).unwrap();
        assert_ne!(a.id, b.id);
        assert_eq!(list(&dir, 1).unwrap().len(), 2);
    }

    #[test]
    fn autosave_replaces_the_draft_by_id_and_lists_it_first() {
        let dir = temp_dir("replace");
        let a = upsert(&dir, 1, draft("a", DraftSource::New), 100).unwrap();
        upsert(&dir, 1, draft("b", DraftSource::New), 101).unwrap();
        let edited = DraftView { build: BuildView { name: "a2".into(), ..a.build.clone() }, ..a.clone() };
        let saved = upsert(&dir, 1, edited, 102).unwrap();
        assert_eq!((saved.id.as_str(), saved.updated_at), (a.id.as_str(), 102));
        assert_eq!(names(&list(&dir, 1).unwrap()), vec!["a2", "b"]);
    }

    #[test]
    fn a_draft_with_an_unknown_id_is_kept_under_that_id() {
        let dir = temp_dir("unknown-id");
        let saved = upsert(&dir, 1, DraftView { id: "x".into(), ..draft("a", DraftSource::New) }, 100).unwrap();
        assert_eq!(saved.id, "x");
        assert_eq!(get(&dir, 1, "x").unwrap().unwrap().build.name, "a");
    }

    #[test]
    fn drafts_are_stored_per_account() {
        let dir = temp_dir("accounts");
        upsert(&dir, 1, draft("one", DraftSource::New), 100).unwrap();
        upsert(&dir, 2, draft("two", DraftSource::New), 100).unwrap();
        assert_eq!(names(&list(&dir, 1).unwrap()), vec!["one"]);
        assert_eq!(names(&list(&dir, 2).unwrap()), vec!["two"]);
        assert!(drafts_path(&dir, 1).exists());
    }

    #[test]
    fn remove_drops_only_that_draft() {
        let dir = temp_dir("remove");
        let a = upsert(&dir, 1, draft("a", DraftSource::New), 100).unwrap();
        upsert(&dir, 1, draft("b", DraftSource::New), 100).unwrap();
        assert!(remove(&dir, 1, &a.id).unwrap());
        assert!(!remove(&dir, 1, &a.id).unwrap());
        assert_eq!(names(&list(&dir, 1).unwrap()), vec!["b"]);
    }

    #[test]
    fn a_save_of_a_build_clears_only_the_drafts_that_edit_it() {
        let dir = temp_dir("clear");
        upsert(&dir, 1, draft("edit 4", local(4)), 100).unwrap();
        upsert(&dir, 1, draft("edit 4 again", local(4)), 100).unwrap();
        upsert(&dir, 1, draft("edit 5", local(5)), 100).unwrap();
        upsert(&dir, 1, draft("copy 4", DraftSource::Public { build_id: 4 }), 100).unwrap();
        upsert(&dir, 1, draft("new", DraftSource::New), 100).unwrap();
        assert_eq!(clear_for_build(&dir, 1, 4).unwrap(), 2);
        assert_eq!(names(&list(&dir, 1).unwrap()), vec!["new", "copy 4", "edit 5"]);
        assert_eq!(clear_for_build(&dir, 1, 4).unwrap(), 0);
    }

    #[test]
    fn nothing_stored_lists_empty_and_writes_nothing() {
        let dir = temp_dir("missing");
        assert!(list(&dir, 1).unwrap().is_empty());
        assert!(get(&dir, 1, "x").unwrap().is_none());
        assert!(!remove(&dir, 1, "x").unwrap());
        assert_eq!(clear_for_build(&dir, 1, 4).unwrap(), 0);
        assert!(!drafts_path(&dir, 1).exists());
    }

    #[test]
    fn a_corrupt_file_is_reported_and_left_alone() {
        let dir = temp_dir("corrupt");
        let path = drafts_path(&dir, 1);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "{ nope").unwrap();
        assert!(matches!(list(&dir, 1), Err(DraftError::Read(_))));
        assert!(matches!(get(&dir, 1, "x"), Err(DraftError::Read(_))));
        assert!(matches!(upsert(&dir, 1, draft("a", DraftSource::New), 1), Err(DraftError::Read(_))));
        assert!(matches!(remove(&dir, 1, "x"), Err(DraftError::Read(_))));
        assert!(matches!(clear_for_build(&dir, 1, 4), Err(DraftError::Read(_))));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{ nope");
    }

    #[test]
    fn the_view_serializes_in_camel_case_with_a_tagged_source() {
        let mut d = draft("a", local(4));
        d.updated_at = 9;
        let json = serde_json::to_value(&d).unwrap();
        assert_eq!(json["updatedAt"], 9);
        assert_eq!(json["heroId"], 0);
        assert_eq!(
            json["source"],
            serde_json::json!({ "kind": "local", "section": "Unpublished", "buildId": 4, "base": "0a00" })
        );
        assert_eq!(serde_json::to_value(DraftSource::New).unwrap(), serde_json::json!({ "kind": "new" }));
        let public = serde_json::json!({ "kind": "public", "buildId": 7 });
        assert_eq!(serde_json::from_value::<DraftSource>(public).unwrap(), DraftSource::Public { build_id: 7 });
    }
}
