use std::ffi::OsString;
use std::path::{Component, Path};

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
}
