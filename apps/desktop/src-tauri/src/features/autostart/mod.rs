use crate::features::error::{error_codes, AppError};
use serde::Serialize;
use ts_rs::TS;

error_codes! {
    #[allow(dead_code)]
    pub enum AutostartError in "autostart" {
        EntryWriteFailed = "entry_write_failed",
        EntryRemoveFailed = "entry_remove_failed",
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AutostartStatus {
    /// False where no autostart backend exists; the UI hides the toggle.
    pub supported: bool,
    pub enabled: bool,
    /// The entry exists but launches a different exe than the running one (the app was moved or reinstalled).
    pub stale: bool,
}

#[cfg(windows)]
mod platform {
    use super::*;
    use dp_autostart::run_key::{APPROVED_KEY, RUN_KEY};

    fn current_exe() -> Result<String, AppError> {
        std::env::current_exe().map(|p| p.to_string_lossy().into_owned()).map_err(AppError::io)
    }

    pub fn status() -> Result<AutostartStatus, AppError> {
        let state = run_key::status(RUN_KEY, APPROVED_KEY, &current_exe()?)?;
        Ok(AutostartStatus { supported: true, enabled: state.enabled, stale: state.stale })
    }

    pub fn enable() -> Result<(), AppError> {
        run_key::enable(RUN_KEY, APPROVED_KEY, &current_exe()?)
    }

    pub fn disable() -> Result<(), AppError> {
        run_key::disable(RUN_KEY, APPROVED_KEY)
    }
}

#[cfg(not(windows))]
mod platform {
    use super::*;

    pub fn status() -> Result<AutostartStatus, AppError> {
        let state = dp_autostart::state().map_err(AppError::io)?;
        Ok(AutostartStatus { supported: true, enabled: state.enabled, stale: state.stale })
    }
    pub fn enable() -> Result<(), AppError> {
        dp_autostart::enable().map_err(|e| AppError::new(AutostartError::EntryWriteFailed).detail(e))
    }
    pub fn disable() -> Result<(), AppError> {
        dp_autostart::disable().map_err(|e| AppError::new(AutostartError::EntryRemoveFailed).detail(e))
    }
}

#[cfg(windows)]
mod run_key;

pub mod commands {
    use super::*;
    use crate::command_panics::guarded;

    #[tauri::command]
    pub async fn autostart_status() -> Result<AutostartStatus, AppError> {
        guarded(
            async move { tauri::async_runtime::spawn_blocking(platform::status).await.map_err(AppError::internal)? },
        )
        .await
    }

    #[tauri::command]
    pub async fn set_autostart(enabled: bool) -> Result<AutostartStatus, AppError> {
        guarded(async move {
            tauri::async_runtime::spawn_blocking(move || {
                if enabled { platform::enable() } else { platform::disable() }?;
                log::info!("autostart {}", if enabled { "enabled" } else { "disabled" });
                platform::status()
            })
            .await
            .map_err(AppError::internal)?
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_autostart_code_is_in_the_english_catalog() {
        crate::features::error::assert_catalogued::<AutostartError>();
    }
}
