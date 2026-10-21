use serde::{Deserialize, Serialize};
use std::fmt;
use std::io;
use std::path::{Path, PathBuf};
use ts_rs::TS;

pub const MAX_VERSIONS: usize = 20;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Version {
    pub saved_at: u64,
    pub blob: Vec<u8>,
    pub name: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct BuildVersionMeta {
    pub id: String,
    pub saved_at: u64,
    pub name: String,
    pub note: Option<String>,
}

#[derive(Debug)]
pub enum HistoryError {
    Read(dp_versioned::ReadError),
    Io(io::Error),
}

impl fmt::Display for HistoryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Read(e) => write!(f, "{e}"),
            Self::Io(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for HistoryError {}

#[derive(Serialize, Deserialize)]
struct Stored {
    id: String,
    saved_at: u64,
    name: String,
    note: Option<String>,
    blob: String,
}

fn load(path: &Path) -> Result<Vec<Stored>, HistoryError> {
    Ok(dp_versioned::read::<Vec<Stored>>(path, &[]).map_err(HistoryError::Read)?.unwrap_or_default())
}

fn encode_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn decode_hex(text: &str) -> Option<Vec<u8>> {
    if !text.is_ascii() || !text.len().is_multiple_of(2) {
        return None;
    }
    (0..text.len()).step_by(2).map(|i| u8::from_str_radix(&text[i..i + 2], 16).ok()).collect()
}

/// Skips a blob equal to the newest stored one. An unreadable history file is an error and is never
/// replaced, so a bad file cannot silently lose the versions in it.
pub fn record(dir: &Path, account: u32, build_id: u32, version: Version) -> Result<(), HistoryError> {
    let path = history_path(dir, account, build_id);
    let mut stored = load(&path)?;
    let blob = encode_hex(&version.blob);
    if stored.last().is_some_and(|newest| newest.blob == blob) {
        return Ok(());
    }
    let seq = stored.iter().filter(|s| s.saved_at == version.saved_at).count();
    stored.push(Stored {
        id: format!("{}-{seq}", version.saved_at),
        saved_at: version.saved_at,
        name: version.name,
        note: version.note,
        blob,
    });
    let excess = stored.len().saturating_sub(MAX_VERSIONS);
    stored.drain(..excess);
    dp_versioned::write(&path, &[], &stored).map_err(HistoryError::Io)
}

pub fn list(dir: &Path, account: u32, build_id: u32) -> Result<Vec<BuildVersionMeta>, HistoryError> {
    let stored = load(&history_path(dir, account, build_id))?;
    Ok(stored
        .into_iter()
        .rev()
        .map(|s| BuildVersionMeta { id: s.id, saved_at: s.saved_at, name: s.name, note: s.note })
        .collect())
}

pub fn get(dir: &Path, account: u32, build_id: u32, id: &str) -> Result<Option<Version>, HistoryError> {
    let stored = load(&history_path(dir, account, build_id))?;
    let Some(found) = stored.into_iter().find(|s| s.id == id) else { return Ok(None) };
    let corrupt = || HistoryError::Read(dp_versioned::ReadError::Corrupt("invalid blob".into()));
    let blob = decode_hex(&found.blob).ok_or_else(corrupt)?;
    Ok(Some(Version { saved_at: found.saved_at, blob, name: found.name, note: found.note }))
}

pub fn forget(dir: &Path, account: u32, build_id: u32) -> Result<(), HistoryError> {
    match std::fs::remove_file(history_path(dir, account, build_id)) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => Err(HistoryError::Io(e)),
        _ => Ok(()),
    }
}

fn history_path(dir: &Path, account: u32, build_id: u32) -> PathBuf {
    dir.join(account.to_string()).join(format!("{build_id}.json"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-history-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn version(saved_at: u64, blob: &[u8]) -> Version {
        Version { saved_at, blob: blob.to_vec(), name: format!("v{saved_at}"), note: None }
    }

    #[test]
    fn keeps_the_newest_twenty() {
        let dir = temp_dir("cap");
        for n in 0..21u64 {
            record(&dir, 1, 7, version(100 + n, &[n as u8])).unwrap();
        }
        let metas = list(&dir, 1, 7).unwrap();
        assert_eq!(metas.len(), 20);
        assert_eq!(metas[0].saved_at, 120);
        assert_eq!(metas[19].saved_at, 101);
    }

    #[test]
    fn identical_blob_is_not_recorded_twice() {
        let dir = temp_dir("dup");
        record(&dir, 1, 7, version(100, b"a")).unwrap();
        record(&dir, 1, 7, version(101, b"a")).unwrap();
        assert_eq!(list(&dir, 1, 7).unwrap().len(), 1);
        record(&dir, 1, 7, version(102, b"b")).unwrap();
        record(&dir, 1, 7, version(103, b"a")).unwrap();
        assert_eq!(list(&dir, 1, 7).unwrap().len(), 3);
    }

    #[test]
    fn list_is_newest_first_with_metadata() {
        let dir = temp_dir("list");
        let mut first = version(100, b"a");
        first.note = Some("note".into());
        record(&dir, 1, 7, first).unwrap();
        record(&dir, 1, 7, version(200, b"b")).unwrap();
        let metas = list(&dir, 1, 7).unwrap();
        assert_eq!(metas.iter().map(|m| m.saved_at).collect::<Vec<_>>(), vec![200, 100]);
        assert_eq!(metas[1].name, "v100");
        assert_eq!(metas[1].note.as_deref(), Some("note"));
    }

    #[test]
    fn get_returns_the_blob_by_id() {
        let dir = temp_dir("get");
        record(&dir, 1, 7, version(100, &[0, 255, 16])).unwrap();
        record(&dir, 1, 7, version(200, b"b")).unwrap();
        let id = list(&dir, 1, 7).unwrap()[1].id.clone();
        let got = get(&dir, 1, 7, &id).unwrap().unwrap();
        assert_eq!(got, version(100, &[0, 255, 16]));
        assert!(get(&dir, 1, 7, "nope").unwrap().is_none());
    }

    #[test]
    fn missing_history_lists_empty() {
        let dir = temp_dir("missing");
        assert!(list(&dir, 1, 7).unwrap().is_empty());
        assert!(get(&dir, 1, 7, "x").unwrap().is_none());
    }

    #[test]
    fn saves_in_the_same_second_get_distinct_ids() {
        let dir = temp_dir("ids");
        record(&dir, 1, 7, version(100, b"a")).unwrap();
        record(&dir, 1, 7, version(100, b"b")).unwrap();
        let metas = list(&dir, 1, 7).unwrap();
        assert_eq!(metas.len(), 2);
        assert_ne!(metas[0].id, metas[1].id);
        assert_eq!(get(&dir, 1, 7, &metas[0].id).unwrap().unwrap().blob, b"b");
        assert_eq!(get(&dir, 1, 7, &metas[1].id).unwrap().unwrap().blob, b"a");
    }

    #[test]
    fn forget_removes_only_that_build() {
        let dir = temp_dir("forget");
        record(&dir, 1, 7, version(100, b"a")).unwrap();
        record(&dir, 1, 8, version(100, b"a")).unwrap();
        record(&dir, 2, 7, version(100, b"a")).unwrap();
        forget(&dir, 1, 7).unwrap();
        assert!(!history_path(&dir, 1, 7).exists());
        assert!(list(&dir, 1, 7).unwrap().is_empty());
        assert_eq!(list(&dir, 1, 8).unwrap().len(), 1);
        assert_eq!(list(&dir, 2, 7).unwrap().len(), 1);
        forget(&dir, 1, 7).unwrap();
    }

    #[test]
    fn a_corrupt_file_is_reported_and_left_alone() {
        let dir = temp_dir("corrupt");
        let path = history_path(&dir, 1, 7);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "{ nope").unwrap();
        assert!(matches!(list(&dir, 1, 7), Err(HistoryError::Read(_))));
        assert!(matches!(record(&dir, 1, 7, version(100, b"a")), Err(HistoryError::Read(_))));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{ nope");
    }
}
