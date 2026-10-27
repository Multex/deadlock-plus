pub mod commands {
    use crate::command_panics::guarded;
    use crate::features::error::AppError;
    use dp_demos::metadata::{lookup, DemoMetaCache, MetaResult};
    use tauri::{Manager, State};

    #[tauri::command]
    pub async fn demo_metadata(
        app: tauri::AppHandle,
        cache: State<'_, DemoMetaCache>,
        http: State<'_, crate::http::Http>,
        match_id: u64,
    ) -> Result<MetaResult, AppError> {
        guarded(async move {
            let dir = app.path().app_data_dir().map_err(AppError::io)?;
            Ok(lookup(&cache, &http.0, &dir, match_id).await)
        })
        .await
    }
}
