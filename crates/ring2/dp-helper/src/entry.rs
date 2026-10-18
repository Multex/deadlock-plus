use crate::args::{self, Launch};
use std::ffi::OsString;

#[derive(Debug, PartialEq, Eq)]
pub enum Action {
    Helper { pipe: String, app_pid: u32 },
    Service,
    Invalid(String),
}

pub fn action(argv: &[OsString]) -> Option<Action> {
    Some(match args::parse(argv)? {
        Ok(Launch::Helper { pipe, app_pid }) => Action::Helper { pipe, app_pid },
        Ok(Launch::Service) => Action::Service,
        Err(error) => Action::Invalid(error),
    })
}

/// Runs the helper or the service that `argv` names and returns its exit code; 2 for any other argv.
pub fn run(argv: impl IntoIterator<Item = OsString>) -> i32 {
    match action(&argv.into_iter().collect::<Vec<_>>()) {
        Some(Action::Helper { pipe, app_pid }) => crate::helper_main::run(&pipe, app_pid),
        Some(Action::Service) => crate::service_main::run(),
        Some(Action::Invalid(error)) => {
            eprintln!("{error}");
            2
        }
        None => 2,
    }
}

#[cfg(test)]
mod tests {
    use super::{action, Action};
    use std::ffi::OsString;

    fn argv(parts: &[&str]) -> Vec<OsString> {
        parts.iter().map(OsString::from).collect()
    }

    #[test]
    fn plain_argv_gives_no_action() {
        assert_eq!(action(&argv(&["deadlock-plus-helper.exe"])), None);
        assert_eq!(action(&[]), None);
    }

    #[test]
    fn app_argv_gives_no_action() {
        assert_eq!(action(&argv(&["dp.exe", "deadlockplus://x"])), None);
    }

    #[test]
    fn helper_argv_runs_the_helper() {
        let pipe = crate::args::helper_pipe_name(4242, 7);
        let a = argv(&["dp.exe", "--privileged-helper", &pipe, "4242"]);
        assert_eq!(action(&a), Some(Action::Helper { pipe, app_pid: 4242 }));
    }

    #[test]
    fn service_argv_runs_the_service() {
        assert_eq!(action(&argv(&["dp.exe", "--service"])), Some(Action::Service));
    }

    #[test]
    fn bad_privileged_argv_is_invalid() {
        for bad in [
            argv(&["dp.exe", "--privileged-helper"]),
            argv(&["dp.exe", "--privileged-helper", r"\\.\pipe\x", "1"]),
            argv(&["dp.exe", "--service", "extra"]),
        ] {
            assert!(matches!(action(&bad), Some(Action::Invalid(_))), "{bad:?}");
        }
    }
}
