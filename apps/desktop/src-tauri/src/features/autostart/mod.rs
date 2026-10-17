// The Task Scheduler helpers are only called by the Windows backend, but their tests run on every host.
#![cfg_attr(not(windows), allow(dead_code))]

use crate::features::error::{error_codes, AppError};
use serde::Serialize;
use ts_rs::TS;

error_codes! {
    #[allow(dead_code)]
    pub enum AutostartError in "autostart" {
        UserNameUnavailable = "user_name_unavailable",
        ProgramDataMissing = "program_data_missing",
        TaskCreateFailed = "task_create_failed",
        TaskDeleteFailed = "task_delete_failed",
        EntryWriteFailed = "entry_write_failed",
        EntryRemoveFailed = "entry_remove_failed",
    }
}

const TASK_NAME: &str = "DeadlockPlus";
const LAUNCH_ARG: &str = "--autostart";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AutostartStatus {
    /// False where no autostart backend exists; the UI hides the toggle.
    pub supported: bool,
    pub enabled: bool,
    /// The task exists but launches a different exe than the running one (the app was moved or reinstalled).
    pub stale: bool,
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn xml_unescape(s: &str) -> String {
    s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&amp;", "&")
}

// The battery and time-limit settings can't be set through `schtasks /create` flags. The defaults would
// skip the launch on battery and kill the app after 72 hours, which is wrong for a long-lived background app.
fn build_task_xml(exe: &str, user: &str) -> String {
    let exe = xml_escape(exe);
    let user = xml_escape(user);
    format!(
        r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>{user}</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>{user}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <StartWhenAvailable>false</StartWhenAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>{exe}</Command>
      <Arguments>{LAUNCH_ARG}</Arguments>
    </Exec>
  </Actions>
</Task>
"#
    )
}

fn task_command(xml: &str) -> Option<String> {
    let start = xml.find("<Command>")? + "<Command>".len();
    let end = xml[start..].find("</Command>")? + start;
    Some(xml_unescape(xml[start..end].trim()))
}

fn same_path(a: &str, b: &str) -> bool {
    a.trim_matches('"').eq_ignore_ascii_case(b.trim_matches('"'))
}

fn status_from_query(xml: Option<&str>, current_exe: &str) -> AutostartStatus {
    match xml {
        None => AutostartStatus { supported: true, enabled: false, stale: false },
        Some(xml) => {
            let stale = task_command(xml).is_none_or(|cmd| !same_path(&cmd, current_exe));
            AutostartStatus { supported: true, enabled: true, stale }
        }
    }
}

#[cfg(windows)]
mod platform {
    use super::*;
    use std::io::Write;
    use std::os::windows::process::CommandExt;
    use std::path::{Path, PathBuf};
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    static COUNTER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

    /// `schtasks` runs from the system directory, not `PATH` or the working directory, so a planted copy cannot
    /// stand in for it.
    pub(super) fn system32_tool(system_root: Option<std::ffi::OsString>, name: &str) -> PathBuf {
        let root = system_root.filter(|r| !r.is_empty()).unwrap_or_else(|| r"C:\Windows".into());
        Path::new(&root).join("System32").join(name)
    }

    fn schtasks(args: &[&str]) -> std::io::Result<std::process::Output> {
        Command::new(system32_tool(std::env::var_os("SystemRoot"), "schtasks.exe"))
            .args(args)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
    }

    fn current_user() -> Result<String, AppError> {
        let name = std::env::var("USERNAME").map_err(|_| AutostartError::UserNameUnavailable)?;
        Ok(match std::env::var("USERDOMAIN") {
            Ok(domain) if !domain.is_empty() => format!("{domain}\\{name}"),
            _ => name,
        })
    }

    fn current_exe() -> Result<String, AppError> {
        std::env::current_exe().map(|p| p.to_string_lossy().into_owned()).map_err(AppError::io)
    }

    fn query_xml() -> Option<String> {
        let out = schtasks(&["/query", "/tn", TASK_NAME, "/xml"]).ok()?;
        if !out.status.success() {
            return None;
        }
        // schtasks prints the XML in the console code page but the ASCII markup is all we read.
        Some(String::from_utf8_lossy(&out.stdout).into_owned())
    }

    pub fn status() -> Result<AutostartStatus, AppError> {
        Ok(status_from_query(query_xml().as_deref(), &current_exe()?))
    }

    /// The app runs elevated and the task inherits that level, so the XML must not sit where a
    /// non-elevated process of the same user could swap it: %TEMP% is user-writable, while files an
    /// administrator creates under %ProgramData% are read-only to regular users.
    fn task_dir() -> Result<PathBuf, AppError> {
        std::env::var_os("ProgramData")
            .map(|base| PathBuf::from(base).join("DeadlockPlus"))
            .ok_or_else(|| AutostartError::ProgramDataMissing.into())
    }

    pub(super) fn write_task_file(dir: &Path, xml: &str) -> std::io::Result<PathBuf> {
        std::fs::create_dir_all(dir)?;
        let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_nanos());
        let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = dir.join(format!("task-{}-{nanos}-{n}.xml", std::process::id()));
        // schtasks only accepts UTF-16 with a BOM for /xml.
        let mut bytes = vec![0xFF, 0xFE];
        bytes.extend(xml.encode_utf16().flat_map(u16::to_le_bytes));
        // `create_new` refuses a pre-planted file or link at the path instead of writing through it.
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&path)?;
        file.write_all(&bytes)?;
        Ok(path)
    }

    pub fn enable() -> Result<(), AppError> {
        let xml = build_task_xml(&current_exe()?, &current_user()?);
        let path = write_task_file(&task_dir()?, &xml).map_err(AppError::io)?;
        let out = schtasks(&["/create", "/tn", TASK_NAME, "/xml", &path.to_string_lossy(), "/f"]);
        if let Err(e) = std::fs::remove_file(&path) {
            log::debug!("could not remove the temporary task file: {e}");
        }
        let out = out.map_err(|e| AppError::new(AutostartError::TaskCreateFailed).detail(e))?;
        if out.status.success() {
            Ok(())
        } else {
            let message = String::from_utf8_lossy(&out.stderr).trim().to_string();
            Err(AppError::new(AutostartError::TaskCreateFailed).detail(message))
        }
    }

    pub fn disable() -> Result<(), AppError> {
        if query_xml().is_none() {
            return Ok(());
        }
        let out = schtasks(&["/delete", "/tn", TASK_NAME, "/f"])
            .map_err(|e| AppError::new(AutostartError::TaskDeleteFailed).detail(e))?;
        if out.status.success() {
            Ok(())
        } else {
            let message = String::from_utf8_lossy(&out.stderr).trim().to_string();
            Err(AppError::new(AutostartError::TaskDeleteFailed).detail(message))
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use super::*;

    pub fn status() -> Result<AutostartStatus, AppError> {
        let state = dp_autostart::state().map_err(AppError::io)?;
        Ok(AutostartStatus { supported: true, enabled: state.enabled, stale: state.stale })
    }
    pub fn enable() -> Result<(), AppError> {
        dp_autostart::enable().map_err(|e| AppError::new(AutostartError::EntryWriteFailed).detail(e))
    }
    pub fn disable() -> Result<(), AppError> {
        dp_autostart::disable().map_err(|e| AppError::new(AutostartError::EntryRemoveFailed).detail(e))
    }
}

#[cfg(windows)]
mod run_key;

pub mod commands {
    use super::*;

    #[tauri::command]
    pub async fn autostart_status() -> Result<AutostartStatus, AppError> {
        tauri::async_runtime::spawn_blocking(platform::status).await.map_err(AppError::internal)?
    }

    #[tauri::command]
    pub async fn set_autostart(enabled: bool) -> Result<AutostartStatus, AppError> {
        tauri::async_runtime::spawn_blocking(move || {
            if enabled { platform::enable() } else { platform::disable() }?;
            log::info!("autostart {}", if enabled { "enabled" } else { "disabled" });
            platform::status()
        })
        .await
        .map_err(AppError::internal)?
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn schtasks_runs_from_the_system_directory() {
        use std::ffi::OsString;
        let tool = |root: Option<&str>| platform::system32_tool(root.map(OsString::from), "schtasks.exe");
        assert_eq!(tool(Some(r"D:\Win")), std::path::PathBuf::from(r"D:\Win\System32\schtasks.exe"));
        assert_eq!(tool(None), std::path::PathBuf::from(r"C:\Windows\System32\schtasks.exe"));
        assert_eq!(tool(Some("")), std::path::PathBuf::from(r"C:\Windows\System32\schtasks.exe"));
    }

    const EXE: &str = r"C:\Program Files\Deadlock+\deadlock-plus.exe";

    #[test]
    fn every_autostart_code_is_in_the_english_catalog() {
        crate::features::error::assert_catalogued::<AutostartError>();
    }

    #[test]
    fn task_runs_elevated_at_logon_without_battery_or_time_limits() {
        let xml = build_task_xml(EXE, r"PC\User");
        assert!(xml.contains("<RunLevel>HighestAvailable</RunLevel>"));
        assert!(xml.contains("<LogonTrigger>"));
        assert!(xml.contains("<UserId>PC\\User</UserId>"));
        assert!(xml.contains("<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>"));
        assert!(xml.contains("<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>"));
        assert!(xml.contains("<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>"));
        assert!(xml.contains("<Arguments>--autostart</Arguments>"));
    }

    #[test]
    fn command_and_user_are_xml_escaped_and_round_trip() {
        let exe = r"C:\R&D <x>\app.exe";
        let xml = build_task_xml(exe, "A&B\\me");
        assert!(xml.contains("<Command>C:\\R&amp;D &lt;x&gt;\\app.exe</Command>"));
        assert!(xml.contains("<UserId>A&amp;B\\me</UserId>"));
        assert_eq!(task_command(&xml).as_deref(), Some(exe));
    }

    #[test]
    fn no_task_means_disabled_and_not_stale() {
        assert_eq!(status_from_query(None, EXE), AutostartStatus { supported: true, enabled: false, stale: false });
    }

    #[test]
    fn task_pointing_at_the_running_exe_is_fresh_regardless_of_case_or_quotes() {
        let xml = build_task_xml(EXE, "u");
        assert_eq!(
            status_from_query(Some(&xml), EXE),
            AutostartStatus { supported: true, enabled: true, stale: false }
        );
        assert!(!status_from_query(Some(&xml), &EXE.to_uppercase()).stale);
        assert!(!status_from_query(Some(&xml), &format!("\"{EXE}\"")).stale);
    }

    #[test]
    fn task_pointing_elsewhere_or_unreadable_is_stale() {
        let xml = build_task_xml(r"D:\Old\deadlock-plus.exe", "u");
        assert_eq!(status_from_query(Some(&xml), EXE), AutostartStatus { supported: true, enabled: true, stale: true });
        assert!(status_from_query(Some("<Task/>"), EXE).stale);
    }

    #[cfg(windows)]
    #[test]
    fn task_file_is_utf16_with_a_bom_and_never_overwrites() {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-autostart-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let path = platform::write_task_file(&dir, "<a/>").unwrap();
        let bytes = std::fs::read(&path).unwrap();
        assert_eq!(&bytes[..2], &[0xFF, 0xFE]);
        assert_eq!(bytes.len(), 2 + 4 * 2);
        assert!(std::fs::OpenOptions::new().write(true).create_new(true).open(&path).is_err());
        let second = platform::write_task_file(&dir, "<a/>").unwrap();
        assert_ne!(path, second);
    }
}
