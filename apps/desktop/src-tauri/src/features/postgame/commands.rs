use crate::command_panics::guarded_infallible;
use crate::features::error::AppError;
use dp_postgame::StoredMatch;
use tauri::{AppHandle, Manager};

use super::PostgameService;

#[tauri::command]
pub async fn get_postgame_matches(account_id: u32, app: AppHandle) -> Result<Vec<StoredMatch>, AppError> {
    guarded_infallible(async move { app.state::<PostgameService>().matches(&app, account_id) }).await
}

#[tauri::command]
pub async fn reconcile_postgame_matches(
    account_id: u32,
    api_match_ids: Vec<u64>,
    app: AppHandle,
) -> Result<usize, AppError> {
    guarded_infallible(async move { app.state::<PostgameService>().reconcile(&app, account_id, &api_match_ids) }).await
}

#[tauri::command]
pub async fn get_postgame_detail(match_id: u64, app: AppHandle) -> Result<Option<serde_json::Value>, AppError> {
    guarded_infallible(async move {
        let account_id = dp_steam::current_steam_id32()?;
        crate::command_panics::spawn_blocking_guarded(move || {
            app.state::<PostgameService>().detail(&app, account_id, match_id)
        })
        .await
        .ok()
        .flatten()
    })
    .await
}
