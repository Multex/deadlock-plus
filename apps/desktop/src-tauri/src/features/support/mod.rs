use std::fs;
use std::path::Path;

use dp_support::{build_report, Fields, Probe, Section};
use serde::Serialize;
use serde_json::{Map, Value};
use tauri::Manager;

use crate::features::error::{error_codes, AppError};
use crate::features::jobs::{JobState, JobsSnapshot, JobsState};

error_codes! {
    pub enum SupportError in "support" {
        BuildFailed = "build_failed",
    }
}

const UNKNOWN: &str = "unknown";

fn field(key: &str, value: impl Into<String>) -> (String, String) {
    (key.to_string(), value.into())
}

fn yes_no(value: bool) -> &'static str {
    if value {
        "yes"
    } else {
        "no"
    }
}

fn name_of(value: &impl Serialize) -> String {
    match serde_json::to_value(value) {
        Ok(Value::String(name)) => name,
        _ => UNKNOWN.to_string(),
    }
}

/// Drops every nested key that looks like a secret. Top-level keys are handled by the report builder.
fn strip_secrets(value: &Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.iter()
                .filter(|(k, _)| !dp_support::is_secret_key(k))
                .map(|(k, v)| (k.clone(), strip_secrets(v)))
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.iter().map(strip_secrets).collect()),
        other => other.clone(),
    }
}

const MAX_SETTING_CHARS: usize = 200;

fn summarise_long(original: &Value, text: String) -> String {
    if text.chars().count() <= MAX_SETTING_CHARS {
        return text;
    }
    match original {
        Value::Array(items) => format!("<list of {} items>", items.len()),
        _ => format!("<omitted: {} chars>", text.chars().count()),
    }
}

fn settings_fields(entries: &Map<String, Value>) -> Fields {
    let mut fields: Fields = entries
        .iter()
        .map(|(key, value)| {
            let text = match strip_secrets(value) {
                Value::String(text) => text,
                other => other.to_string(),
            };
            (key.clone(), summarise_long(value, text))
        })
        .collect();
    fields.sort_by(|a, b| a.0.cmp(&b.0));
    fields
}

fn jobs_fields(snapshot: &JobsSnapshot) -> Fields {
    let running = snapshot.jobs.iter().filter(|j| j.state == JobState::Running).count();
    let mut fields = vec![
        field("game running", yes_no(snapshot.game_running)),
        field("all jobs enabled", yes_no(snapshot.all_enabled)),
        field("pause in game", yes_no(snapshot.pause_in_game)),
        field("running", format!("{running} of {} listed", snapshot.jobs.len())),
    ];
    for entry in &snapshot.catalog {
        let state = match snapshot.jobs.iter().find(|j| j.id == entry.id) {
            None => "not started".to_string(),
            Some(job) if job.total > 0 => format!("{} {}/{}", name_of(&job.state), job.done, job.total),
            Some(job) => name_of(&job.state),
        };
        let enabled = if entry.enabled { "enabled" } else { "disabled" };
        fields.push(field(
            &format!("job {}", entry.id),
            format!("{enabled}, policy {}, {state}", name_of(&entry.policy)),
        ));
    }
    fields
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn describe_ptrace_scope(raw: &str) -> String {
    match raw.trim() {
        "0" => "0 (classic: any process of the same user)".into(),
        "1" => "1 (restricted: only a parent may attach)".into(),
        "2" => "2 (admin only: needs CAP_SYS_PTRACE)".into(),
        "3" => "3 (disabled: nothing may attach)".into(),
        other => format!("unrecognised value: {other}"),
    }
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn parse_getcap(output: &str) -> &'static str {
    if output.contains("cap_sys_ptrace") {
        "set"
    } else {
        "not set"
    }
}

fn app_fields(app: &tauri::AppHandle) -> Fields {
    vec![
        field("version", app.package_info().version.to_string()),
        field("build", if cfg!(debug_assertions) { "debug" } else { "release" }),
        field("target", format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS)),
        field("os", sysinfo::System::long_os_version().unwrap_or_else(|| std::env::consts::OS.to_string())),
        field("webview", tauri::webview_version().unwrap_or_else(|_| UNKNOWN.to_string())),
        field("elevated", yes_no(dp_elevation::is_elevated())),
    ]
}

fn game_fields() -> Fields {
    let running = field("running", yes_no(dp_game::is_running()));
    let Some(install) = dp_steam::game_install_dir() else {
        return vec![field("installed", "not found"), running];
    };
    let client = fs::read_to_string(install.join("game").join("citadel").join("steam.inf"))
        .ok()
        .and_then(|text| crate::features::about::parse_steam_inf(&text).client_version);
    vec![
        field("installed", "found"),
        field("install path", install.to_string_lossy()),
        field("client version", client.unwrap_or_else(|| UNKNOWN.to_string())),
        running,
        field("addons folder", addons_state(&dp_steam::addons_dir(&install))),
    ]
}

