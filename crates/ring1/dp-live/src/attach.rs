use std::sync::atomic::{AtomicBool, Ordering};

static PTRACE_DENIED: AtomicBool = AtomicBool::new(false);

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
    PTRACE_DENIED.store(denied_by(outcome), Ordering::Relaxed);
}

fn denied_by(outcome: Outcome<'_>) -> bool {
    match outcome {
        Outcome::Attached | Outcome::Absent => false,
        // The supervisor hands over only the error text; this is how `deadlock-memory` words `PtraceDenied`.
        Outcome::Failed(reason) => reason.starts_with("not permitted to read pid"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DENIED: &str = "not permitted to read pid 4242\n  /proc/sys/kernel/yama/ptrace_scope is 1 (only descendants \
                          may be read).";

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
}
