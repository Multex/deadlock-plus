use crate::{State, LAUNCH_ARG};

pub const VALUE_NAME: &str = "DeadlockPlus";
pub const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
pub const APPROVED_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";

/// Task Manager writes 0x02 or 0x06 when it enables an entry, and 0x03 or 0x07 when it disables one.
pub const APPROVED_ENABLED: [u8; 12] = [0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

pub fn render(exe: &str) -> String {
    format!("\"{exe}\" {LAUNCH_ARG}")
}

pub fn parse_exe(data: &str) -> Option<String> {
    let data = data.trim();
    if let Some(rest) = data.strip_prefix('"') {
        let end = rest.find('"')?;
        return (end > 0).then(|| rest[..end].to_string());
    }
    // ASCII lowercasing keeps byte offsets, so the index is valid in `data`.
    let end = data.to_ascii_lowercase().find(".exe")? + ".exe".len();
    Some(data[..end].to_string())
}

/// True unless Task Manager has switched the entry off.
pub fn approved(bytes: Option<&[u8]>) -> bool {
    bytes.and_then(|b| b.first()).is_none_or(|first| first & 1 == 0)
}

fn same_path(a: &str, b: &str) -> bool {
    a.trim_matches('"').eq_ignore_ascii_case(b.trim_matches('"'))
}

pub fn state(run_data: Option<&str>, approved_bytes: Option<&[u8]>, target_exe: &str) -> State {
    match run_data {
        Some(data) if approved(approved_bytes) => {
            let stale = parse_exe(data).is_none_or(|exe| !same_path(&exe, target_exe));
            State { enabled: true, stale }
        }
        _ => State { enabled: false, stale: false },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const EXE: &str = r"C:\Program Files\Deadlock+\deadlock-plus.exe";

    #[test]
    fn value_is_the_quoted_path_then_the_launch_arg() {
        assert_eq!(render(EXE), r#""C:\Program Files\Deadlock+\deadlock-plus.exe" --autostart"#);
        assert!(render(EXE).ends_with(&format!(" {LAUNCH_ARG}")));
    }

    #[test]
    fn exe_round_trips_with_spaces_and_plus() {
        for exe in [r"C:\dp\deadlock-plus.exe", EXE, r"D:\My Apps\C++ & Co\dp.exe", r"\srv\share\dp.exe"] {
            assert_eq!(parse_exe(&render(exe)).as_deref(), Some(exe), "{exe}");
        }
    }

    #[test]
    fn unquoted_data_is_read_up_to_the_first_exe() {
        assert_eq!(
            parse_exe(r"C:\Program Files\dp\dp.exe --autostart").as_deref(),
            Some(r"C:\Program Files\dp\dp.exe")
        );
        assert_eq!(parse_exe(r"C:\dp\DP.EXE").as_deref(), Some(r"C:\dp\DP.EXE"));
        assert_eq!(parse_exe(r"  C:\dp\dp.exe -x").as_deref(), Some(r"C:\dp\dp.exe"));
    }

    #[test]
    fn malformed_data_has_no_exe() {
        assert_eq!(parse_exe(""), None);
        assert_eq!(parse_exe("   "), None);
        assert_eq!(parse_exe("\"\" --autostart"), None);
        assert_eq!(parse_exe(r#""C:\dp\dp.exe --autostart"#), None);
        assert_eq!(parse_exe(r"C:\dp\dp.bat --autostart"), None);
    }

    #[test]
    fn low_bit_of_the_first_byte_means_disabled() {
        assert!(approved(Some(&[0x02, 0, 0, 0])));
        assert!(approved(Some(&[0x06, 0, 0, 0])));
        assert!(!approved(Some(&[0x03, 0, 0, 0])));
        assert!(!approved(Some(&[0x07, 0, 0, 0])));
    }

    #[test]
    fn missing_or_empty_approval_means_enabled() {
        assert!(approved(None));
        assert!(approved(Some(&[])));
    }

    #[test]
    fn written_approval_reads_as_enabled() {
        assert_eq!(APPROVED_ENABLED.len(), 12);
        assert!(approved(Some(&APPROVED_ENABLED)));
    }

    #[test]
    fn no_value_means_off_whatever_the_approval_says() {
        assert_eq!(state(None, None, EXE), State { enabled: false, stale: false });
        assert_eq!(state(None, Some(&[0x03]), EXE), State { enabled: false, stale: false });
    }

    #[test]
    fn present_and_approved_pointing_here_is_enabled_and_fresh() {
        let want = State { enabled: true, stale: false };
        assert_eq!(state(Some(&render(EXE)), None, EXE), want);
        assert_eq!(state(Some(&render(EXE)), Some(&APPROVED_ENABLED), EXE), want);
        assert_eq!(state(Some(&render(EXE)), Some(&[0x06]), &EXE.to_uppercase()), want);
        assert_eq!(state(Some(&render(EXE)), None, &format!("\"{EXE}\"")), want);
    }

    #[test]
    fn present_and_approved_pointing_elsewhere_or_unreadable_is_stale() {
        let want = State { enabled: true, stale: true };
        assert_eq!(state(Some(&render(r"D:\Old\dp.exe")), None, EXE), want);
        assert_eq!(state(Some("garbage"), Some(&[0x02]), EXE), want);
    }

    #[test]
    fn disabled_in_task_manager_reads_as_off_and_not_stale() {
        let off = State { enabled: false, stale: false };
        assert_eq!(state(Some(&render(EXE)), Some(&[0x03]), EXE), off);
        assert_eq!(state(Some(&render(r"D:\Old\dp.exe")), Some(&[0x07]), EXE), off);
    }
}
