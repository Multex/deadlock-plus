use crate::command_panics::guarded_infallible;
use crate::features::error::AppError;
use tauri::{AppHandle, Manager};

use super::board::LiveMatch;
use super::{LiveService, LiveState};

#[tauri::command]
pub async fn get_live_state(app: AppHandle) -> Result<LiveState, AppError> {
    guarded_infallible(async move { app.state::<LiveService>().current() }).await
}

#[tauri::command]
pub async fn get_live_match(app: AppHandle) -> Result<LiveMatch, AppError> {
    guarded_infallible(async move { app.state::<LiveService>().current_match() }).await
}
