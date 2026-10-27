use serde::Serialize;
use ts_rs::TS;

use crate::features::error::{error_codes, AppError};

error_codes! {
    pub enum AboutError in "about" {
        InfoUnavailable = "info_unavailable",
    }
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GameBuild {
    pub client_version: Option<String>,
    pub source_revision: Option<String>,
    pub version_date: Option<String>,
    pub version_time: Option<String>,
}

pub fn parse_steam_inf(text: &str) -> GameBuild {
    let mut build = GameBuild::default();
    for line in text.lines() {
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let value = value.trim();
        let slot = match key.trim() {
            "ClientVersion" => &mut build.client_version,
            "SourceRevision" => &mut build.source_revision,
            "VersionDate" => &mut build.version_date,
            "VersionTime" => &mut build.version_time,
            _ => continue,
        };
        if slot.is_none() && !value.is_empty() {
            *slot = Some(value.to_string());
        }
    }
    build
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub app_version: String,
    pub tauri_version: String,
    pub webview_version: Option<String>,
    pub os: String,
    pub arch: String,
    pub debug_build: bool,
    pub elevated: bool,
    pub data_dir: Option<String>,
    pub game_dir: Option<String>,
    pub game_build: Option<GameBuild>,
}

pub mod commands {
    use super::*;
    use crate::command_panics::guarded;
    use tauri::Manager;

    /// Embedded at build time so the release notes always match the running binary.
    #[tauri::command]
    pub fn changelog() -> &'static str {
        include_str!("../../../../../../CHANGELOG.md")
    }

    #[tauri::command]
    pub async fn app_info(app: tauri::AppHandle) -> Result<AppInfo, AppError> {
        guarded(async move {
            crate::command_panics::spawn_blocking_guarded(move || {
                let game_dir = dp_steam::game_install_dir();
                let game_build = game_dir.as_ref().and_then(|d| {
                    let text = std::fs::read_to_string(d.join("game").join("citadel").join("steam.inf")).ok()?;
                    Some(parse_steam_inf(&text))
                });
                AppInfo {
                    app_version: app.package_info().version.to_string(),
                    tauri_version: tauri::VERSION.to_string(),
                    webview_version: tauri::webview_version().ok(),
                    os: sysinfo::System::long_os_version().unwrap_or_else(|| std::env::consts::OS.to_string()),
                    arch: std::env::consts::ARCH.to_string(),
                    debug_build: cfg!(debug_assertions),
                    elevated: dp_elevation::is_elevated(),
                    data_dir: app.path().app_data_dir().ok().map(|p| p.to_string_lossy().into_owned()),
                    game_dir: game_dir.map(|p| p.to_string_lossy().into_owned()),
                    game_build,
                }
            })
            .await
            .map_err(|e| AppError::new(AboutError::InfoUnavailable).detail(e))
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "ClientVersion=6701\r\nServerVersion=6701\r\nProductName=citadel\r\nappID=1422450\r\nSourceRevision=11038876\r\nVersionDate=Sep 25 2026\r\nVersionTime=11:10:43\r\n";

    #[test]
    fn reads_build_fields_from_steam_inf() {
        assert_eq!(
            parse_steam_inf(SAMPLE),
            GameBuild {
                client_version: Some("6701".into()),
                source_revision: Some("11038876".into()),
                version_date: Some("Sep 25 2026".into()),
                version_time: Some("11:10:43".into()),
            }
        );
    }

    #[test]
    fn missing_fields_stay_none_and_junk_is_ignored() {
        let build = parse_steam_inf("garbage\n=nokey\nClientVersion=\nVersionDate = Oct 1 2026 \n");
        assert_eq!(build.client_version, None);
        assert_eq!(build.version_date.as_deref(), Some("Oct 1 2026"));
        assert_eq!(parse_steam_inf(""), GameBuild::default());
    }

    #[test]
    fn a_later_duplicate_key_does_not_override_the_first() {
        assert_eq!(parse_steam_inf("ClientVersion=1\nClientVersion=2\n").client_version.as_deref(), Some("1"));
    }
}

#[cfg(test)]
mod error_tests {
    #[test]
    fn every_about_code_is_in_the_english_catalog() {
        crate::features::error::assert_catalogued::<super::AboutError>();
    }
}
