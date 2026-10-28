use crate::command_panics::guarded;
use dp_diagnostics::addons::addons_dir;
use dp_diagnostics::scan::AddonScanReport;

use super::scan_job::{self, AddonScanState};
use crate::features::error::AppError;
use crate::features::jobs::JobsState;
use tauri::Manager;

#[tauri::command]
pub async fn start_addon_scan(app: tauri::AppHandle, force: bool) -> Result<(), AppError> {
    guarded(async move {
        let jobs = app.state::<JobsState>();
        if jobs.registry.is_active(scan_job::JOB.id) {
            if force {
                jobs.registry.force_run(scan_job::JOB.id);
            }
            return Ok(());
        }
        app.state::<AddonScanState>().reset();
        let handle = jobs.registry.register(scan_job::JOB);
        if force {
            jobs.registry.force_run(scan_job::JOB.id);
        }
        let dir = addons_dir();
        tauri::async_runtime::spawn_blocking(move || {
            scan_job::run(dir.as_deref(), &handle, &app.state::<AddonScanState>());
        });
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn addon_scan_report(state: tauri::State<'_, AddonScanState>) -> Result<AddonScanReport, AppError> {
    guarded(async move { Ok(state.report()) }).await
}