fn addons_state(dir: &Path) -> String {
    if !dir.is_dir() {
        return "missing".into();
    }
    match fs::read_dir(dir) {
        Ok(entries) => {
            let vpks = entries.flatten().filter(|e| e.path().extension().is_some_and(|x| x == "vpk")).count();
            format!("present, {vpks} vpk file(s)")
        }
        Err(e) => format!("present but unreadable: {e}"),
    }
}

fn features_fields(app: &tauri::AppHandle) -> Fields {
    use crate::features::gc::GcService;
    use crate::features::ingest::IngestService;
    use crate::features::live::LiveService;
    use crate::features::presence::PresenceService;

    let mut fields = Vec::new();
    let phase = name_of(&app.state::<LiveService>().current().phase);
    let attached = if phase == "gameClosed" { "no (game closed)".to_string() } else { format!("yes ({phase})") };
    fields.push(field("memory reader attached", attached));
    fields.push(field("memory reader last error", UNKNOWN));

    let capture = app.state::<dp_frames::capture::FrameCapture>().status();
    let mut capture_text = name_of(&capture.state);
    if let Some(error) = &capture.error {
        capture_text.push_str(&format!(", error: {error:?}"));
    }
    fields.push(field("frame capture", capture_text));

    fields.push(field("firewall blocking supported", yes_no(dp_firewall::SUPPORTED)));
    fields.push(field("firewall rules present", UNKNOWN));

    let presence = app.state::<PresenceService>().status();
    if presence.clients.is_empty() {
        fields.push(field("discord ipc", "no client found"));
    }
    for client in &presence.clients {
        let state = if client.connected { "connected" } else { "found, not connected" };
        fields.push(field(&format!("discord ipc {} (pipe {})", name_of(&client.kind), client.pipe_index), state));
    }

    let ingest = app.state::<IngestService>().status();
    fields.push(field(
        "match data sharing",
        format!(
            "{}, steam {}, submitted {}, last error {}",
            if ingest.running { "running" } else { "off" },
            if ingest.steam_found { "found" } else { "not found" },
            ingest.submitted,
            ingest.last_error.map_or("none".to_string(), |e| e.to_string())
        ),
    ));
    let gc = app.state::<GcService>().status();
    fields.push(field(
        "salt recovery",
        format!(
            "{}, accounts {}, delivered {}, last error {}",
            if gc.running { "running" } else { "off" },
            gc.accounts,
            gc.delivered,
            gc.last_error.map_or("none".to_string(), |e| e.to_string())
        ),
    ));
    fields.push(field("updater last check", UNKNOWN));
    fields
}

#[cfg(target_os = "linux")]
fn platform_fields() -> Fields {
    let ptrace = fs::read_to_string("/proc/sys/kernel/yama/ptrace_scope")
        .map(|raw| describe_ptrace_scope(&raw))
        .unwrap_or_else(|e| format!("{UNKNOWN} ({e})"));
    let pkexec = ["/usr/bin/pkexec", "/run/wrappers/bin/pkexec", "/usr/local/bin/pkexec"]
        .iter()
        .find(|p| Path::new(p).exists())
        .map_or("not found".to_string(), |p| format!("found at {p}"));
    let setcap = std::env::current_exe()
        .map_err(|e| e.to_string())
        .and_then(|exe| std::process::Command::new("getcap").arg(exe).output().map_err(|e| e.to_string()))
        .map(|out| parse_getcap(&String::from_utf8_lossy(&out.stdout)).to_string())
        .unwrap_or_else(|e| format!("{UNKNOWN} ({e})"));
    vec![field("ptrace_scope", ptrace), field("pkexec", pkexec), field("cap_sys_ptrace on the app binary", setcap)]
}

fn settings_probe(app: &tauri::AppHandle) -> Result<Fields, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut fields = Vec::new();
    for store in ["app-settings", "connection-settings"] {
        let entries: Option<Map<String, Value>> =
            dp_versioned::read(&dir.join(format!("{store}.json")), dp_kv::migrations::for_store(store))
                .map_err(|e| format!("{store}: {e}"))?;
        for (key, value) in settings_fields(&entries.unwrap_or_default()) {
            fields.push((format!("{store}.{key}"), value));
        }
    }
    Ok(fields)
}

fn build(app: &tauri::AppHandle) -> String {
    let jobs = app.state::<JobsState>().registry.clone();
    let app_probe = || Ok(app_fields(app));
    let game_probe = || Ok(game_fields());
    let features_probe = || Ok(features_fields(app));
    let jobs_probe = || Ok(jobs_fields(&jobs.snapshot()));
    let settings = || settings_probe(app);
    #[cfg(target_os = "linux")]
    let platform_probe = || Ok(platform_fields());

    #[allow(unused_mut)]
    let mut sections: Vec<(Section, &dyn Probe)> = vec![
        (Section::App, &app_probe),
        (Section::Game, &game_probe),
        (Section::Features, &features_probe),
        (Section::Jobs, &jobs_probe),
        (Section::Settings, &settings),
    ];
    #[cfg(target_os = "linux")]
    sections.push((Section::Platform, &platform_probe));

    let log = crate::features::crash::current_log(app);
    let marker = crate::features::crash::latest_marker();
    build_report(&sections, &log, marker.as_ref())
}

