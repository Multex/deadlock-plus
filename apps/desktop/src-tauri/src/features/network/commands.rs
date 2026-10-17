use std::collections::HashMap;
use std::net::Ipv4Addr;
use std::sync::Arc;

use dp_network::{
    points_in_range_file, summarize_file, HistoryPoint, MatchPingSeries, MatchStore, NetworkMonitor, PingSummary,
    PopInfo, RelayMap, RelaySource, Snapshot,
};
use dp_server_picker::definitions::find_definition;
use dp_server_picker::sdr::fetch_server_data;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use super::recording::{EnginePingView, MatchPingService};
use crate::http::Http;

const HISTORY_FILE: &str = "connection-history.jsonl";
const GAME_ID: &str = "deadlock";

fn relay_source(http: reqwest::Client) -> RelaySource {
    Arc::new(move || {
        let http = http.clone();
        Box::pin(async move {
            let def = find_definition(GAME_ID).ok_or_else(|| format!("no game definition for {GAME_ID}"))?;
            let data = fetch_server_data(&http, &def).await.map_err(|e| e.to_string())?;
            let mut map: RelayMap = HashMap::new();
            for group in &data.unclustered {
                for ip in group.relay_ips.iter().filter_map(|ip| ip.parse::<Ipv4Addr>().ok()) {
                    map.insert(
                        ip,
                        PopInfo {
                            code: group.id.clone(),
                            description: group.description.clone(),
                            country_code: group.country_code.clone(),
                        },
                    );
                }
            }
            Ok(map)
        })
    })
}

pub fn start_monitor(app: &AppHandle, prompt: bool) {
    let dir = match app.path().app_data_dir() {
        Ok(dir) => dir,
        Err(e) => {
            log::error!("network monitor not started, no app data dir: {e}");
            return;
        }
    };
    let http = app.state::<Http>().0.clone();
    let runtime = tauri::async_runtime::handle();
    app.state::<NetworkMonitor>().start(
        runtime.inner(),
        relay_source(http),
        dir.join(HISTORY_FILE),
        prompt,
        dp_connection::start,
    );
}

#[tauri::command]
pub fn start_network_monitor(app: AppHandle, allow_prompt: bool) {
    start_monitor(&app, allow_prompt);
}

#[tauri::command]
pub fn network_snapshot(monitor: State<'_, NetworkMonitor>) -> Snapshot {
    monitor.snapshot()
}

#[tauri::command]
pub fn network_history(monitor: State<'_, NetworkMonitor>) -> Vec<HistoryPoint> {
    monitor.history()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkPoll {
    snapshot: Snapshot,
    tail: Vec<HistoryPoint>,
}

/// Snapshot plus only the history points newer than `since_t`, in one round trip.
#[tauri::command]
pub fn network_poll(monitor: State<'_, NetworkMonitor>, since_t: Option<u64>) -> NetworkPoll {
    NetworkPoll { snapshot: monitor.snapshot(), tail: monitor.history_after(since_t) }
}

/// Reads the on-disk log, which holds far more than the in-memory window, so a long match is covered whole.
#[tauri::command]
pub async fn network_history_range(app: AppHandle, start_ms: u64, end_ms: u64) -> Result<Option<PingSummary>, String> {
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?.join(HISTORY_FILE);
    tauri::async_runtime::spawn_blocking(move || summarize_file(&path, start_ms, end_ms))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Raw pings over `[start_ms, end_ms]`, thinned to at most `max_points` so a long match stays cheap to draw.
#[tauri::command]
pub async fn network_history_points(
    app: AppHandle,
    start_ms: u64,
    end_ms: u64,
    max_points: usize,
) -> Result<Vec<HistoryPoint>, String> {
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?.join(HISTORY_FILE);
    tauri::async_runtime::spawn_blocking(move || points_in_range_file(&path, start_ms, end_ms, max_points))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// The game's own ping, loss and jitter to the match server; `None` outside a match or when unreadable.
#[tauri::command]
pub fn engine_ping_latest(service: State<'_, MatchPingService>) -> Option<EnginePingView> {
    service.engine_latest()
}

/// The recorded ping curve of one match, thinned to at most `max_points`. `None` when no file was recorded.
#[tauri::command]
pub async fn match_ping_points(
    app: AppHandle,
    match_id: u64,
    max_points: u32,
) -> Result<Option<MatchPingSeries>, String> {
    let dir = super::recording::store_dir(&app).ok_or_else(|| "no app data dir".to_owned())?;
    tauri::async_runtime::spawn_blocking(move || MatchStore::new(dir).read(match_id))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
        .map(|ping| ping.map(|ping| MatchPingSeries::from_ping(&ping, max_points as usize)))
}
