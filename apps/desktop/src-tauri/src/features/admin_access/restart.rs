use std::time::Duration;

use dp_privilege::Outcome;
use serde::Serialize;
use ts_rs::TS;

use super::AdminAccessError;
use crate::features::error::AppError;

const AFTER_PID_ARG: &str = "--after-pid=";
/// The old instance gets 2 s for the page to save, then stops its services; this bound covers both with room.
const AFTER_PID_WAIT: Duration = Duration::from_secs(10);
const AFTER_PID_POLL: Duration = Duration::from_millis(100);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum RestartAsAdminOutcome {
    Launched,
    /// The user dismissed the UAC prompt; this instance keeps running.
    Cancelled,
}

/// Nothing else is carried over: `--autostart` would start the elevated run hidden in the tray.
pub fn relaunch_params(pid: u32) -> String {
    format!("{AFTER_PID_ARG}{pid}")
}

/// The process a relaunch must outlive: while it runs, the single-instance check would hand this launch to it.
pub fn previous_instance<I, S>(args: I, own_pid: u32) -> Option<u32>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .find_map(|arg| arg.as_ref().strip_prefix(AFTER_PID_ARG)?.parse().ok())
        .filter(|&pid| pid != own_pid)
}

pub fn restart_outcome(launch: Result<(), Outcome>) -> Result<RestartAsAdminOutcome, AppError> {
    match launch {
        Ok(()) | Err(Outcome::Applied) => Ok(RestartAsAdminOutcome::Launched),
        Err(Outcome::Cancelled) => Ok(RestartAsAdminOutcome::Cancelled),
        Err(Outcome::Failed(detail)) => Err(AppError::new(AdminAccessError::RestartFailed).detail(detail)),
    }
}

/// True once `alive` reports the process gone; false when the bound runs out first.
fn wait_until_gone(mut alive: impl FnMut() -> bool, mut sleep: impl FnMut(Duration)) -> bool {
    let mut waited = Duration::ZERO;
    while alive() {
        if waited >= AFTER_PID_WAIT {
            return false;
        }
        sleep(AFTER_PID_POLL);
        waited += AFTER_PID_POLL;
    }
    true
}

/// Runs before Tauri starts, so the single-instance plugin sees the old instance gone.
pub fn wait_for_previous_instance() {
    let Some(pid) = previous_instance(std::env::args(), std::process::id()) else { return };
    let pid = sysinfo::Pid::from_u32(pid);
    let mut system = sysinfo::System::new();
    wait_until_gone(
        || {
            system.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);
            system.process(pid).is_some()
        },
        std::thread::sleep,
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relaunch_passes_only_the_wait_marker() {
        assert_eq!(relaunch_params(4242), "--after-pid=4242");
    }

    #[test]
    fn relaunch_never_starts_hidden_or_privileged() {
        let params = relaunch_params(1);
        let argv = ["deadlock-plus.exe".to_string(), params.clone()];
        assert!(!params.contains("--autostart"));
        assert_eq!(crate::privileged_argv_exit_code(&argv.map(Into::into)), None);
    }

    #[test]
    fn the_relaunch_marker_round_trips() {
        let args = ["deadlock-plus.exe".to_string(), relaunch_params(4242)];
        assert_eq!(previous_instance(&args, 7), Some(4242));
    }

    #[test]
    fn an_ordinary_launch_waits_for_nothing() {
        assert_eq!(previous_instance(["deadlock-plus.exe"], 7), None);
        assert_eq!(previous_instance(["deadlock-plus.exe", "--autostart"], 7), None);
        assert_eq!(previous_instance(["deadlock-plus.exe", "deadlockplus://match/1"], 7), None);
    }

    #[test]
    fn a_malformed_marker_waits_for_nothing() {
        for bad in ["--after-pid", "--after-pid=", "--after-pid=abc", "--after-pid=-1", "--after-pid 12"] {
            assert_eq!(previous_instance(["deadlock-plus.exe", bad], 7), None, "{bad}");
        }
    }

    #[test]
    fn a_marker_naming_this_process_waits_for_nothing() {
        assert_eq!(previous_instance(["deadlock-plus.exe", "--after-pid=7"], 7), None);
    }

    #[test]
    fn a_launch_is_launched() {
        assert_eq!(restart_outcome(Ok(())), Ok(RestartAsAdminOutcome::Launched));
    }

    #[test]
    fn a_dismissed_prompt_is_cancelled() {
        assert_eq!(restart_outcome(Err(Outcome::Cancelled)), Ok(RestartAsAdminOutcome::Cancelled));
    }

    #[test]
    fn any_other_failure_is_an_error() {
        let error = restart_outcome(Err(Outcome::Failed("Windows error 2".into()))).unwrap_err();
        assert_eq!(error.code(), AppError::new(AdminAccessError::RestartFailed).code());
    }

    #[test]
    fn outcomes_serialize_as_the_page_expects() {
        assert_eq!(serde_json::to_value(RestartAsAdminOutcome::Launched).unwrap(), "launched");
        assert_eq!(serde_json::to_value(RestartAsAdminOutcome::Cancelled).unwrap(), "cancelled");
    }

    #[test]
    fn a_gone_process_is_not_waited_on() {
        let mut sleeps = 0;
        assert!(wait_until_gone(|| false, |_| sleeps += 1));
        assert_eq!(sleeps, 0);
    }

    #[test]
    fn the_wait_ends_once_the_process_exits() {
        let mut checks = 0;
        let mut sleeps = 0;
        let gone = wait_until_gone(
            || {
                checks += 1;
                checks <= 3
            },
            |_| sleeps += 1,
        );
        assert!(gone);
        assert_eq!(sleeps, 3);
    }

    #[test]
    fn the_wait_is_bounded() {
        let mut slept = Duration::ZERO;
        assert!(!wait_until_gone(|| true, |d| slept += d));
        assert_eq!(slept, AFTER_PID_WAIT);
    }
}
