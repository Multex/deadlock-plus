pub mod commands {
    use crate::command_panics::guarded;
    use crate::features::error::AppError;
    use dp_steam::SteamAccount;

    #[tauri::command]
    pub async fn current_steam_account() -> Result<Option<SteamAccount>, AppError> {
        guarded(async move { crate::command_panics::spawn_blocking_guarded(dp_steam::current_account).await }).await
    }

    #[tauri::command]
    pub async fn local_steam_account_ids() -> Result<Vec<u32>, AppError> {
        guarded(async move { crate::command_panics::spawn_blocking_guarded(dp_steam::local_account_ids).await }).await
    }
}
