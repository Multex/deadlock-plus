pub mod commands {
    use crate::command_panics::guarded;
    use crate::features::demos::error::DemosError;
    use crate::features::error::AppError;
    use dp_demos::pin::PinStore;
    use tauri::Manager;

    fn dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, AppError> {
        app.path().app_data_dir().map_err(AppError::io)
    }

    #[tauri::command]
    pub async fn list_pinned(app: tauri::AppHandle) -> Result<Vec<u64>, AppError> {
        guarded(async move {
            let dir = dir(&app)?;
            tauri::async_runtime::spawn_blocking(move || app.state::<PinStore>().snapshot(&dir).ids())
                .await
                .map_err(AppError::internal)
        })
        .await
    }

    #[tauri::command]
    pub async fn set_pinned(app: tauri::AppHandle, match_id: u64, pinned: bool) -> Result<Vec<u64>, AppError> {
        guarded(async move {
            let dir = dir(&app)?;
            tauri::async_runtime::spawn_blocking(move || {
                let pins = app
                    .state::<PinStore>()
                    .update(&dir, |p| {
                        if pinned {
                            p.pin(match_id);
                        } else {
                            p.unpin(match_id);
                        }
                    })
                    .map_err(|e| AppError::new(DemosError::PinSaveFailed).detail(e))?;
                log::debug!("replay {match_id} {}", if pinned { "pinned" } else { "unpinned" });
                Ok(pins.ids())
            })
            .await
            .map_err(AppError::internal)?
        })
        .await
    }
}
