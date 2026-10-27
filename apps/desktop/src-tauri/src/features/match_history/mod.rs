mod error;

use std::path::{Path, PathBuf};
use std::time::SystemTime;

use dp_storage::matches;

use crate::features::error::AppError;
use error::MatchHistoryError;

const CACHE_DIR: &str = "matches";

/// The real metadata body is about 780 KB; this leaves room for growth without letting the frontend
/// fill the disk.
const MAX_JSON_BYTES: usize = 8 * 1024 * 1024;

fn read_entry(dir: &Path, match_id: u64, now: SystemTime) -> Result<Option<String>, AppError> {
    let bytes = matches::read(dir, &match_id.to_string(), now).map_err(AppError::io)?;
    Ok(bytes.and_then(|bytes| match String::from_utf8(bytes) {
        Ok(json) => Some(json),
        Err(e) => {
            log::warn!("match cache entry {match_id} is not UTF-8: {e}");
            None
        }
    }))
}

fn write_entry(dir: &Path, match_id: u64, json: &str, now: SystemTime) -> Result<(), AppError> {
    if json.len() > MAX_JSON_BYTES {
        return Err(AppError::new(MatchHistoryError::TooLarge).param("max_bytes", MAX_JSON_BYTES));
    }
    if serde_json::from_str::<serde::de::IgnoredAny>(json).is_err() {
        return Err(MatchHistoryError::NotJson.into());
    }
    matches::write(dir, &match_id.to_string(), json.as_bytes(), now).map_err(AppError::io)
}

fn purge_expired(dir: &Path, now: SystemTime) -> usize {
    matches::purge(dir, now)
}

fn cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    use tauri::Manager;
    app.path().app_data_dir().map(|dir| dir.join(CACHE_DIR)).map_err(AppError::internal)
}

pub fn start(app: &tauri::AppHandle) {
    let dir = match cache_dir(app) {
        Ok(dir) => dir,
        Err(e) => {
            log::warn!("match cache purge skipped: {e}");
            return;
        }
    };
    tauri::async_runtime::spawn_blocking(move || {
        let removed = purge_expired(&dir, SystemTime::now());
        log::debug!("match cache purge removed {removed} expired entries");
    });
}

pub mod commands {
    use super::{cache_dir, read_entry, write_entry};
    use crate::command_panics::guarded;
    use crate::features::error::AppError;
    use std::time::SystemTime;

    #[tauri::command]
    pub async fn match_detail_cache_read(app: tauri::AppHandle, match_id: u64) -> Result<Option<String>, AppError> {
        guarded(async move {
            let dir = cache_dir(&app)?;
            tauri::async_runtime::spawn_blocking(move || read_entry(&dir, match_id, SystemTime::now()))
                .await
                .map_err(AppError::internal)?
        })
        .await
    }

    #[tauri::command]
    pub async fn match_detail_cache_write(app: tauri::AppHandle, match_id: u64, json: String) -> Result<(), AppError> {
        guarded(async move {
            let dir = cache_dir(&app)?;
            tauri::async_runtime::spawn_blocking(move || write_entry(&dir, match_id, &json, SystemTime::now()))
                .await
                .map_err(AppError::internal)?
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dp_storage::matches::MATCH_TTL;
    use std::path::PathBuf;
    use std::time::{Duration, UNIX_EPOCH};

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-match-history-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn at(secs: u64) -> SystemTime {
        UNIX_EPOCH + Duration::from_secs(secs)
    }

    fn file_count(dir: &Path) -> usize {
        std::fs::read_dir(dir).unwrap().count()
    }

    #[test]
    fn a_read_miss_is_none() {
        let dir = temp_dir("miss");
        assert_eq!(read_entry(&dir, 42, at(10)).unwrap(), None);
    }

    #[test]
    fn a_written_entry_reads_back_unchanged() {
        let dir = temp_dir("round");
        let json = r#"{"match_info":{"match_id":42}}"#;
        write_entry(&dir, 42, json, at(10)).unwrap();
        assert_eq!(read_entry(&dir, 42, at(11)).unwrap().as_deref(), Some(json));
    }

    #[test]
    fn the_entry_lands_at_a_digits_only_path_inside_the_folder() {
        let dir = temp_dir("path");
        write_entry(&dir, u64::MAX, "{}", at(10)).unwrap();
        assert!(dir.join("18446744073709551615.json").is_file());
        assert_eq!(file_count(&dir), 1);
    }

    #[test]
    fn an_oversize_body_is_rejected_and_nothing_is_written() {
        let dir = temp_dir("big");
        let json = format!("\"{}\"", "a".repeat(MAX_JSON_BYTES));
        let err = write_entry(&dir, 1, &json, at(10)).unwrap_err();
        assert_eq!(err.code(), "match_history.too_large");
        assert_eq!(file_count(&dir), 0);
    }

    #[test]
    fn a_body_that_is_not_json_is_rejected_and_nothing_is_written() {
        let dir = temp_dir("junk");
        for bad in ["", "not json", "{\"a\":", "{} trailing"] {
            let err = write_entry(&dir, 1, bad, at(10)).unwrap_err();
            assert_eq!(err.code(), "match_history.not_json", "{bad:?}");
        }
        assert_eq!(file_count(&dir), 0);
    }

    #[test]
    fn purge_removes_an_expired_entry_and_keeps_a_fresh_one() {
        let dir = temp_dir("purge");
        let now = at(100) + MATCH_TTL;
        write_entry(&dir, 1, "{}", at(100)).unwrap();
        write_entry(&dir, 2, "{}", now).unwrap();
        write_entry(&dir, 3, "{}", at(100)).unwrap();
        assert_eq!(purge_expired(&dir, now), 1);
        assert!(dir.join("2.json").is_file());
        assert!(!dir.join("3.json").exists());
    }

    #[test]
    fn purging_a_missing_folder_removes_nothing() {
        let dir = temp_dir("nofolder").join("matches");
        assert_eq!(purge_expired(&dir, at(10)), 0);
    }
}
