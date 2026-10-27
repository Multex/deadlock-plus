mod error;

pub mod commands {
    use super::error::{check_writable, VoiceBansError};
    use crate::command_panics::guarded;
    use crate::features::error::AppError;
    use dp_voice_bans::{backup_then_write, current_path, game_running_recent, VoiceBanFile};

    #[tauri::command]
    pub async fn is_game_running() -> Result<bool, AppError> {
        guarded(async move { crate::command_panics::spawn_blocking_guarded(game_running_recent).await }).await
    }

    #[tauri::command]
    pub async fn read_voice_ban() -> Result<VoiceBanFile, AppError> {
        guarded(async move { crate::command_panics::spawn_blocking_guarded(read_voice_ban_blocking).await? }).await
    }

    fn read_voice_ban_blocking() -> Result<VoiceBanFile, AppError> {
        let path = current_path()?;
        let game_running = game_running_recent();
        let (exists, text) = match std::fs::read(&path) {
            Ok(bytes) => (true, String::from_utf8(bytes).map_err(|_| VoiceBansError::NotUtf8)?),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (false, String::new()),
            Err(e) => {
                log::error!("could not read voice_ban.dt: {e}");
                return Err(AppError::new(VoiceBansError::ReadFailed).param("path", path.display()).detail(e));
            }
        };
        Ok(VoiceBanFile { path: path.to_string_lossy().into_owned(), exists, text, game_running })
    }

    /// The target is always the current account's own file; the frontend never supplies a path.
    #[tauri::command]
    pub async fn write_voice_ban(text: String) -> Result<String, AppError> {
        guarded(
            async move { crate::command_panics::spawn_blocking_guarded(move || write_voice_ban_blocking(text)).await? },
        )
        .await
    }

    fn write_voice_ban_blocking(text: String) -> Result<String, AppError> {
        check_writable(&text, dp_game::is_running()).inspect_err(|e| log::warn!("mute list write refused: {e}"))?;
        let path = current_path()?;
        let timestamp =
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(AppError::internal)?.as_secs();
        Ok(backup_then_write(&path, text.as_bytes(), timestamp)?.to_string_lossy().into_owned())
    }
}
