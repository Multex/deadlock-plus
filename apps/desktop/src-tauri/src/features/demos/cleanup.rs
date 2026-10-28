pub mod commands {
    use crate::command_panics::guarded;
    use crate::features::demos::error::DemosError;
    use crate::features::demos::replays_dir;
    use crate::features::error::AppError;
    use dp_demos::cleanup::{load_rules, save_rules, select, validate, CleanupMatch, Rule};
    use dp_demos::list_demos_in;
    use dp_demos::pin::PinStore;
    use tauri::{Manager, State};

    fn app_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, AppError> {
        app.path().app_data_dir().map_err(AppError::io)
    }

    #[tauri::command]
    pub async fn list_cleanup_rules(app: tauri::AppHandle) -> Result<Vec<Rule>, AppError> {
        guarded(async move {
            let path = app_dir(&app)?.join("demo-cleanup-rules.json");
            crate::command_panics::spawn_blocking_guarded(move || load_rules(&path)).await
        })
        .await
    }

    #[tauri::command]
    pub async fn save_cleanup_rules(app: tauri::AppHandle, rules: Vec<Rule>) -> Result<(), AppError> {
        guarded(async move {
            validate(&rules)?;
            let dir = app_dir(&app)?;
            crate::command_panics::spawn_blocking_guarded(move || {
                std::fs::create_dir_all(&dir).map_err(AppError::io)?;
                save_rules(&dir.join("demo-cleanup-rules.json"), &rules).map_err(|e| {
                    log::error!("could not save the cleanup rules: {e}");
                    AppError::new(DemosError::RulesSaveFailed).detail(e)
                })?;
                log::info!("cleanup rules saved ({} rules)", rules.len());
                Ok(())
            })
            .await?
        })
        .await
    }

    /// Only a preview: nothing is deleted here. The frontend sends the chosen file names through
    /// the normal delete flow, which applies its own guards.
    #[tauri::command]
    pub async fn cleanup_matches(
        app: tauri::AppHandle,
        pins: State<'_, PinStore>,
    ) -> Result<Vec<CleanupMatch>, AppError> {
        guarded(async move {
            let dir = app_dir(&app)?;
            let pins = pins.snapshot(&dir);
            crate::command_panics::spawn_blocking_guarded(move || {
                let Some(replays) = replays_dir() else {
                    return Vec::new();
                };
                let now_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_or(0, |d| d.as_millis() as u64);
                let rules = load_rules(&dir.join("demo-cleanup-rules.json"));
                let matches = select(&rules, &list_demos_in(&replays), &pins, now_ms);
                log::info!("cleanup preview: {} replays match {} rules", matches.len(), rules.len());
                matches
            })
            .await
        })
        .await
    }
}
