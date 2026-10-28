use crate::command_panics::guarded;
use tauri::{AppHandle, Manager};

use super::restart::RestartAsAdminOutcome;
use super::{AdminAccessOutcome, AdminAccessStatus};
use crate::features::error::AppError;
use crate::features::live::state::LivePhase;
use crate::features::live::LiveService;

#[cfg(windows)]
mod platform {
    use dp_helper::routed;

    use super::super::restart::{relaunch_params, restart_outcome, RestartAsAdminOutcome};
    use super::super::{
        allow_refusal, outcome, remove_result, status, AdminAccessError, AdminAccessOutcome, AdminAccessStatus,
    };
    use crate::features::error::AppError;
    use crate::features::live::state::LivePhase;

    pub fn status_now(phase: LivePhase) -> AdminAccessStatus {
        status(dp_elevation::is_elevated(), routed::route_now(), phase, dp_live::game_access_denied())
    }

    pub fn refusal(phase: LivePhase) -> Option<AppError> {
        allow_refusal(dp_elevation::is_elevated(), phase)
    }

    /// Blocks while the UAC prompt is open.
    pub fn allow(always: bool) -> Result<AdminAccessOutcome, AppError> {
        Ok(outcome(routed::allow(always)))
    }

    pub fn remove() -> Result<(), AppError> {
        remove_result(dp_elevation::is_elevated(), routed::revoke)
    }

    /// Blocks while the UAC prompt is open.
    pub fn restart_as_admin() -> Result<RestartAsAdminOutcome, AppError> {
        if dp_elevation::is_elevated() {
            return Err(AppError::new(AdminAccessError::AlreadyElevated));
        }
        let exe = std::env::current_exe().map_err(|e| AppError::new(AdminAccessError::RestartFailed).detail(e))?;
        restart_outcome(dp_helper::runas::launch_shown(&exe, &relaunch_params(std::process::id())).map(drop))
    }
}

#[cfg(not(windows))]
mod platform {
    use super::super::{AdminAccessError, AdminAccessOutcome, AdminAccessStatus};
    use crate::features::error::AppError;
    use crate::features::live::state::LivePhase;

    pub fn status_now(_phase: LivePhase) -> AdminAccessStatus {
        AdminAccessStatus::unsupported()
    }

    pub fn refusal(_phase: LivePhase) -> Option<AppError> {
        Some(AppError::new(AdminAccessError::Unsupported))
    }

    pub fn allow(_always: bool) -> Result<AdminAccessOutcome, AppError> {
        Err(AppError::new(AdminAccessError::Unsupported))
    }

    pub fn remove() -> Result<(), AppError> {
        Err(AppError::new(AdminAccessError::Unsupported))
    }

    pub fn restart_as_admin() -> Result<super::RestartAsAdminOutcome, AppError> {
        Err(AppError::new(AdminAccessError::Unsupported))
    }
}

fn phase(app: &AppHandle) -> LivePhase {
    app.state::<LiveService>().current().phase
}

#[tauri::command]
pub async fn admin_access_status(app: AppHandle) -> Result<AdminAccessStatus, AppError> {
    guarded(async move {
        let phase = phase(&app);
        crate::command_panics::spawn_blocking_guarded(move || platform::status_now(phase)).await
    })
    .await
}

#[tauri::command]
pub async fn allow_admin_access(app: AppHandle, always: bool) -> Result<AdminAccessOutcome, AppError> {
    guarded(async move {
        if let Some(error) = platform::refusal(phase(&app)) {
            return Err(error);
        }
        crate::command_panics::spawn_blocking_guarded(move || platform::allow(always)).await?
    })
    .await
}

#[tauri::command]
pub async fn remove_admin_access() -> Result<(), AppError> {
    guarded(async move { crate::command_panics::spawn_blocking_guarded(platform::remove).await? }).await
}

/// On `launched` this instance quits through the page, so its pending saves land before the elevated one starts.
#[tauri::command]
pub async fn restart_as_admin(app: AppHandle) -> Result<RestartAsAdminOutcome, AppError> {
    guarded(async move {
        let outcome = crate::command_panics::spawn_blocking_guarded(platform::restart_as_admin).await??;
        if outcome == RestartAsAdminOutcome::Launched {
            log::info!("restarting as administrator");
            crate::features::tray::request_quit(&app);
        }
        Ok(outcome)
    })
    .await
}
