use std::path::Path;
use std::sync::Mutex;

use dp_ingest::record::{SaltRecord, VERSION};
use dp_storage::shared_matches;
use dp_sync::LockExt;
use serde::Deserialize;

/// The one writer of the shared matches record, so two sends never save over each other.
#[derive(Default)]
pub struct SaltRecordService {
    state: Mutex<Option<Loaded>>,
}

struct Loaded {
    record: SaltRecord,
    /// Off when the file could not be read or came from another Deadlock+ version: replacing it would lose a
    /// record this build cannot see. A file that does not parse at all holds nothing to keep and is replaced.
    save: bool,
}

#[derive(Deserialize)]
struct StoredVersion {
    version: u32,
}

fn load(app_data: &Path) -> Loaded {
    let bytes = match shared_matches::read(app_data) {
        Ok(Some(bytes)) => bytes,
        Ok(None) => return Loaded { record: SaltRecord::default(), save: true },
        Err(e) => {
            log::warn!("could not read the shared matches record, keeping it for this session only: {e}");
            return Loaded { record: SaltRecord::default(), save: false };
        }
    };
    match serde_json::from_slice(&bytes) {
        Ok(record) => Loaded { record, save: true },
        Err(e) => {
            let foreign = serde_json::from_slice::<StoredVersion>(&bytes).is_ok_and(|s| s.version != VERSION);
            if foreign {
                log::warn!("the shared matches record is from another Deadlock+ version, leaving it untouched: {e}");
            } else {
                log::warn!("the shared matches record is unreadable and will be replaced: {e}");
            }
            Loaded { record: SaltRecord::default(), save: !foreign }
        }
    }
}

fn save(app_data: &Path, record: &SaltRecord) {
    let written = serde_json::to_vec(record)
        .map_err(std::io::Error::other)
        .and_then(|bytes| shared_matches::write(app_data, &bytes));
    if let Err(e) = written {
        log::warn!("could not save the shared matches record: {e}");
    }
}

impl SaltRecordService {
    pub fn read<R>(&self, app_data: &Path, f: impl FnOnce(&SaltRecord) -> R) -> R {
        let mut state = self.state.lock_or_recover();
        f(&state.get_or_insert_with(|| load(app_data)).record)
    }

    /// Saves the record when `f` reports a change.
    pub fn update(&self, app_data: &Path, f: impl FnOnce(&mut SaltRecord) -> bool) -> bool {
        let mut state = self.state.lock_or_recover();
        let loaded = state.get_or_insert_with(|| load(app_data));
        let changed = f(&mut loaded.record);
        if changed && loaded.save {
            save(app_data, &loaded.record);
        }
        changed
    }

    /// Runs `clear` with the record locked, so no save lands between the file going and the record being
    /// forgotten. The next use reads the file again.
    pub fn clear_with<T>(&self, clear: impl FnOnce() -> T) -> T {
        let mut state = self.state.lock_or_recover();
        let cleared = clear();
        *state = None;
        cleared
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dp_ingest::record::Source;
    use dp_ingest::salts::Salts;
    use std::fs;
    use std::path::PathBuf;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-salt-record-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn salts(id: u64) -> Salts {
        Salts { match_id: id, cluster_id: Some(7), metadata_salt: Some(11), replay_salt: Some(22), username: None }
    }

    fn mark(service: &SaltRecordService, dir: &Path, id: u64, now: i64) -> bool {
        service.update(dir, |r| r.mark(&salts(id), Source::Steam, now))
    }

    #[test]
    fn a_marked_record_reads_back_after_a_restart() {
        let dir = temp_dir("restart");
        let service = SaltRecordService::default();
        assert!(mark(&service, &dir, 5, 100));
        assert!(!mark(&service, &dir, 5, 200));

        let saved = service.read(&dir, Clone::clone);
        assert_eq!(saved.sent_at(5), Some(100));
        let restarted = SaltRecordService::default();
        assert_eq!(restarted.read(&dir, Clone::clone), saved);
    }

    #[test]
    fn the_file_is_read_once() {
        let dir = temp_dir("once");
        let service = SaltRecordService::default();
        mark(&service, &dir, 5, 100);
        fs::remove_file(dp_storage::shared_matches::path(&dir)).unwrap();
        assert_eq!(service.read(&dir, |r| r.sent_at(5)), Some(100));
    }

    #[test]
    fn a_clear_starts_the_record_over() {
        let dir = temp_dir("clear");
        let service = SaltRecordService::default();
        mark(&service, &dir, 5, 100);

        service.clear_with(|| fs::remove_file(dp_storage::shared_matches::path(&dir)).unwrap());
        assert!(service.read(&dir, SaltRecord::is_empty));
        assert!(mark(&service, &dir, 6, 200));
        let restarted = SaltRecordService::default();
        assert_eq!(restarted.read(&dir, |r| (r.sent_at(5), r.sent_at(6))), (None, Some(200)));
    }

    #[test]
    fn a_file_from_a_newer_version_is_never_overwritten() {
        let dir = temp_dir("newer");
        let newer = br#"{"version":2,"entries":[],"more":true}"#;
        dp_storage::shared_matches::write(&dir, newer).unwrap();

        let service = SaltRecordService::default();
        assert!(service.read(&dir, SaltRecord::is_empty));
        assert!(mark(&service, &dir, 5, 100));
        assert_eq!(service.read(&dir, |r| r.sent_at(5)), Some(100));
        assert_eq!(dp_storage::shared_matches::read(&dir).unwrap().unwrap(), newer);
    }

    #[test]
    fn a_broken_file_is_replaced_by_the_next_change() {
        let dir = temp_dir("broken");
        dp_storage::shared_matches::write(&dir, b"{not json").unwrap();

        let service = SaltRecordService::default();
        assert!(service.read(&dir, SaltRecord::is_empty));
        assert!(mark(&service, &dir, 5, 100));
        let restarted = SaltRecordService::default();
        assert_eq!(restarted.read(&dir, |r| r.sent_at(5)), Some(100));
    }
}
