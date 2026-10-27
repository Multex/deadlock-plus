pub mod cleanup;
pub mod error;
pub mod metadata;
pub mod pin;

use std::path::{Path, PathBuf};

pub fn replays_dir() -> Option<PathBuf> {
    let dir = dp_steam::replays_dir(&dp_steam::game_install_dir()?);
    dir.is_dir().then_some(dir)
}

pub fn replay_path(dir: &Path, id: u64, partial: bool) -> PathBuf {
    dir.join(if partial { format!("{id}.dem.partial") } else { format!("{id}.dem") })
}

pub mod commands {
    use crate::command_panics::guarded;
    use serde::{Deserialize, Serialize};

    use super::error::DemosError;
    use super::replays_dir;
    use crate::features::error::AppError;
    use dp_demos::delete::{
        availability_for, bin_info, delete_permanently, delete_to_bin, resolve_targets, RecycleAvailability,
    };
    use dp_demos::pin::{split_pinned, PinStore};
    use dp_demos::{list_demos_in, DemoListing};
    use tauri::{Manager, State};
    use ts_rs::TS;

    fn pins_for(app: &tauri::AppHandle, store: &PinStore) -> Result<dp_demos::pin::Pins, AppError> {
        let dir = app.path().app_data_dir().map_err(AppError::io)?;
        Ok(store.snapshot(&dir))
    }

    #[tauri::command]
    pub async fn list_demos() -> Result<DemoListing, AppError> {
        guarded(async move {
            tauri::async_runtime::spawn_blocking(|| {
                let Some(dir) = replays_dir() else {
                    return DemoListing { dir: None, reference_build: None, demos: Vec::new() };
                };
                let demos = list_demos_in(&dir);
                log::debug!("listed {} replays", demos.len());
                let reference_build = demos.iter().filter_map(|d| d.build_num).max();
                DemoListing { dir: Some(dir.to_string_lossy().into_owned()), reference_build, demos }
            })
            .await
            .map_err(AppError::internal)
        })
        .await
    }

    #[derive(Serialize, TS)]
    #[ts(export)]
    #[serde(rename_all = "camelCase")]
    pub struct DeletePreview {
        pub count: usize,
        pub total_bytes: u64,
        pub recycle: RecycleAvailability,
        pub bin_free_bytes: Option<u64>,
    }

    #[derive(Serialize, TS)]
    #[ts(export)]
    #[serde(rename_all = "camelCase")]
    pub struct DeleteFailure {
        pub file_name: String,
        pub error: AppError,
    }

    #[derive(Serialize, TS)]
    #[ts(export)]
    #[serde(rename_all = "camelCase")]
    pub struct DeleteReport {
        pub deleted: Vec<String>,
        pub failed: Vec<DeleteFailure>,
    }

    impl From<dp_demos::delete::DeleteReport> for DeleteReport {
        fn from(report: dp_demos::delete::DeleteReport) -> Self {
            let failed =
                report.failed.into_iter().map(|f| DeleteFailure { file_name: f.file_name, error: f.reason.into() });
            Self { deleted: report.deleted, failed: failed.collect() }
        }
    }

    #[derive(Deserialize, TS)]
    #[ts(export)]
    #[serde(rename_all = "camelCase")]
    pub enum DeleteMode {
        Recycle,
        Permanent,
    }

    #[tauri::command]
    pub async fn delete_preview(
        app: tauri::AppHandle,
        store: State<'_, PinStore>,
        file_names: Vec<String>,
    ) -> Result<DeletePreview, AppError> {
        guarded(async move {
            let pins = pins_for(&app, &store)?;
            tauri::async_runtime::spawn_blocking(move || {
                let dir = replays_dir().ok_or(DemosError::ReplaysFolderNotFound)?;
                let (file_names, _) = split_pinned(&file_names, &pins);
                let (targets, _) = resolve_targets(&dir, &file_names);
                let total_bytes = targets.iter().map(|t| t.size).sum();
                Ok(DeletePreview {
                    count: targets.len(),
                    total_bytes,
                    recycle: availability_for(&dir, total_bytes),
                    bin_free_bytes: bin_info(&dir).map(|b| b.limit.saturating_sub(b.used)),
                })
            })
            .await
            .map_err(AppError::internal)?
        })
        .await
    }

