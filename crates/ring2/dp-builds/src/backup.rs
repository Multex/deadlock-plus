use std::path::{Path, PathBuf};

const KEEP: usize = 10;
const PREFIX: &str = "cached_hero_builds-";
const SUFFIX: &str = ".kv3";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackupInfo {
    pub path: PathBuf,
    pub timestamp: u64,
    pub collision: u32,
}

#[derive(Debug)]
pub enum WriteError {
    NoBackupName,
    BackupFailed(std::io::Error),
    WriteFailed { backup: Option<PathBuf>, source: std::io::Error },
}

impl std::fmt::Display for WriteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NoBackupName => f.write_str("Could not find a free backup name. The file was not changed."),
            Self::BackupFailed(e) => write!(f, "Backup failed, the file was not changed: {e}"),
            Self::WriteFailed { backup: Some(b), source } => write!(
                f,
                "Backup saved to {}, but writing the file failed: {source}. The original is unchanged.",
                b.display()
            ),
            Self::WriteFailed { backup: None, source } => write!(f, "Writing the file failed: {source}"),
        }
    }
}

impl std::error::Error for WriteError {}

pub fn list_backups(backups_dir: &Path, account_id32: u32) -> Vec<BackupInfo> {
    let Ok(entries) = std::fs::read_dir(account_dir(backups_dir, account_id32)) else {
        return Vec::new();
    };
    let mut found: Vec<BackupInfo> = entries
        .flatten()
        .filter_map(|e| {
            let (timestamp, collision) = parse_name(&e.file_name().to_string_lossy())?;
            Some(BackupInfo { path: e.path(), timestamp, collision })
        })
        .collect();
    found.sort_by_key(|a| std::cmp::Reverse((a.timestamp, a.collision)));
    found
}

fn account_dir(backups_dir: &Path, account_id32: u32) -> PathBuf {
    backups_dir.join(account_id32.to_string())
}

fn parse_name(name: &str) -> Option<(u64, u32)> {
    let stem = name.strip_prefix(PREFIX)?.strip_suffix(SUFFIX)?;
    match stem.split_once('-') {
        Some((ts, n)) => Some((ts.parse().ok()?, n.parse().ok()?)),
        None => Some((stem.parse().ok()?, 0)),
    }
}

fn backup_name(timestamp: u64, n: u32) -> String {
    if n == 0 {
        format!("{PREFIX}{timestamp}{SUFFIX}")
    } else {
        format!("{PREFIX}{timestamp}-{n}{SUFFIX}")
    }
}

pub fn write_with_backup(
    path: &Path,
    bytes: &[u8],
    backups_dir: &Path,
    account_id32: u32,
    timestamp: u64,
) -> Result<Option<PathBuf>, WriteError> {
    let backup = if path.is_file() {
        let dir = account_dir(backups_dir, account_id32);
        std::fs::create_dir_all(&dir).map_err(|e| {
            log::error!("build backup folder could not be created, the file was not changed: {e}");
            WriteError::BackupFailed(e)
        })?;
        let backup = (0..64)
            .map(|n| dir.join(backup_name(timestamp, n)))
            .find(|p| !p.exists())
            .ok_or(WriteError::NoBackupName)?;
        std::fs::copy(path, &backup).map_err(|e| {
            log::error!("build backup failed, the file was not changed: {e}");
            WriteError::BackupFailed(e)
        })?;
        prune(backups_dir, account_id32);
        Some(backup)
    } else {
        None
    };
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            log::error!("build file folder could not be created: {e}");
            WriteError::WriteFailed { backup: backup.clone(), source: e }
        })?;
    }
    dp_atomic::write_atomic(path, bytes).map_err(|e| {
        log::error!("build file write failed: {e}");
        WriteError::WriteFailed { backup: backup.clone(), source: e }
    })?;
    log::info!("build file written ({} bytes)", bytes.len());
    Ok(backup)
}

