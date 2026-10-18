use std::ffi::OsString;
use std::path::{Component, Path, PathBuf, Prefix};

pub const HELPER_DIR: &str = "Deadlock+";
pub const HELPER_EXE: &str = "deadlock-plus-helper.exe";
pub const HELPER_ARG: &str = "--privileged-helper";
pub const SERVICE_ARG: &str = "--service";
pub const SERVICE_NAME: &str = "DeadlockPlusHelper";
pub const SERVICE_PIPE: &str = r"\\.\pipe\DeadlockPlusHelper";
const HELPER_PIPE_PREFIX: &str = r"\\.\pipe\DeadlockPlusHelper-";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Launch {
    Helper { pipe: String, app_pid: u32 },
    Service,
}

pub fn parse(argv: &[OsString]) -> Option<Result<Launch, String>> {
    let flag = argv.get(1)?;
    if flag == HELPER_ARG {
        Some(parse_helper(&argv[2..]))
    } else if flag == SERVICE_ARG {
        Some(if argv.len() == 2 { Ok(Launch::Service) } else { Err(format!("{SERVICE_ARG} takes no arguments")) })
    } else {
        None
    }
}

fn parse_helper(rest: &[OsString]) -> Result<Launch, String> {
    let [pipe, pid] = rest else {
        return Err(format!("{HELPER_ARG} needs a pipe name and a process id"));
    };
    let pipe = pipe.to_str().ok_or("pipe name is not valid UTF-8")?;
    let app_pid = parse_pid(pid.to_str().ok_or("process id is not valid UTF-8")?)?;
    let name_pid = pipe_pid(pipe).ok_or("pipe name has the wrong shape")?;
    if name_pid != app_pid {
        return Err("pipe name and process id disagree".into());
    }
    Ok(Launch::Helper { pipe: pipe.to_string(), app_pid })
}

fn parse_pid(text: &str) -> Result<u32, String> {
    match text.parse::<u32>() {
        Ok(pid) if pid != 0 && pid.to_string() == text => Ok(pid),
        _ => Err("process id must be a plain non-zero number".into()),
    }
}

fn pipe_pid(pipe: &str) -> Option<u32> {
    let rest = pipe.strip_prefix(HELPER_PIPE_PREFIX)?;
    let (pid, nonce) = rest.split_once('-')?;
    let lower_hex = nonce.len() == 32 && nonce.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'));
    if !lower_hex {
        return None;
    }
    parse_pid(pid).ok()
}

pub fn helper_pipe_name(app_pid: u32, nonce: u128) -> String {
    format!("{HELPER_PIPE_PREFIX}{app_pid}-{nonce:032x}")
}

pub fn helper_params(pipe: &str, app_pid: u32) -> String {
    format!("{HELPER_ARG} {pipe} {app_pid}")
}

pub fn service_command_line(exe: &Path) -> Option<String> {
    let text = exe.to_str()?;
    if !exe.is_absolute() || text.contains('"') {
        return None;
    }
    Some(format!("\"{text}\" {SERVICE_ARG}"))
}

pub fn is_protected_install(exe: &Path, roots: &[&Path]) -> bool {
    if has_dot_segment(exe) {
        return false;
    }
    let exe_parts = lowered_components(exe);
    roots.iter().any(|root| {
        if root.as_os_str().is_empty() || !root.is_absolute() || has_dot_segment(root) {
            return false;
        }
        let root_parts = lowered_components(root);
        exe_parts.len() > root_parts.len() && exe_parts.starts_with(&root_parts)
    })
}

fn has_dot_segment(path: &Path) -> bool {
    let text = path.to_string_lossy();
    text.split(['/', '\\']).any(|part| part == "." || part == "..")
        || path.components().any(|c| matches!(c, Component::CurDir | Component::ParentDir))
}

fn lowered_components(path: &Path) -> Vec<String> {
    path.components().map(|c| c.as_os_str().to_string_lossy().to_lowercase()).collect()
}

