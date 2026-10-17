//! Decisions that gate how the capture helper is started and trusted. Kept free of OS calls so they are
//! testable on every host.
#![cfg_attr(windows, allow(dead_code))]

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};

use dp_privilege::NO_AGENT;

/// Directory and file the helper is installed to when the running binary cannot be elevated in place.
pub const HELPER_DIR: &str = "/var/lib/deadlock-plus";
pub const HELPER_PATH: &str = "/var/lib/deadlock-plus/capture-helper";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FileFacts {
    pub uid: u32,
    pub mode: u32,
}

/// True when every component of the resolved path, the binary included, is owned by root and cannot be
/// written by its group or by others. An empty chain proves nothing.
pub fn chain_is_root_owned(chain: &[FileFacts]) -> bool {
    !chain.is_empty() && chain.iter().all(|f| f.uid == 0 && f.mode & 0o022 == 0)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Elevation {
    InPlace,
    CopyToRootOwned,
}

pub fn plan_elevation(chain: &[FileFacts]) -> Elevation {
    if chain_is_root_owned(chain) {
        Elevation::InPlace
    } else {
        Elevation::CopyToRootOwned
    }
}

/// Runs as root through `pkexec /bin/sh -c`. Arguments: source, install directory, install path, helper
/// switch, socket path. The copy is staged next to its final name and renamed into place, so a running
/// helper is never overwritten and a half-written file is never executed. The directory and the staged
/// file are checked to be real (not symlinks), root-owned and mode 0755 before the helper is started.
const COPY_AND_RUN: &str = r#"set -eu
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
umask 022
src=$1; dir=$2; dest=$3
[ -f "$src" ] || exit 70
[ ! -L "$dir" ] || exit 71
install -d -m 0755 -o root -g root -- "$dir"
[ -d "$dir" ] || exit 71
[ "$(stat -c %u:%g:%a "$dir")" = 0:0:755 ] || exit 71
tmp="$dest.new.$$"
rm -f -- "$tmp"
install -m 0755 -o root -g root -- "$src" "$tmp"
if [ -L "$tmp" ] || [ ! -f "$tmp" ] || [ "$(stat -c %u:%g:%a "$tmp")" != 0:0:755 ]; then
    rm -f -- "$tmp"
    exit 72
fi
[ ! -d "$dest" ] || { rm -f -- "$tmp"; exit 73; }
mv -f -- "$tmp" "$dest"
exec "$dest" "$4" "$5"
"#;

pub fn copy_and_run_args(source: &Path, helper_arg: &str, socket: &Path) -> Vec<OsString> {
    vec![
        "/bin/sh".into(),
        "-c".into(),
        COPY_AND_RUN.into(),
        "sh".into(),
        source.into(),
        HELPER_DIR.into(),
        HELPER_PATH.into(),
        helper_arg.into(),
        socket.into(),
    ]
}

/// The helper connects while still root, and `SO_PEERCRED` reports the effective uid at connect time.
/// Nothing but root may feed packets into the app.
pub fn peer_allowed(peer_uid: u32) -> bool {
    peer_uid == 0
}

/// What a helper launcher that exited before connecting means. `pkexec` exits 126 when the prompt is dismissed
/// or refused and 127 when there is no agent to ask. 70 to 73 come from the copy script.
pub fn explain_early_exit(code: Option<i32>, stderr: &str) -> Option<String> {
    match code {
        Some(126) => Some("Permission was not granted.".into()),
        Some(127) => Some(NO_AGENT.into()),
        Some(0) => None,
        Some(70) => Some("the capture helper could not be found to install".into()),
        Some(71..=73) => Some("the capture helper could not be installed safely".into()),
        _ => Some(format!("the capture helper could not start: {}", stderr.trim())),
    }
}

/// Where the helper's identity ends up after setup: an unprivileged account that owns nothing, so a process
/// of the invoking user cannot attach to it and take the raw socket.
pub const UNPRIVILEGED_ID: u32 = 65_534;

pub fn should_drop_privileges(euid: u32) -> bool {
    euid == 0
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BpfInsn {
    pub code: u16,
    pub jt: u8,
    pub jf: u8,
    pub k: u32,
}

/// Only the IP and UDP headers are ever parsed (60 + 8 bytes at most).
pub const SNAP_LEN: u32 = 128;

const LD_B_ABS: u16 = 0x30;
const AND_K: u16 = 0x54;
const JEQ_K: u16 = 0x15;
const RET_K: u16 = 0x06;

/// Accepts IPv4 UDP only. The socket is `SOCK_DGRAM`, so packets start at the IP header.
pub fn ipv4_udp_filter() -> [BpfInsn; 7] {
    let i = |code, jt, jf, k| BpfInsn { code, jt, jf, k };
    [
        i(LD_B_ABS, 0, 0, 0),
        i(AND_K, 0, 0, 0xf0),
        i(JEQ_K, 0, 3, 0x40),
        i(LD_B_ABS, 0, 0, 9),
        i(JEQ_K, 0, 1, 17),
        i(RET_K, 0, 0, SNAP_LEN),
        i(RET_K, 0, 0, 0),
    ]
}

/// `%SystemRoot%\System32\<name>`, falling back to `C:\Windows` when the variable is missing or not absolute.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn system32_exe(system_root: Option<&OsStr>, name: &str) -> PathBuf {
    let root =
        system_root.map(PathBuf::from).filter(|p| p.is_absolute()).unwrap_or_else(|| PathBuf::from(r"C:\Windows"));
    root.join("System32").join(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ROOT_DIR: FileFacts = FileFacts { uid: 0, mode: 0o755 };

    #[test]
    fn a_dismissed_prompt_and_a_missing_agent_are_told_apart() {
        assert_eq!(explain_early_exit(Some(126), ""), Some("Permission was not granted.".into()));
        assert!(explain_early_exit(Some(127), "").unwrap().contains("agent"));
        assert!(explain_early_exit(Some(1), " boom ").unwrap().contains("boom"));
    }

    #[test]
    fn a_launcher_that_exits_cleanly_is_not_an_error() {
        assert_eq!(explain_early_exit(Some(0), ""), None);
    }

    #[test]
    fn copy_script_failures_are_explained() {
        assert!(explain_early_exit(Some(72), "").unwrap().contains("installed"));
    }

    #[test]
    fn a_fully_root_owned_chain_runs_in_place() {
        let chain = [ROOT_DIR, ROOT_DIR, FileFacts { uid: 0, mode: 0o755 }];
        assert_eq!(plan_elevation(&chain), Elevation::InPlace);
    }

    #[test]
    fn a_user_owned_binary_is_copied() {
        let chain = [ROOT_DIR, ROOT_DIR, FileFacts { uid: 1000, mode: 0o755 }];
        assert_eq!(plan_elevation(&chain), Elevation::CopyToRootOwned);
    }

    #[test]
    fn a_user_owned_parent_directory_is_copied() {
        let chain = [ROOT_DIR, FileFacts { uid: 1000, mode: 0o755 }, FileFacts { uid: 0, mode: 0o755 }];
        assert_eq!(plan_elevation(&chain), Elevation::CopyToRootOwned);
    }

    #[test]
    fn group_or_world_writable_components_are_copied() {
        for mode in [0o775, 0o757, 0o777, 0o1777] {
            let chain = [ROOT_DIR, FileFacts { uid: 0, mode }, ROOT_DIR];
            assert_eq!(plan_elevation(&chain), Elevation::CopyToRootOwned, "mode {mode:o}");
        }
    }

    #[test]
    fn an_empty_chain_is_never_trusted() {
        assert_eq!(plan_elevation(&[]), Elevation::CopyToRootOwned);
    }

    #[test]
    fn copy_args_pass_paths_as_separate_arguments() {
        let args =
            copy_and_run_args(Path::new("/home/u/Deadlock+.AppImage"), "--capture-helper", Path::new("/tmp/d/s"));
        assert_eq!(args[0], OsString::from("/bin/sh"));
        assert_eq!(args[1], OsString::from("-c"));
        assert_eq!(args[4], OsString::from("/home/u/Deadlock+.AppImage"));
        assert_eq!(args[6], OsString::from(HELPER_PATH));
        assert_eq!(args[7], OsString::from("--capture-helper"));
        assert_eq!(args[8], OsString::from("/tmp/d/s"));
        let script = args[2].to_string_lossy();
        assert!(!script.contains("/home/u"));
        assert!(script.contains("0:0:755"));
        assert!(script.contains("-L"));
        assert!(script.find("mv -f").unwrap() > script.find("0:0:755").unwrap());
        assert!(script.trim_end().ends_with(r#"exec "$dest" "$4" "$5""#));
    }

    #[test]
    fn only_root_may_connect_as_the_helper() {
        assert!(peer_allowed(0));
        assert!(!peer_allowed(1000));
        assert!(!peer_allowed(65_534));
    }

    #[test]
    fn only_a_root_helper_has_privileges_to_drop() {
        assert!(should_drop_privileges(0));
        assert!(!should_drop_privileges(1000));
    }

    fn run_filter(program: &[BpfInsn], packet: &[u8]) -> u32 {
        let (mut acc, mut pc) = (0u32, 0usize);
        loop {
            let insn = program[pc];
            pc += 1;
            match insn.code {
                LD_B_ABS => acc = u32::from(*packet.get(insn.k as usize).expect("load in range")),
                AND_K => acc &= insn.k,
                JEQ_K => pc += usize::from(if acc == insn.k { insn.jt } else { insn.jf }),
                RET_K => return insn.k,
                other => panic!("unexpected opcode {other:#x}"),
            }
        }
    }

    fn ip_packet(version_ihl: u8, protocol: u8) -> Vec<u8> {
        let mut p = vec![0u8; 40];
        p[0] = version_ihl;
        p[9] = protocol;
        p
    }

    #[test]
    fn the_kernel_filter_passes_ipv4_udp_only() {
        let program = ipv4_udp_filter();
        assert_eq!(run_filter(&program, &ip_packet(0x45, 17)), SNAP_LEN);
        assert_eq!(run_filter(&program, &ip_packet(0x4f, 17)), SNAP_LEN);
        assert_eq!(run_filter(&program, &ip_packet(0x45, 6)), 0);
        assert_eq!(run_filter(&program, &ip_packet(0x60, 17)), 0);
    }

    #[cfg(windows)]
    #[test]
    fn system32_tools_resolve_under_the_system_root() {
        let path = system32_exe(Some(OsStr::new(r"D:\Win")), "logman.exe");
        assert_eq!(path, Path::new(r"D:\Win").join("System32").join("logman.exe"));
    }

    #[cfg(windows)]
    #[test]
    fn a_missing_or_relative_system_root_falls_back() {
        let expected = Path::new(r"C:\Windows").join("System32").join("schtasks.exe");
        assert_eq!(system32_exe(None, "schtasks.exe"), expected);
        assert_eq!(system32_exe(Some(OsStr::new("windows")), "schtasks.exe"), expected);
    }
}