fn prune(backups_dir: &Path, account_id32: u32) {
    for old in list_backups(backups_dir, account_id32).into_iter().skip(KEEP) {
        if let Err(e) = std::fs::remove_file(&old.path) {
            log::warn!("could not remove old build backup {}: {e}", old.path.display());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-builds-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn target(dir: &Path) -> PathBuf {
        let cfg = dir.join("userdata").join("1422450").join("remote").join("cfg");
        fs::create_dir_all(&cfg).unwrap();
        cfg.join("cached_hero_builds.kv3")
    }

    fn count_files(dir: &Path) -> usize {
        fs::read_dir(dir).unwrap().count()
    }

    #[test]
    fn writes_new_bytes_and_keeps_a_backup_of_the_original() {
        let dir = temp_dir("ok");
        let file = target(&dir);
        let backups = dir.join("backups");
        fs::write(&file, "old").unwrap();
        let backup = write_with_backup(&file, b"new", &backups, 7, 42).unwrap().unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "new");
        assert_eq!(fs::read_to_string(&backup).unwrap(), "old");
        assert_eq!(backup, backups.join("7").join("cached_hero_builds-42.kv3"));
    }

    #[test]
    fn no_prior_file_writes_without_a_backup() {
        let dir = temp_dir("fresh");
        let file = target(&dir);
        let backups = dir.join("backups");
        assert_eq!(write_with_backup(&file, b"new", &backups, 7, 1).unwrap(), None);
        assert_eq!(fs::read_to_string(&file).unwrap(), "new");
        assert!(!backups.exists());
    }

    #[test]
    fn a_second_write_in_the_same_second_keeps_the_first_backup() {
        let dir = temp_dir("twice");
        let file = target(&dir);
        let backups = dir.join("backups");
        fs::write(&file, "v1").unwrap();
        let first = write_with_backup(&file, b"v2", &backups, 7, 5).unwrap().unwrap();
        let second = write_with_backup(&file, b"v3", &backups, 7, 5).unwrap().unwrap();
        assert_ne!(first, second);
        assert_eq!(second, backups.join("7").join("cached_hero_builds-5-1.kv3"));
        assert_eq!(fs::read_to_string(&first).unwrap(), "v1");
        assert_eq!(fs::read_to_string(&second).unwrap(), "v2");
    }

    #[test]
    fn keeps_only_the_newest_ten_backups_by_timestamp() {
        let dir = temp_dir("prune");
        let file = target(&dir);
        let backups = dir.join("backups");
        fs::write(&file, "x").unwrap();
        // Out of order, so mtime order differs from timestamp order.
        for ts in [5u64, 1, 12, 3, 8, 2, 11, 4, 10, 6, 9, 7] {
            write_with_backup(&file, b"x", &backups, 7, ts).unwrap();
        }
        let listed: Vec<u64> = list_backups(&backups, 7).iter().map(|b| b.timestamp).collect();
        assert_eq!(count_files(&backups.join("7")), 10);
        assert_eq!(listed, vec![12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
    }

    #[test]
    fn pruning_leaves_other_accounts_alone() {
        let dir = temp_dir("accounts");
        let file = target(&dir);
        let backups = dir.join("backups");
        fs::write(&file, "x").unwrap();
        write_with_backup(&file, b"x", &backups, 1, 1).unwrap();
        for ts in 1..=12 {
            write_with_backup(&file, b"x", &backups, 2, ts).unwrap();
        }
        assert_eq!(list_backups(&backups, 1).len(), 1);
        assert_eq!(list_backups(&backups, 2).len(), 10);
    }

    #[test]
    fn list_orders_newest_first_with_collisions_after_their_base() {
        let dir = temp_dir("list");
        let acct = dir.join("backups").join("3");
        fs::create_dir_all(&acct).unwrap();
        for name in ["cached_hero_builds-5.kv3", "cached_hero_builds-5-1.kv3", "cached_hero_builds-9.kv3", "notes.txt"]
        {
            fs::write(acct.join(name), "").unwrap();
        }
        let listed: Vec<(u64, u32)> =
            list_backups(&dir.join("backups"), 3).iter().map(|b| (b.timestamp, b.collision)).collect();
        assert_eq!(listed, vec![(9, 0), (5, 1), (5, 0)]);
        assert!(list_backups(&dir.join("backups"), 99).is_empty());
    }

    #[test]
    fn backups_never_land_next_to_the_file_or_under_remote() {
        let dir = temp_dir("placement");
        let file = target(&dir);
        let backups = dir.join("backups");
        fs::write(&file, "old").unwrap();
        write_with_backup(&file, b"new", &backups, 7, 3).unwrap();
        assert_eq!(count_files(file.parent().unwrap()), 1);
        assert_eq!(count_files(file.parent().unwrap().parent().unwrap()), 1);
    }

    #[test]
    fn leaves_the_original_alone_when_the_backup_fails() {
        let dir = temp_dir("blocked");
        let file = target(&dir);
        let backups = dir.join("backups");
        fs::write(&file, "old").unwrap();
        fs::create_dir_all(&backups).unwrap();
        // A plain file squatting on the account folder makes the folder impossible to create.
        fs::write(backups.join("7"), "").unwrap();
        assert!(matches!(write_with_backup(&file, b"new", &backups, 7, 9), Err(WriteError::BackupFailed(_))));
        assert_eq!(fs::read_to_string(&file).unwrap(), "old");
    }

    #[test]
    fn leaves_the_original_alone_when_every_backup_name_is_taken() {
        let dir = temp_dir("names");
        let file = target(&dir);
        let backups = dir.join("backups");
        fs::write(&file, "old").unwrap();
        let acct = backups.join("7");
        fs::create_dir_all(&acct).unwrap();
        for n in 0..64 {
            let name =
                if n == 0 { "cached_hero_builds-9.kv3".to_string() } else { format!("cached_hero_builds-9-{n}.kv3") };
            fs::create_dir(acct.join(name)).unwrap();
        }
        assert!(matches!(write_with_backup(&file, b"new", &backups, 7, 9), Err(WriteError::NoBackupName)));
        assert_eq!(fs::read_to_string(&file).unwrap(), "old");
    }

    #[test]
    fn creates_the_missing_cfg_folder_on_first_save() {
        let dir = temp_dir("nocfg");
        let file = dir.join("userdata").join("1422450").join("remote").join("cfg").join("cached_hero_builds.kv3");
        let backups = dir.join("backups");
        assert_eq!(write_with_backup(&file, b"new", &backups, 7, 1).unwrap(), None);
        assert_eq!(fs::read_to_string(&file).unwrap(), "new");
    }
}
