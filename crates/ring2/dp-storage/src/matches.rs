use std::fs::{self, File};
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

/// An entry is purged once it has gone this long without being opened.
pub const MATCH_TTL: Duration = Duration::from_secs(3 * 24 * 60 * 60);

const EXTENSION: &str = "json";

/// Match ids are numeric. Anything else could name a path outside the cache folder.
pub fn is_valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 20 && id.bytes().all(|b| b.is_ascii_digit())
}

fn entry_path(dir: &Path, id: &str) -> io::Result<PathBuf> {
    if !is_valid_id(id) {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "match id must be digits only"));
    }
    Ok(dir.join(format!("{id}.{EXTENSION}")))
}

fn stamp(path: &Path, at: SystemTime) -> io::Result<()> {
    File::options().write(true).open(path)?.set_modified(at)
}

/// Returns the cached bytes and restarts the entry's TTL clock. The file's modified time is the
/// last-opened time, so no sidecar metadata is needed.
pub fn read(dir: &Path, id: &str, now: SystemTime) -> io::Result<Option<Vec<u8>>> {
    let path = entry_path(dir, id)?;
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e),
    };
    if let Err(e) = stamp(&path, now) {
        log::warn!("could not refresh match cache entry {id}: {e}");
    }
    Ok(Some(bytes))
}