pub fn installed_helper_path(common_files: &Path) -> PathBuf {
    common_files.join(HELPER_DIR).join(HELPER_EXE)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HelperPick {
    Installed,
    NextToApp,
}

/// A debug build runs the helper next to it first, so a dev build never runs an older installed helper.
pub fn pick_helper(installed: bool, next_to_app: bool, debug: bool) -> Option<HelperPick> {
    match (debug, installed, next_to_app) {
        (false, true, _) | (true, true, false) => Some(HelperPick::Installed),
        (_, _, true) => Some(HelperPick::NextToApp),
        (_, false, false) => None,
    }
}

/// Fails closed: relative paths, `.`/`..` segments and non-UTF-8 never match. `\\?\C:\` equals `C:\` and
/// `\\?\UNC\h\s` equals `\\h\s`. Case folding is ASCII only, since full Unicode lowercasing can join names that
/// NTFS keeps apart (U+212A KELVIN SIGN lowercases to `k`).
pub fn same_path(a: &Path, b: &Path) -> bool {
    match (path_key(a), path_key(b)) {
        (Some(a), Some(b)) => a == b,
        _ => false,
    }
}

fn path_key(path: &Path) -> Option<Vec<String>> {
    if !path.is_absolute() || has_dot_segment(path) {
        return None;
    }
    path.components()
        .map(|c| match c {
            Component::Prefix(prefix) => prefix_key(prefix.kind()),
            other => other.as_os_str().to_str().map(str::to_ascii_lowercase),
        })
        .collect()
}

fn prefix_key(prefix: Prefix) -> Option<String> {
    let lower = |part: &std::ffi::OsStr| part.to_str().map(str::to_ascii_lowercase);
    Some(match prefix {
        Prefix::Disk(drive) | Prefix::VerbatimDisk(drive) => format!("{}:", drive.to_ascii_lowercase() as char),
        Prefix::UNC(host, share) | Prefix::VerbatimUNC(host, share) => {
            format!(r"\\{}\{}", lower(host)?, lower(share)?)
        }
        Prefix::Verbatim(part) => format!(r"\\?\{}", lower(part)?),
        Prefix::DeviceNS(part) => format!(r"\\.\{}", lower(part)?),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn argv(parts: &[&str]) -> Vec<OsString> {
        parts.iter().map(OsString::from).collect()
    }

    fn name(pid: u32, nonce: u128) -> String {
        helper_pipe_name(pid, nonce)
    }

    #[test]
    fn pipe_name_shape() {
        assert_eq!(name(42, 0xAB), r"\\.\pipe\DeadlockPlusHelper-42-000000000000000000000000000000ab");
        assert_eq!(name(1, u128::MAX), format!(r"\\.\pipe\DeadlockPlusHelper-1-{}", "f".repeat(32)));
    }

    #[test]
    fn plain_launch_is_not_ours() {
        assert_eq!(parse(&argv(&["app.exe"])), None);
        assert_eq!(parse(&argv(&["app.exe", "--other"])), None);
        assert_eq!(parse(&[]), None);
        assert_eq!(parse(&argv(&["app.exe", "x", "--service"])), None);
    }

    #[test]
    fn service_launch() {
        assert_eq!(parse(&argv(&["app.exe", "--service"])), Some(Ok(Launch::Service)));
    }

    #[test]
    fn service_rejects_extra() {
        assert!(matches!(parse(&argv(&["app.exe", "--service", "x"])), Some(Err(_))));
    }

    #[test]
    fn helper_round_trip() {
        let pipe = name(4242, 7);
        let params = helper_params(&pipe, 4242);
        let mut v = vec![OsString::from("app.exe")];
        v.extend(params.split(' ').map(OsString::from));
        assert_eq!(parse(&v), Some(Ok(Launch::Helper { pipe, app_pid: 4242 })));
    }

    #[test]
    fn helper_rejects_bad_shapes() {
        let good = name(5, 9);
        let bad: Vec<Vec<String>> = vec![
            vec![],
            vec![good.clone()],
            vec![good.clone(), "5".into(), "extra".into()],
            vec![good.clone(), "6".into()],
            vec![good.clone(), "0".into()],
            vec![name(0, 9), "0".into()],
            vec![good.clone(), "+5".into()],
            vec![good.clone(), "05".into()],
            vec![good.clone(), "".into()],
            vec![good.clone(), "-5".into()],
            vec![good.clone(), "4294967296".into()],
            vec![good.to_uppercase(), "5".into()],
            vec![format!("{good}x"), "5".into()],
            vec![good.replace("-5-", "-05-"), "5".into()],
            vec![good.replace("DeadlockPlusHelper", "Other"), "5".into()],
            vec![good.replacen(r"\\.\pipe\", r"\\evil\pipe\", 1), "5".into()],
            vec![good.replace("-9", "-").replace("0000", "000"), "5".into()],
            vec![good.replace('0', "G"), "5".into()],
            vec![good.replace('0', "A"), "5".into()],
            vec![format!(r"{}\..\x", good), "5".into()],
            vec![r"\\.\pipe\DeadlockPlusHelper".into(), "5".into()],
            vec![r"\\.\pipe\DeadlockPlusHelper-5-".into(), "5".into()],
        ];
        for tail in bad {
            let mut parts = vec!["app.exe".to_string(), HELPER_ARG.to_string()];
            parts.extend(tail.clone());
            let refs: Vec<&str> = parts.iter().map(String::as_str).collect();
            assert!(matches!(parse(&argv(&refs)), Some(Err(_))), "accepted {tail:?}");
        }
    }

    #[test]
    fn helper_rejects_non_utf8() {
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStringExt;
            let bad = OsString::from_wide(&[0xD800]);
            let v = vec![OsString::from("a"), OsString::from(HELPER_ARG), bad, OsString::from("5")];
            assert!(matches!(parse(&v), Some(Err(_))));
        }
    }

    #[test]
    fn service_command_line_quotes() {
        let exe = Path::new(if cfg!(windows) { r"C:\Program Files\Deadlock+\app.exe" } else { "/opt/a b/app" });
        let line = service_command_line(exe).unwrap();
        assert_eq!(line, format!("\"{}\" --service", exe.display()));
    }

    #[test]
    fn service_command_line_refuses_hostile() {
        assert_eq!(service_command_line(Path::new("app.exe")), None);
        assert_eq!(service_command_line(Path::new(r"rel\app.exe")), None);
        if cfg!(windows) {
            assert_eq!(service_command_line(Path::new("C:\\a\"b\\app.exe")), None);
        } else {
            assert_eq!(service_command_line(Path::new("/a\"b/app")), None);
        }
    }

    fn root() -> PathBuf {
        PathBuf::from(if cfg!(windows) { r"C:\Program Files" } else { "/Program Files" })
    }

    fn under(rest: &str) -> PathBuf {
        let mut p = root();
        for part in rest.split('/') {
            p.push(part);
        }
        p
    }

    #[test]
    fn protected_install_accepts_inside() {
        let r = root();
        assert!(is_protected_install(&under("Deadlock+/app.exe"), &[r.as_path()]));
        let r2 = PathBuf::from(if cfg!(windows) { r"C:\Other" } else { "/Other" });
        assert!(is_protected_install(&under("a/b/c.exe"), &[r2.as_path(), r.as_path()]));
    }

    #[test]
    fn protected_install_rejects_outside_and_tricks() {
        let r = root();
        let roots = [r.as_path()];
        assert!(!is_protected_install(&r, &roots));
        assert!(!is_protected_install(&under("..").join("evil.exe"), &roots));
        assert!(!is_protected_install(&under("a/../../evil.exe"), &roots));
        assert!(!is_protected_install(&under("./a.exe"), &roots));
        assert!(!is_protected_install(Path::new("app.exe"), &roots));
        assert!(!is_protected_install(&under("a.exe"), &[]));
        let prefix = PathBuf::from(format!("{}X", r.display())).join("a.exe");
        assert!(!is_protected_install(&prefix, &roots));
        assert!(!is_protected_install(&under("a.exe"), &[Path::new("")]));
    }

    #[test]
    fn protected_install_ignores_case_on_windows() {
        if cfg!(windows) {
            let r = root();
            assert!(is_protected_install(Path::new(r"c:\PROGRAM FILES\x\a.exe"), &[r.as_path()]));
            assert!(!is_protected_install(Path::new(r"c:\PROGRAM FILESX\a.exe"), &[r.as_path()]));
        }
    }

    #[cfg(windows)]
    #[test]
    fn protected_install_rejects_other_drive_and_unc() {
        let r = root();
        assert!(!is_protected_install(Path::new(r"D:\Program Files\a.exe"), &[r.as_path()]));
        assert!(!is_protected_install(Path::new(r"\\?\C:\Program Files\a.exe"), &[r.as_path()]));
        assert!(!is_protected_install(Path::new(r"\\host\share\Program Files\a.exe"), &[r.as_path()]));
    }

    #[test]
    fn installed_helper_sits_in_its_own_folder() {
        let common = PathBuf::from(if cfg!(windows) { r"C:\Program Files\Common Files" } else { "/common" });
        assert_eq!(installed_helper_path(&common), common.join("Deadlock+").join("deadlock-plus-helper.exe"));
    }

    #[test]
    fn release_prefers_the_installed_helper() {
        assert_eq!(pick_helper(true, true, false), Some(HelperPick::Installed));
        assert_eq!(pick_helper(true, false, false), Some(HelperPick::Installed));
        assert_eq!(pick_helper(false, true, false), Some(HelperPick::NextToApp));
        assert_eq!(pick_helper(false, false, false), None);
    }

    #[test]
    fn debug_prefers_the_helper_next_to_the_app() {
        assert_eq!(pick_helper(true, true, true), Some(HelperPick::NextToApp));
        assert_eq!(pick_helper(false, true, true), Some(HelperPick::NextToApp));
        assert_eq!(pick_helper(true, false, true), Some(HelperPick::Installed));
        assert_eq!(pick_helper(false, false, true), None);
    }

    #[test]
    fn same_path_matches_itself_and_ignores_a_trailing_separator() {
        let p = under("Common Files/Deadlock+/deadlock-plus-helper.exe");
        assert!(same_path(&p, &p));
        let trailing = PathBuf::from(format!("{}{}", root().display(), std::path::MAIN_SEPARATOR));
        assert!(same_path(&root(), &trailing));
        assert!(!same_path(&p, &under("Common Files/Deadlock+/other.exe")));
        assert!(!same_path(&p, &under("Common Files/Deadlock+")));
        assert!(!same_path(&under("Common Files/Deadlock+"), &p));
    }

    #[test]
    fn same_path_refuses_relative_paths_and_dot_segments() {
        let p = under("Common Files/Deadlock+/deadlock-plus-helper.exe");
        assert!(!same_path(Path::new(HELPER_EXE), Path::new(HELPER_EXE)));
        assert!(!same_path(Path::new(""), Path::new("")));
        let parent = under("Common Files/x/../Deadlock+/deadlock-plus-helper.exe");
        assert!(!same_path(&parent, &p));
        assert!(!same_path(&parent, &parent));
        let current = under("Common Files/./Deadlock+/deadlock-plus-helper.exe");
        assert!(!same_path(&current, &current));
    }

    #[cfg(windows)]
    #[test]
    fn same_path_windows_rules() {
        let installed = Path::new(r"C:\Program Files\Common Files\Deadlock+\deadlock-plus-helper.exe");
        let same = [
            r"c:\program files\common files\deadlock+\DEADLOCK-PLUS-HELPER.EXE",
            r"C:/Program Files/Common Files/Deadlock+/deadlock-plus-helper.exe",
            r"C:\Program Files\\Common Files\Deadlock+\deadlock-plus-helper.exe",
            r"\\?\C:\Program Files\Common Files\Deadlock+\deadlock-plus-helper.exe",
            r"\\?\c:\PROGRAM FILES\Common Files\Deadlock+\deadlock-plus-helper.exe",
        ];
        for other in same {
            assert!(same_path(installed, Path::new(other)), "{other}");
            assert!(same_path(Path::new(other), installed), "{other}");
        }
        let different = [
            r"D:\Program Files\Common Files\Deadlock+\deadlock-plus-helper.exe",
            r"\Program Files\Common Files\Deadlock+\deadlock-plus-helper.exe",
            r"C:Program Files\Common Files\Deadlock+\deadlock-plus-helper.exe",
            r"\\host\share\Program Files\Common Files\Deadlock+\deadlock-plus-helper.exe",
            r"\\.\C:\Program Files\Common Files\Deadlock+\deadlock-plus-helper.exe",
            r"\\?\C:\Program Files\Common Files\x\..\Deadlock+\deadlock-plus-helper.exe",
            r"C:\Program Files\Common Files\Deadlock+\deadlock-plus-helper.exe:stream",
            r"C:\Program Files\Common Files\Deadlock+\deadlock-plus-helper.exe.",
            "C:\\Program Files\\Common Files\\Deadloc\u{212A}+\\deadlock-plus-helper.exe",
        ];
        for other in different {
            assert!(!same_path(installed, Path::new(other)), "{other}");
            assert!(!same_path(Path::new(other), installed), "{other}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn same_path_unc_and_verbatim_unc_agree() {
        let a = Path::new(r"\\Host\Share\Deadlock+\deadlock-plus-helper.exe");
        let b = Path::new(r"\\?\UNC\host\SHARE\Deadlock+\deadlock-plus-helper.exe");
        assert!(same_path(a, b));
        assert!(same_path(b, a));
        assert!(!same_path(a, Path::new(r"\\host\other\Deadlock+\deadlock-plus-helper.exe")));
    }
}
