use std::path::{Path, PathBuf};

const PKEXEC_CANDIDATES: [&str; 3] = ["/usr/bin/pkexec", "/run/wrappers/bin/pkexec", "/usr/local/bin/pkexec"];

const ERROR_CANCELLED: u32 = 1223;

pub const NO_AGENT: &str = "No authentication agent is running, so the password prompt could not open.";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    Applied,
    Cancelled,
    Failed(String),
}

/// Only absolute locations that a normal user cannot write to are considered, so `PATH` never decides
/// which program receives administrator rights.
pub fn pick_pkexec(exists: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    PKEXEC_CANDIDATES.iter().map(PathBuf::from).find(|p| exists(p))
}

/// `pkexec` exits 126 when the prompt is dismissed or refused and 127 when there is no agent to ask.
pub fn pkexec_exit(code: Option<i32>) -> Outcome {
    match code {
        Some(0) => Outcome::Applied,
        Some(126) => Outcome::Cancelled,
        Some(127) => Outcome::Failed(NO_AGENT.into()),
        Some(code) => Outcome::Failed(format!("pkexec exited with {code}")),
        None => Outcome::Failed("pkexec was killed by a signal".into()),
    }
}

/// `last_error` is the Win32 error after a failed `ShellExecuteExW` with the `runas` verb.
pub fn runas_result(last_error: Option<u32>) -> Outcome {
    match last_error {
        None => Outcome::Applied,
        Some(ERROR_CANCELLED) => Outcome::Cancelled,
        Some(code) => Outcome::Failed(format!("Windows error {code}")),
    }
}

pub fn may_prompt(clicked: bool, in_match: bool) -> bool {
    clicked && !in_match
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkexec_zero_is_applied() {
        assert_eq!(pkexec_exit(Some(0)), Outcome::Applied);
    }

    #[test]
    fn pkexec_126_is_cancelled() {
        assert_eq!(pkexec_exit(Some(126)), Outcome::Cancelled);
    }

    #[test]
    fn pkexec_127_names_the_missing_agent() {
        assert_eq!(
            pkexec_exit(Some(127)),
            Outcome::Failed("No authentication agent is running, so the password prompt could not open.".into())
        );
    }

    #[test]
    fn pkexec_unknown_code_is_failed_with_the_code() {
        assert_eq!(pkexec_exit(Some(1)), Outcome::Failed("pkexec exited with 1".into()));
    }

    #[test]
    fn pkexec_signal_is_failed() {
        assert_eq!(pkexec_exit(None), Outcome::Failed("pkexec was killed by a signal".into()));
    }

    #[test]
    fn runas_no_error_is_applied() {
        assert_eq!(runas_result(None), Outcome::Applied);
    }

    #[test]
    fn runas_1223_is_cancelled() {
        assert_eq!(runas_result(Some(1223)), Outcome::Cancelled);
    }

    #[test]
    fn runas_other_error_names_the_code() {
        assert_eq!(runas_result(Some(5)), Outcome::Failed("Windows error 5".into()));
    }

    #[test]
    fn pkexec_is_taken_from_a_fixed_list_never_the_path() {
        let found = pick_pkexec(|p| p == Path::new("/run/wrappers/bin/pkexec"));
        assert_eq!(found, Some(PathBuf::from("/run/wrappers/bin/pkexec")));
        assert_eq!(pick_pkexec(|_| true), Some(PathBuf::from("/usr/bin/pkexec")));
        assert_eq!(
            pick_pkexec(|p| p == Path::new("/usr/local/bin/pkexec")),
            Some(PathBuf::from("/usr/local/bin/pkexec"))
        );
    }

    #[test]
    fn pkexec_never_found_is_none() {
        assert_eq!(pick_pkexec(|_| false), None);
    }

    #[test]
    fn prompts_need_a_click_and_no_match() {
        assert!(may_prompt(true, false));
        assert!(!may_prompt(true, true));
        assert!(!may_prompt(false, false));
        assert!(!may_prompt(false, true));
    }
}