    /// Recycling is re-checked here; a request the bin cannot hold is refused, never turned into
    /// a permanent delete.
    #[tauri::command]
    pub async fn delete_demos(
        app: tauri::AppHandle,
        store: State<'_, PinStore>,
        file_names: Vec<String>,
        mode: DeleteMode,
    ) -> Result<DeleteReport, AppError> {
        guarded(async move {
            let pins = pins_for(&app, &store)?;
            tauri::async_runtime::spawn_blocking(move || {
                let dir = replays_dir().ok_or(DemosError::ReplaysFolderNotFound)?;
                let (file_names, mut pinned_refusals) = split_pinned(&file_names, &pins);
                let (targets, mut failed) = resolve_targets(&dir, &file_names);
                failed.append(&mut pinned_refusals);
                let mut report = match mode {
                    DeleteMode::Permanent => delete_permanently(targets),
                    DeleteMode::Recycle => {
                        let total = targets.iter().map(|t| t.size).sum();
                        if availability_for(&dir, total) != RecycleAvailability::Available {
                            log::error!("replay delete refused: the Recycle Bin cannot hold {total} bytes");
                            return Err(DemosError::RecycleBinFull.into());
                        }
                        delete_to_bin(targets)
                    }
                };
                report.failed.append(&mut failed);
                log::info!(
                    "replays deleted: {} {}, {} failed or skipped",
                    report.deleted.len(),
                    match mode {
                        DeleteMode::Permanent => "permanently",
                        DeleteMode::Recycle => "to the Recycle Bin",
                    },
                    report.failed.len()
                );
                Ok(DeleteReport::from(report))
            })
            .await
            .map_err(AppError::internal)?
        })
        .await
    }

    #[tauri::command]
    pub fn open_replays_dir() -> Result<(), AppError> {
        let dir = replays_dir().ok_or(DemosError::ReplaysFolderNotFound)?;
        crate::features::reveal::show(&dir).map_err(|e| {
            log::error!("could not open the replays folder: {e}");
            AppError::new(DemosError::RevealFailed).detail(e)
        })
    }

    /// The frontend passes a match id, never a path; the file is resolved inside the replays folder.
    #[tauri::command]
    pub fn reveal_demo(match_id: String, partial: bool) -> Result<(), AppError> {
        let id: u64 = match_id.parse().map_err(|_| DemosError::InvalidMatchId)?;
        let dir = replays_dir().ok_or(DemosError::ReplaysFolderNotFound)?;
        let path = super::replay_path(&dir, id, partial);
        if !path.is_file() {
            log::warn!("reveal requested for a missing replay ({id})");
            return Err(DemosError::ReplayMissing.into());
        }
        crate::features::reveal::show(&path).map_err(|e| {
            log::error!("could not reveal replay {id}: {e}");
            AppError::new(DemosError::RevealFailed).detail(e)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::commands::DeleteReport;
    use super::replay_path;
    use dp_demos::delete::{Failure, FailureReason};
    use std::path::Path;

    #[test]
    fn a_failed_delete_carries_a_code_and_the_file_name_but_no_raw_text() {
        let report = dp_demos::delete::DeleteReport {
            deleted: vec!["1.dem".into()],
            failed: vec![Failure { file_name: "2.dem".into(), reason: FailureReason::Pinned }],
        };
        let json = serde_json::to_value(DeleteReport::from(report)).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "deleted": ["1.dem"],
                "failed": [{ "fileName": "2.dem", "error": { "code": "demos.replay_pinned", "params": {} } }]
            })
        );
    }

    #[test]
    fn a_replay_path_is_a_single_file_name_inside_the_folder() {
        let dir = Path::new("replays");
        for (id, partial, name) in
            [(0, false, "0.dem"), (42, true, "42.dem.partial"), (u64::MAX, false, "18446744073709551615.dem")]
        {
            let path = replay_path(dir, id, partial);
            assert_eq!(path.parent(), Some(dir));
            assert_eq!(path.file_name().and_then(|n| n.to_str()), Some(name));
        }
    }

    #[test]
    fn only_a_plain_number_parses_as_a_match_id() {
        for hostile in ["../1", "1/../../x", r"..\1", r"C:\x", "-1", "1.dem", " 1", ""] {
            assert!(hostile.parse::<u64>().is_err(), "{hostile:?} parsed");
        }
    }
}
