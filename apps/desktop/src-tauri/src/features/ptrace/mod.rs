// Only the Linux backend probes and runs the fix, but the decisions and command lines are tested on every host.
#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use std::ffi::OsString;
use std::path::{Path, PathBuf};

use dp_privilege::{pkexec_exit, Outcome};
use serde::Serialize;
use ts_rs::TS;

use crate::features::error::{error_codes, AppError};

error_codes! {
    #[allow(dead_code)]
    pub enum PtraceError in "ptrace" {
        Unavailable = "unavailable",
        Failed = "failed",
    }
}

const SCOPE_FILE: &str = "/proc/sys/kernel/yama/ptrace_scope";
const DROP_IN: &str = "/etc/sysctl.d/60-deadlock-plus-ptrace.conf";
// Scope 1 lets only a parent attach unless the tracer holds CAP_SYS_PTRACE, and the AppImage cannot keep a file
// capability (it runs from a nosuid FUSE mount), so the sysctl route has to go all the way to 0.
const DROP_IN_LINE: &str = "kernel.yama.ptrace_scope = 0";
const CAP_SYS_PTRACE: u32 = 19;

// One fixed script so the user sees one password prompt; every value reaches it as a positional argument.
const WRITE_DROP_IN: &str = r#"printf '%s\n' "$1" > "$2""#;
const WRITE_DROP_IN_AND_APPLY: &str = r#"printf '%s\n' "$1" > "$2" && printf '%s\n' "$3" > "$4""#;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum PtraceFix {
    /// Grant the installed binary `cap_sys_ptrace`; it applies once the app restarts.
    Setcap,
    /// Write the sysctl drop-in and lower the scope now.
    Sysctl,
    /// Write the drop-in only: scope 3 cannot be lowered until the computer restarts.
    SysctlAfterReboot,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PtraceStatus {
    /// The kernel refused the game link's last attach.
    pub denied: bool,
    /// `None` when no one-click fix can help.
    pub fix: Option<PtraceFix>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Package {
    AppImage,
    Deb,
}

pub fn package_kind(appimage: Option<&str>) -> Package {
    if appimage.is_some_and(|v| !v.is_empty()) {
        Package::AppImage
    } else {
        Package::Deb
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Host {
    pub scope: Option<u8>,
    pub package: Package,
    /// The running process already holds `CAP_SYS_PTRACE`.
    pub has_cap: bool,
    pub setcap_found: bool,
}

pub fn choose_fix(host: &Host) -> Option<PtraceFix> {
    match host.scope? {
        1 | 2 if host.package == Package::Deb && !host.has_cap && host.setcap_found => Some(PtraceFix::Setcap),
        1 | 2 => Some(PtraceFix::Sysctl),
        3 => Some(PtraceFix::SysctlAfterReboot),
        // At 0 the scope is not what refused the read: a different user or a sandbox is.
        _ => None,
    }
}

/// Reads `CapEff` from `/proc/self/status`.
pub fn has_sys_ptrace(proc_status: &str) -> bool {
    proc_status
        .lines()
        .find_map(|line| line.strip_prefix("CapEff:"))
        .and_then(|hex| u64::from_str_radix(hex.trim(), 16).ok())
        .is_some_and(|caps| caps & (1 << CAP_SYS_PTRACE) != 0)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Invocation {
    pub program: PathBuf,
    pub args: Vec<OsString>,
}

pub fn setcap_invocation(pkexec: &Path, setcap: &Path, exe: &Path) -> Invocation {
    Invocation { program: pkexec.into(), args: vec![setcap.into(), "cap_sys_ptrace=ep".into(), exe.into()] }
}

pub fn sysctl_invocation(pkexec: &Path, apply_now: bool) -> Invocation {
    let script = if apply_now { WRITE_DROP_IN_AND_APPLY } else { WRITE_DROP_IN };
    let mut args: Vec<OsString> =
        vec!["/bin/sh".into(), "-c".into(), script.into(), "sh".into(), DROP_IN_LINE.into(), DROP_IN.into()];
    if apply_now {
        args.extend(["0".into(), SCOPE_FILE.into()]);
    }
    Invocation { program: pkexec.into(), args }
}

/// `Ok(false)` when the user dismissed the password prompt.
pub fn outcome(exit_code: Option<i32>) -> Result<bool, AppError> {
    match pkexec_exit(exit_code) {
        Outcome::Applied => Ok(true),
        Outcome::Cancelled => Ok(false),
        Outcome::Failed(detail) => Err(AppError::new(PtraceError::Failed).detail(detail)),
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use std::fs;
    use std::path::{Path, PathBuf};

    use super::*;

    // Debian keeps setcap in sbin, which is not on a regular user's PATH, so pkexec gets the full path.
    const SETCAP: &[&str] =
        &["/usr/sbin/setcap", "/sbin/setcap", "/usr/bin/setcap", "/run/current-system/sw/bin/setcap"];

    fn find(candidates: &[&str]) -> Option<PathBuf> {
        candidates.iter().map(Path::new).find(|p| p.exists()).map(Path::to_path_buf)
    }

    pub fn status() -> PtraceStatus {
        if !dp_live::ptrace_denied() {
            return PtraceStatus::default();
        }
        let host = Host {
            scope: fs::read_to_string(SCOPE_FILE).ok().and_then(|raw| raw.trim().parse().ok()),
            package: package_kind(std::env::var("APPIMAGE").ok().as_deref()),
            has_cap: fs::read_to_string("/proc/self/status").is_ok_and(|s| has_sys_ptrace(&s)),
            setcap_found: find(SETCAP).is_some(),
        };
        let fix = dp_privilege::pick_pkexec(Path::exists).and(choose_fix(&host));
        PtraceStatus { denied: true, fix }
    }

    pub fn apply(fix: PtraceFix) -> Result<bool, AppError> {
        let unavailable = || AppError::new(PtraceError::Unavailable);
        let pkexec = dp_privilege::pick_pkexec(Path::exists).ok_or_else(unavailable)?;
        let inv = match fix {
            PtraceFix::Setcap => {
                let setcap = find(SETCAP).ok_or_else(unavailable)?;
                let exe = std::env::current_exe().map_err(|e| unavailable().detail(e))?;
                setcap_invocation(&pkexec, &setcap, &exe)
            }
            PtraceFix::Sysctl => sysctl_invocation(&pkexec, true),
            PtraceFix::SysctlAfterReboot => sysctl_invocation(&pkexec, false),
        };
        let status = std::process::Command::new(&inv.program)
            .args(&inv.args)
            .status()
            .map_err(|e| AppError::new(PtraceError::Failed).detail(e))?;
        outcome(status.code())
    }
}

#[cfg(not(target_os = "linux"))]
mod platform {
    use super::*;

    pub fn status() -> PtraceStatus {
        PtraceStatus::default()
    }

    pub fn apply(_fix: PtraceFix) -> Result<bool, AppError> {
        Err(AppError::new(PtraceError::Unavailable))
    }
}

pub mod commands {
    use crate::command_panics::guarded;
    use tauri::AppHandle;

    use super::*;

    #[tauri::command]
    pub async fn ptrace_status() -> Result<PtraceStatus, AppError> {
        guarded(async move { crate::command_panics::spawn_blocking_guarded(platform::status).await }).await
    }

    /// Runs the fix the backend picks, never one the page names. Returns whether it was applied; after `setcap` the
    /// app restarts, since a file capability only takes effect on exec.
    #[tauri::command]
    pub async fn fix_ptrace(app: AppHandle) -> Result<bool, AppError> {
        guarded(async move {
            let fix = crate::command_panics::spawn_blocking_guarded(platform::status)
                .await?
                .fix
                .ok_or_else(|| AppError::new(PtraceError::Unavailable))?;
            let applied = crate::command_panics::spawn_blocking_guarded(move || platform::apply(fix)).await??;
            log::info!("ptrace fix {fix:?} {}", if applied { "applied" } else { "cancelled" });
            if applied && fix == PtraceFix::Setcap {
                app.request_restart();
            }
            Ok(applied)
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn host(scope: Option<u8>, package: Package) -> Host {
        Host { scope, package, has_cap: false, setcap_found: true }
    }

    fn strings(inv: &Invocation) -> Vec<&str> {
        inv.args.iter().map(|a| a.to_str().unwrap()).collect()
    }

    #[test]
    fn every_ptrace_code_is_in_the_english_catalog() {
        crate::features::error::assert_catalogued::<PtraceError>();
    }

    #[test]
    fn the_appimage_env_var_marks_an_appimage() {
        assert_eq!(package_kind(Some("/home/me/Deadlock+.AppImage")), Package::AppImage);
        assert_eq!(package_kind(Some("")), Package::Deb);
        assert_eq!(package_kind(None), Package::Deb);
    }

    #[test]
    fn a_deb_at_scope_one_or_two_gets_setcap() {
        assert_eq!(choose_fix(&host(Some(1), Package::Deb)), Some(PtraceFix::Setcap));
        assert_eq!(choose_fix(&host(Some(2), Package::Deb)), Some(PtraceFix::Setcap));
    }

    #[test]
    fn an_appimage_gets_the_sysctl_drop_in() {
        assert_eq!(choose_fix(&host(Some(1), Package::AppImage)), Some(PtraceFix::Sysctl));
        assert_eq!(choose_fix(&host(Some(2), Package::AppImage)), Some(PtraceFix::Sysctl));
    }

    #[test]
    fn a_deb_that_already_holds_the_capability_gets_the_sysctl_drop_in() {
        let held = Host { has_cap: true, ..host(Some(1), Package::Deb) };
        assert_eq!(choose_fix(&held), Some(PtraceFix::Sysctl));
    }

    #[test]
    fn a_deb_without_setcap_installed_gets_the_sysctl_drop_in() {
        let missing = Host { setcap_found: false, ..host(Some(1), Package::Deb) };
        assert_eq!(choose_fix(&missing), Some(PtraceFix::Sysctl));
    }

    #[test]
    fn scope_three_needs_a_reboot_whatever_the_package() {
        assert_eq!(choose_fix(&host(Some(3), Package::Deb)), Some(PtraceFix::SysctlAfterReboot));
        assert_eq!(choose_fix(&host(Some(3), Package::AppImage)), Some(PtraceFix::SysctlAfterReboot));
    }

    #[test]
    fn scope_zero_or_no_yama_has_no_one_click_fix() {
        assert_eq!(choose_fix(&host(Some(0), Package::Deb)), None);
        assert_eq!(choose_fix(&host(None, Package::AppImage)), None);
        assert_eq!(choose_fix(&host(Some(7), Package::Deb)), None);
    }

    #[test]
    fn cap_sys_ptrace_is_read_from_the_effective_set() {
        let status = |eff: &str| {
            format!("Name:\tdeadlock-plus\nCapPrm:\t0000000000080000\nCapEff:\t{eff}\nCapBnd:\t000001ffffffffff\n")
        };
        assert!(has_sys_ptrace(&status("0000000000080000")));
        assert!(has_sys_ptrace(&status("000001ffffffffff")));
        assert!(!has_sys_ptrace(&status("0000000000000000")));
        assert!(!has_sys_ptrace(&status("0000000000040000")));
        assert!(!has_sys_ptrace("CapEff:\tnot-hex\n"));
        assert!(!has_sys_ptrace(""));
    }

    #[test]
    fn setcap_runs_through_pkexec_with_the_binary_as_its_own_argument() {
        let exe = Path::new("/opt/Deadlock+ beta/deadlock-plus; rm -rf ~");
        let inv = setcap_invocation(Path::new("/usr/bin/pkexec"), Path::new("/usr/sbin/setcap"), exe);
        assert_eq!(inv.program, PathBuf::from("/usr/bin/pkexec"));
        assert_eq!(
            strings(&inv),
            ["/usr/sbin/setcap", "cap_sys_ptrace=ep", "/opt/Deadlock+ beta/deadlock-plus; rm -rf ~"]
        );
    }

    #[test]
    fn the_sysctl_fix_writes_the_drop_in_and_applies_it_in_one_prompt() {
        let inv = sysctl_invocation(Path::new("/usr/bin/pkexec"), true);
        assert_eq!(inv.program, PathBuf::from("/usr/bin/pkexec"));
        assert_eq!(
            strings(&inv),
            [
                "/bin/sh",
                "-c",
                r#"printf '%s\n' "$1" > "$2" && printf '%s\n' "$3" > "$4""#,
                "sh",
                "kernel.yama.ptrace_scope = 0",
                "/etc/sysctl.d/60-deadlock-plus-ptrace.conf",
                "0",
                "/proc/sys/kernel/yama/ptrace_scope",
            ]
        );
    }

    #[test]
    fn the_reboot_fix_only_writes_the_drop_in() {
        let inv = sysctl_invocation(Path::new("/usr/bin/pkexec"), false);
        assert_eq!(
            strings(&inv),
            [
                "/bin/sh",
                "-c",
                r#"printf '%s\n' "$1" > "$2""#,
                "sh",
                "kernel.yama.ptrace_scope = 0",
                "/etc/sysctl.d/60-deadlock-plus-ptrace.conf",
            ]
        );
    }

    #[test]
    fn pkexec_exit_codes_map_to_applied_cancelled_or_failed() {
        assert_eq!(outcome(Some(0)), Ok(true));
        assert_eq!(outcome(Some(126)), Ok(false));
        assert_eq!(outcome(Some(127)).unwrap_err().code(), "ptrace.failed");
        assert_eq!(outcome(Some(1)).unwrap_err().code(), "ptrace.failed");
        assert_eq!(outcome(None).unwrap_err().code(), "ptrace.failed");
    }
}
