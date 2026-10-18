use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;
use ts_rs::TS;

#[cfg(windows)]
use super::error::routed_error;
use super::error::{invalid_request, sync_error, unknown_game, ServerPickerError};
use super::state::ServerPickerState;
use crate::features::error::AppError;
use crate::http::Http;
use dp_firewall as firewall;
use dp_firewall::validate;
use dp_server_picker::definitions::{find_definition, load_definitions, GameDefinition};
use dp_server_picker::external;
use dp_server_picker::ping::ping_group;
use dp_server_picker::sdr::{fetch_server_data, ServerData};
use dp_server_picker::sync::{sync_blocks, SyncOutcome};

#[cfg(windows)]
use dp_helper::routed;

#[tauri::command]
pub fn get_game_definitions() -> Vec<GameDefinition> {
    load_definitions()
}

#[tauri::command]
pub async fn fetch_server_groups(http: State<'_, Http>, game_id: String) -> Result<ServerData, AppError> {
    let def = find_definition(&game_id).ok_or_else(|| unknown_game(&game_id))?;
    Ok(fetch_server_data(&http.0, &def).await?)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingGroupRequest {
    pub id: String,
    pub relay_ips: Vec<String>,
}

#[tauri::command]
pub async fn ping_server_groups(groups: Vec<PingGroupRequest>) -> HashMap<String, Option<u32>> {
    let futures = groups.into_iter().map(|g| async move {
        let ms = ping_group(&g.relay_ips).await;
        (g.id, ms)
    });
    let results: HashMap<String, Option<u32>> = futures::future::join_all(futures).await.into_iter().collect();
    log::debug!("pinged {} group(s), {} answered", results.len(), results.values().filter(|ms| ms.is_some()).count());
    results
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockGroupRequest {
    pub id: String,
    pub description: String,
    pub relay_ips: Vec<String>,
}

#[tauri::command]
pub async fn block_server_groups(groups: Vec<BlockGroupRequest>) -> Result<(), AppError> {
    for g in &groups {
        validate::validate_block_request(&g.id, &g.description, &g.relay_ips).map_err(invalid_request)?;
    }
    log::info!(
        "blocking {} server group(s): {}",
        groups.len(),
        groups.iter().map(|g| g.id.as_str()).collect::<Vec<_>>().join(", ")
    );
    let specs: Vec<firewall::FirewallRuleSpec> = groups
        .into_iter()
        .map(|g| firewall::FirewallRuleSpec { group_id: g.id, description: g.description, relay_ips: g.relay_ips })
        .collect();
    tauri::async_runtime::spawn_blocking(move || block(&specs)).await.map_err(AppError::internal)?
}

#[cfg(windows)]
fn block(specs: &[firewall::FirewallRuleSpec]) -> Result<(), AppError> {
    routed::block_groups(specs).map_err(|e| routed_error(e, ServerPickerError::BlockFailed))
}

#[cfg(not(windows))]
fn block(specs: &[firewall::FirewallRuleSpec]) -> Result<(), AppError> {
    firewall::block_groups(specs).map_err(|e| AppError::new(ServerPickerError::BlockFailed).detail(e))
}

#[tauri::command]
pub async fn unblock_server_groups(ids: Vec<String>) -> Result<(), AppError> {
    ids.iter().try_for_each(|id| validate::validate_group_id(id)).map_err(invalid_request)?;
    log::info!("unblocking {} server group(s): {}", ids.len(), ids.join(", "));
    tauri::async_runtime::spawn_blocking(move || unblock(&ids)).await.map_err(AppError::internal)?
}

#[cfg(windows)]
fn unblock(ids: &[String]) -> Result<(), AppError> {
    routed::unblock_groups(ids).map_err(|e| routed_error(e, ServerPickerError::UnblockFailed))
}

#[cfg(not(windows))]
fn unblock(ids: &[String]) -> Result<(), AppError> {
    firewall::unblock_groups(ids).map_err(|e| AppError::new(ServerPickerError::UnblockFailed).detail(e))
}

#[tauri::command]
pub async fn sync_server_blocks(
    app: tauri::AppHandle,
    state: State<'_, ServerPickerState>,
    http: State<'_, Http>,
) -> Result<SyncOutcome, AppError> {
    if !firewall::SUPPORTED || !super::sync::is_enabled(&app) {
        return Ok(SyncOutcome::default());
    }
    let outcome = sync_blocks(&state.sync_lock, &http.0, true, super::sync::REFRESH).await.map_err(sync_error)?;
    if !outcome.updated.is_empty() {
        log::info!("updated {} stale block(s): {}", outcome.updated.len(), outcome.updated.join(", "));
    }
    Ok(outcome)
}

#[tauri::command]
pub async fn list_blocked_group_ids(candidate_ids: Vec<String>) -> Result<Vec<String>, AppError> {
    candidate_ids.iter().try_for_each(|id| validate::validate_group_id(id)).map_err(invalid_request)?;
    tauri::async_runtime::spawn_blocking(move || {
        firewall::list_blocked(&candidate_ids)
            .map_err(|e| AppError::new(ServerPickerError::ListBlockedFailed).detail(e))
    })
    .await
    .map_err(AppError::internal)?
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct FirewallCapability {
    pub supported: bool,
}

#[tauri::command]
pub fn firewall_capability() -> FirewallCapability {
    FirewallCapability { supported: firewall::SUPPORTED }
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ExternalScan {
    pub rule_names: Vec<String>,
    pub sources: Vec<String>,
    pub covered_group_ids: Vec<String>,
}

#[tauri::command]
pub async fn detect_external_blocks(http: State<'_, Http>, game_id: String) -> Result<ExternalScan, AppError> {
    let def = find_definition(&game_id).ok_or_else(|| unknown_game(&game_id))?;
    let data = fetch_server_data(&http.0, &def).await?;
    let scan =
        external::scan(&data, &def).map_err(|e| AppError::new(ServerPickerError::ExternalScanFailed).detail(e))?;
    log::debug!("external block scan: {} rule(s), {} covered group(s)", scan.rules.len(), scan.covered_group_ids.len());
    Ok(ExternalScan {
        rule_names: scan.rules.iter().map(|r| r.name.clone()).collect(),
        sources: scan.sources,
        covered_group_ids: scan.covered_group_ids,
    })
}

#[tauri::command]
pub async fn import_external_blocks(http: State<'_, Http>, game_id: String) -> Result<Vec<String>, AppError> {
    let def = find_definition(&game_id).ok_or_else(|| unknown_game(&game_id))?;
    let data = fetch_server_data(&http.0, &def).await?;
    let scan =
        external::scan(&data, &def).map_err(|e| AppError::new(ServerPickerError::ExternalScanFailed).detail(e))?;
    log::info!(
        "importing external blocks from {} rule(s) covering {} group(s)",
        scan.rules.len(),
        scan.covered_group_ids.len()
    );
    import(data, scan).await
}

#[cfg(windows)]
async fn import(data: ServerData, scan: external::ScanResult) -> Result<Vec<String>, AppError> {
    let plan = external::import_plan(&data, &scan);
    tauri::async_runtime::spawn_blocking(move || {
        let failed = |e| routed_error(e, ServerPickerError::ExternalImportFailed);
        routed::block_groups(&plan.specs).map_err(failed)?;
        routed::remove_rules_by_name(&plan.removable).map_err(failed)?;
        Ok(plan.group_ids)
    })
    .await
    .map_err(AppError::internal)?
}

#[cfg(not(windows))]
async fn import(data: ServerData, scan: external::ScanResult) -> Result<Vec<String>, AppError> {
    external::import(&data, &scan).map_err(|e| AppError::new(ServerPickerError::ExternalImportFailed).detail(e))
}
