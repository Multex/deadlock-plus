use std::sync::atomic::{AtomicBool, Ordering};

static PTRACE_DENIED: AtomicBool = AtomicBool::new(false);
static GAME_ACCESS_DENIED: AtomicBool = AtomicBool::new(false);

/// Whether the last attach failed with Windows access-denied on `OpenProcess`, which is how an elevated game looks
/// to a normal-user app. Stays set until an attach succeeds or the game closes.
pub fn game_access_denied() -> bool {
    GAME_ACCESS_DENIED.load(Ordering::Relaxed)
}

/// Whether the game link's last attach was refused by the kernel's ptrace policy (Linux Yama `ptrace_scope`).
/// Stays set until an attach succeeds or the game closes.
pub fn ptrace_denied() -> bool {
    PTRACE_DENIED.load(Ordering::Relaxed)
}

/// An attach attempt that ended. The supervisor reports a failure reason only once and then waits, so a wait leaves
/// the verdict as it was and is never recorded.
pub(crate) enum Outcome<'a> {
    Attached,
    Absent,
    Failed(&'a str),
}

pub(crate) fn record(outcome: Outcome<'_>) {
    let access_denied = matches!(outcome, Outcome::Failed(reason) if game_runs_as_admin(reason));
    PTRACE_DENIED.store(denied_by(outcome), Ordering::Relaxed);
    GAME_ACCESS_DENIED.store(access_denied, Ordering::Relaxed);
}

fn denied_by(outcome: Outcome<'_>) -> bool {
    match outcome {
        Outcome::Attached | Outcome::Absent => false,
        // The supervisor hands over only the error text; this is how `deadlock-memory` words `PtraceDenied`.
        Outcome::Failed(reason) => reason.starts_with("not permitted to read pid"),
    }
}

/// Whether an attach failure is the Windows access-denied error from `OpenProcess`, which is how a game running
/// elevated looks to a normal-user app.
pub fn game_runs_as_admin(error: &str) -> bool {
    error
        .strip_prefix("OpenProcess(")
        .and_then(|rest| rest.strip_suffix(") failed: os error 5"))
        .is_some_and(|pid| !pid.is_empty() && pid.bytes().all(|b| b.is_ascii_digit()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const DENIED: &str = "not permitted to read pid 4242\n  /proc/sys/kernel/yama/ptrace_scope is 1 (only descendants \
                          may be read).";

    #[test]
    fn recording_an_open_process_denial_sets_the_flag_and_attaching_clears_it() {
        record(Outcome::Failed("OpenProcess(4242) failed: os error 5"));
        assert!(game_access_denied());
        record(Outcome::Attached);
        assert!(!game_access_denied());
        record(Outcome::Failed("OpenProcess(4242) failed: os error 5"));
        record(Outcome::Absent);
        assert!(!game_access_denied());
        record(Outcome::Failed("OpenProcess(4242) failed: os error 87"));
        assert!(!game_access_denied());
    }

    #[test]
    fn a_refused_read_is_a_ptrace_denial() {
        assert!(denied_by(Outcome::Failed(DENIED)));
    }

    #[test]
    fn other_attach_failures_are_not() {
        assert!(!denied_by(Outcome::Failed("signature \"entity_system\" not found in module image")));
    }

    #[test]
    fn attaching_or_the_game_closing_clears_it() {
        assert!(!denied_by(Outcome::Attached));
        assert!(!denied_by(Outcome::Absent));
    }

    #[test]
    fn access_denied_on_open_process_means_an_elevated_game() {
        assert!(game_runs_as_admin("OpenProcess(4242) failed: os error 5"));
    }

    #[test]
    fn other_open_process_errors_do_not() {
        assert!(!game_runs_as_admin("OpenProcess(4242) failed: os error 87"));
        assert!(!game_runs_as_admin("OpenProcess(4242) failed: os error 50"));
        assert!(!game_runs_as_admin("OpenProcess(4242) failed: os error 5x"));
    }

    #[test]
    fn other_text_and_pid_less_variants_do_not() {
        assert!(!game_runs_as_admin(""));
        assert!(!game_runs_as_admin("OpenProcess() failed: os error 5"));
        assert!(!game_runs_as_admin("OpenProcess(abc) failed: os error 5"));
        assert!(!game_runs_as_admin("OpenProcess failed: os error 5"));
        assert!(!game_runs_as_admin("ReadProcessMemory(0x10, 8) failed: os error 5"));
        assert!(!game_runs_as_admin(DENIED));
    }
}
