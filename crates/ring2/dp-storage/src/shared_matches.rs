use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// File under the app data directory holding the record of matches Deadlock+ shared with the Deadlock API.
pub const SHARED_MATCHES_FILE: &str = "shared-matches.json";

pub fn path(app_data: &Path) -> PathBuf {
    app_data.join(SHARED_MATCHES_FILE)
}

pub fn write(app_data: &Path, bytes: &[u8]) -> io::Result<()> {
    fs::create_dir_all(app_data)?;
    dp_atomic::write_atomic(&path(app_data), bytes)
}

pub fn read(app_data: &Path) -> io::Result<Option<Vec<u8>>> {
    match fs::read(path(app_data)) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-shared-matches-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_written_record_reads_back_from_its_file() {
        let dir = temp_dir("round");
        write(&dir, b"{\"a\":1}").unwrap();
        assert_eq!(read(&dir).unwrap(), Some(b"{\"a\":1}".to_vec()));
        assert!(dir.join("shared-matches.json").is_file());
    }

    #[test]
    fn a_missing_record_is_none() {
        assert_eq!(read(&temp_dir("missing")).unwrap(), None);
    }

    #[test]
    fn writing_creates_the_app_data_folder() {
        let dir = temp_dir("create").join("appdata");
        write(&dir, b"x").unwrap();
        assert_eq!(read(&dir).unwrap(), Some(b"x".to_vec()));
    }

    #[test]
    fn writing_again_replaces_the_record_and_leaves_no_temp_file() {
        let dir = temp_dir("replace");
        write(&dir, b"first").unwrap();
        write(&dir, b"second").unwrap();
        assert_eq!(read(&dir).unwrap(), Some(b"second".to_vec()));
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
    }
}