/// Returns the cached bytes without touching the entry's TTL clock, for background reads that must not keep an
/// entry alive.
pub fn peek(dir: &Path, id: &str) -> io::Result<Option<Vec<u8>>> {
    match fs::read(entry_path(dir, id)?) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// Writes one entry atomically, then purges expired ones. Other entries are never rewritten.
pub fn write(dir: &Path, id: &str, bytes: &[u8], now: SystemTime) -> io::Result<()> {
    let path = entry_path(dir, id)?;
    fs::create_dir_all(dir)?;
    dp_atomic::write_atomic(&path, bytes)?;
    if let Err(e) = stamp(&path, now) {
        log::warn!("could not stamp match cache entry {id}: {e}");
    }
    purge(dir, now);
    Ok(())
}

/// Removes entries last opened `MATCH_TTL` or more before `now`. Returns how many were removed.
/// Files that are not `<digits>.json` are left alone.
pub fn purge(dir: &Path, now: SystemTime) -> usize {
    let Ok(read) = fs::read_dir(dir) else {
        return 0;
    };
    let mut removed = 0;
    for entry in read.filter_map(Result::ok) {
        let path = entry.path();
        let named_like_an_entry = path.extension().is_some_and(|e| e == EXTENSION)
            && path.file_stem().and_then(|s| s.to_str()).is_some_and(is_valid_id);
        if !named_like_an_entry {
            continue;
        }
        let Ok(opened) = entry.metadata().and_then(|m| m.modified()) else {
            continue;
        };
        let expired = now.duration_since(opened).is_ok_and(|age| age >= MATCH_TTL);
        if expired && fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    removed
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::UNIX_EPOCH;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-matches-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn at(secs: u64) -> SystemTime {
        UNIX_EPOCH + Duration::from_secs(secs)
    }

    fn opened_at(dir: &Path, id: &str) -> SystemTime {
        fs::metadata(dir.join(format!("{id}.json"))).unwrap().modified().unwrap()
    }

    #[test]
    fn a_written_entry_reads_back_and_a_missing_one_is_none() {
        let dir = temp_dir("round");
        write(&dir, "123", b"{\"a\":1}", at(1_000_000)).unwrap();
        assert_eq!(read(&dir, "123", at(1_000_001)).unwrap(), Some(b"{\"a\":1}".to_vec()));
        assert_eq!(read(&dir, "456", at(1_000_001)).unwrap(), None);
        assert!(dir.join("123.json").is_file());
    }

    #[test]
    fn writing_creates_the_folder_when_it_does_not_exist() {
        let dir = temp_dir("create").join("matches");
        write(&dir, "7", b"x", at(5)).unwrap();
        assert!(dir.join("7.json").is_file());
    }

    #[test]
    fn ids_that_are_not_plain_digits_are_rejected_everywhere() {
        let dir = temp_dir("ids");
        for bad in ["", "..", "../x", "1/2", "1\\2", "12a", "-1", " 1", "1.json", "123456789012345678901"] {
            assert!(!is_valid_id(bad), "{bad:?}");
            assert_eq!(write(&dir, bad, b"x", at(1)).unwrap_err().kind(), io::ErrorKind::InvalidInput, "{bad:?}");
            assert_eq!(read(&dir, bad, at(1)).unwrap_err().kind(), io::ErrorKind::InvalidInput, "{bad:?}");
        }
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
        assert!(is_valid_id("0"));
        assert!(is_valid_id("84932001"));
    }

    #[test]
    fn purge_removes_entries_at_the_ttl_and_keeps_those_just_under_it() {
        let dir = temp_dir("boundary");
        let ttl = MATCH_TTL.as_secs();
        let now = 10_000_000;
        for (id, opened) in [("1", now - ttl + 1), ("2", now - ttl), ("3", now - ttl - 1), ("4", now)] {
            fs::write(dir.join(format!("{id}.json")), b"x").unwrap();
            stamp(&dir.join(format!("{id}.json")), at(opened)).unwrap();
        }
        assert_eq!(purge(&dir, at(now)), 2);
        assert!(dir.join("1.json").exists());
        assert!(!dir.join("2.json").exists());
        assert!(!dir.join("3.json").exists());
        assert!(dir.join("4.json").exists());
    }

    #[test]
    fn reading_restarts_the_clock() {
        let dir = temp_dir("reopen");
        let ttl = MATCH_TTL.as_secs();
        write(&dir, "9", b"x", at(1_000)).unwrap();
        read(&dir, "9", at(1_000 + ttl - 10)).unwrap();
        assert_eq!(opened_at(&dir, "9"), at(1_000 + ttl - 10));
        assert_eq!(purge(&dir, at(1_000 + ttl + 100)), 0);
        assert_eq!(purge(&dir, at(1_000 + ttl - 10 + ttl)), 1);
    }

    #[test]
    fn peeking_returns_the_bytes_and_leaves_the_clock_alone() {
        let dir = temp_dir("peek");
        write(&dir, "11", b"body", at(1_000)).unwrap();
        assert_eq!(peek(&dir, "11").unwrap(), Some(b"body".to_vec()));
        assert_eq!(opened_at(&dir, "11"), at(1_000));
        assert_eq!(peek(&dir, "12").unwrap(), None);
        assert_eq!(peek(&dir, "../x").unwrap_err().kind(), io::ErrorKind::InvalidInput);
    }

    #[test]
    fn writing_purges_expired_entries_and_leaves_fresh_ones_untouched() {
        let dir = temp_dir("write-purge");
        let ttl = MATCH_TTL.as_secs();
        write(&dir, "1", b"old", at(100)).unwrap();
        write(&dir, "2", b"fresh", at(100 + ttl)).unwrap();
        assert!(!dir.join("1.json").exists());
        let before = opened_at(&dir, "2");
        write(&dir, "3", b"new", at(100 + ttl + 5)).unwrap();
        assert_eq!(fs::read(dir.join("2.json")).unwrap(), b"fresh");
        assert_eq!(opened_at(&dir, "2"), before);
        assert!(dir.join("3.json").exists());
    }

    #[test]
    fn purge_ignores_files_that_are_not_entries_and_a_missing_folder() {
        let dir = temp_dir("foreign");
        fs::write(dir.join("notes.json"), b"x").unwrap();
        fs::write(dir.join("12.txt"), b"x").unwrap();
        stamp(&dir.join("notes.json"), at(1)).unwrap();
        stamp(&dir.join("12.txt"), at(1)).unwrap();
        assert_eq!(purge(&dir, at(10_000_000)), 0);
        assert_eq!(purge(&dir.join("absent"), at(10_000_000)), 0);
        assert!(dir.join("notes.json").exists() && dir.join("12.txt").exists());
    }
}