pub mod commands {
    use super::*;

    /// Builds the plain-text support report. Nothing leaves the machine; the web view shows it and the
    /// user copies or saves it.
    #[tauri::command]
    pub async fn build_support_report(app: tauri::AppHandle) -> Result<String, AppError> {
        tauri::async_runtime::spawn_blocking(move || build(&app))
            .await
            .map_err(|e| AppError::new(SupportError::BuildFailed).detail(e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::error::assert_catalogued;
    use crate::features::jobs::{JobCatalogEntry, JobInfo, JobState, Policy};
    use serde_json::json;

    #[test]
    fn every_support_code_is_in_the_english_catalog() {
        assert_catalogued::<SupportError>();
    }

    #[test]
    fn nested_secret_keys_are_removed_at_any_depth() {
        let value =
            json!({"theme": "dark", "discord": {"webhookUrl": "x", "name": "a"}, "list": [{"apiToken": "t", "ok": 1}]});
        assert_eq!(strip_secrets(&value), json!({"theme": "dark", "discord": {"name": "a"}, "list": [{"ok": 1}]}));
    }

    #[test]
    fn settings_render_sorted_with_strings_bare_and_other_values_as_json() {
        let entries = json!({"theme": "dark", "closeToTray": true, "sort": {"by": "ping"}, "authToken": {"a": 1}});
        let fields = settings_fields(entries.as_object().unwrap());
        let keys: Vec<&str> = fields.iter().map(|(k, _)| k.as_str()).collect();
        assert_eq!(keys, ["authToken", "closeToTray", "sort", "theme"]);
        assert_eq!(fields[1].1, "true");
        assert_eq!(fields[2].1, r#"{"by":"ping"}"#);
        assert_eq!(fields[3].1, "dark");
    }

    #[test]
    fn long_setting_values_are_summarised_instead_of_dumped() {
        let history: Vec<Value> = (0..50).map(|i| json!({"id": i, "ping": 40})).collect();
        let entries = json!({"matchHistory": history, "blob": {"k": "x".repeat(500)}, "short": [1, 2]});
        let fields = settings_fields(entries.as_object().unwrap());
        let get = |key: &str| fields.iter().find(|(k, _)| k == key).unwrap().1.clone();
        assert_eq!(get("matchHistory"), "<list of 50 items>");
        assert!(get("blob").starts_with("<omitted: "), "{}", get("blob"));
        assert_eq!(get("short"), "[1,2]");
    }

    #[test]
    fn jobs_summarise_counts_switches_and_each_catalogued_job() {
        let snapshot = JobsSnapshot {
            catalog: vec![
                JobCatalogEntry {
                    id: "scan".into(),
                    policy: Policy::PauseInGame,
                    policy_configurable: true,
                    enabled: false,
                },
                JobCatalogEntry {
                    id: "sync".into(),
                    policy: Policy::Always,
                    policy_configurable: false,
                    enabled: true,
                },
            ],
            jobs: vec![JobInfo {
                id: "sync".into(),
                state: JobState::Running,
                policy: Policy::Always,
                done: 2,
                total: 5,
                label: None,
            }],
            game_running: true,
            all_enabled: true,
            pause_in_game: false,
        };
        let fields = jobs_fields(&snapshot);
        let get = |key: &str| fields.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str());
        assert_eq!(get("game running"), Some("yes"));
        assert_eq!(get("all jobs enabled"), Some("yes"));
        assert_eq!(get("pause in game"), Some("no"));
        assert_eq!(get("running"), Some("1 of 1 listed"));
        assert_eq!(get("job scan"), Some("disabled, policy pauseInGame, not started"));
        assert_eq!(get("job sync"), Some("enabled, policy always, running 2/5"));
    }

    #[test]
    fn ptrace_scope_values_are_explained() {
        assert_eq!(describe_ptrace_scope("0\n"), "0 (classic: any process of the same user)");
        assert!(describe_ptrace_scope("1").starts_with("1 (restricted"));
        assert!(describe_ptrace_scope("2").starts_with("2 (admin only"));
        assert!(describe_ptrace_scope("3").starts_with("3 (disabled"));
        assert_eq!(describe_ptrace_scope("banana"), "unrecognised value: banana");
    }

    #[test]
    fn getcap_output_is_read_for_ptrace_capability() {
        assert_eq!(parse_getcap("/opt/dp cap_sys_ptrace=ep\n"), "set");
        assert_eq!(parse_getcap("/opt/dp cap_net_raw=ep"), "not set");
        assert_eq!(parse_getcap(""), "not set");
    }
}
