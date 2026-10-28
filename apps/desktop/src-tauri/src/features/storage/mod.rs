mod error;

use serde::Serialize;
use ts_rs::TS;

use crate::features::error::AppError;
use error::StorageError;

#[derive(Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ClearReport {
    pub freed_bytes: u64,
    pub removed: usize,
    pub failed: Vec<AppError>,
}

impl From<dp_storage::ClearReport> for ClearReport {
    fn from(report: dp_storage::ClearReport) -> Self {
        let failed =
            report.failed.into_iter().map(|name| AppError::new(StorageError::RemoveFailed).param("name", name));
        Self { freed_bytes: report.freed_bytes, removed: report.removed, failed: failed.collect() }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_entry_location_lies_under_one_of_the_roots() {
        use dp_storage::{location, Roots, ALL_ENTRIES};
        use std::path::PathBuf;

        let base = PathBuf::from("base");
        let roots = Roots {
            install: Some(base.join("install")),
            userdata: Some(base.join("userdata")),
            app_data: Some(base.join("app_data")),
            logs: Some(base.join("logs")),
        };
        let all = [&roots.install, &roots.userdata, &roots.app_data, &roots.logs].map(|r| r.clone().unwrap());
        for id in ALL_ENTRIES {
            let path = location(id, &roots).unwrap_or_else(|| panic!("{id:?} has no location"));
            assert!(all.iter().any(|root| path.starts_with(root)), "{id:?} resolved to {path:?}");
            assert!(!path.components().any(|c| c == std::path::Component::ParentDir), "{id:?}: {path:?}");
        }
    }

    #[test]
    fn missing_roots_give_no_location_rather_than_a_relative_path() {
        for id in dp_storage::ALL_ENTRIES {
            assert_eq!(dp_storage::location(id, &dp_storage::Roots::default()), None, "{id:?}");
        }
    }

    #[test]
    fn a_failed_removal_carries_a_code_and_the_name_but_no_raw_text() {
        let report = dp_storage::ClearReport { freed_bytes: 3, removed: 1, failed: vec!["a.bin".into()] };
        let json = serde_json::to_value(ClearReport::from(report)).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "freedBytes": 3,
                "removed": 1,
                "failed": [{ "code": "storage.remove_failed", "params": { "name": "a.bin" } }]
            })
        );
    }
}

pub mod commands {
    use super::error::{check_clear, StorageError};
    use super::ClearReport;
    use crate::command_panics::guarded;
    use crate::features::error::AppError;
    use dp_storage::{
        clear_except, entry_stats, is_clearable, location, EntryId, EntryInfo, EntryStats, Roots, ALL_ENTRIES,
    };
    use std::path::PathBuf;
    use tauri::Manager;

    fn current_roots(app: &tauri::AppHandle) -> Roots {
        Roots {
            install: dp_steam::game_install_dir(),
            userdata: dp_steam::current_account().and_then(|a| a.userdata_dir).map(PathBuf::from),
            app_data: app.path().app_data_dir().ok(),
            logs: app.path().app_log_dir().ok(),
        }
    }

    #[tauri::command]
    pub async fn storage_entries(app: tauri::AppHandle) -> Result<Vec<EntryInfo>, AppError> {
        guarded(async move {
            crate::command_panics::spawn_blocking_guarded(move || {
                let roots = current_roots(&app);
                ALL_ENTRIES
                    .into_iter()
                    .map(|id| EntryInfo {
                        id,
                        path: location(id, &roots).filter(|p| p.exists()).map(|p| p.to_string_lossy().into_owned()),
                        clearable: is_clearable(id),
                    })
                    .collect()
            })
            .await
        })
        .await
    }

    #[tauri::command]
    pub async fn storage_entry_stats(app: tauri::AppHandle, id: EntryId) -> Result<EntryStats, AppError> {
        guarded(async move {
            let roots = current_roots(&app);
            crate::command_panics::spawn_blocking_guarded(move || entry_stats(id, &roots)).await
        })
        .await
    }

    /// The frontend sends an entry id, never a path.
    #[tauri::command]
    pub fn storage_reveal(app: tauri::AppHandle, id: EntryId) -> Result<(), AppError> {
        let path = location(id, &current_roots(&app)).filter(|p| p.exists()).ok_or(StorageError::LocationMissing)?;
        crate::features::reveal::show(&path).map_err(|e| {
            log::error!("could not reveal a storage location ({id:?}): {e}");
            AppError::new(StorageError::RevealFailed).detail(e)
        })
    }

    #[tauri::command]
    pub async fn storage_clear(app: tauri::AppHandle, id: EntryId) -> Result<ClearReport, AppError> {
        guarded(async move {
            check_clear(id, dp_game::is_running())
                .inspect_err(|e| log::warn!("storage clear refused ({id:?}): {e}"))?;
            let roots = current_roots(&app);
            let keep: Vec<String> = app
                .state::<crate::features::network::recording::MatchPingService>()
                .recording_key()
                .into_iter()
                .collect();
            crate::command_panics::spawn_blocking_guarded(move || {
                let clear = || clear_except(id, &roots, &keep);
                match app.try_state::<crate::features::salts::record::SaltRecordService>() {
                    Some(record) if id == EntryId::SharedMatches => record.clear_with(clear),
                    _ => clear(),
                }
            })
            .await?
            .map(ClearReport::from)
            .map_err(AppError::internal)
        })
        .await
    }
}
