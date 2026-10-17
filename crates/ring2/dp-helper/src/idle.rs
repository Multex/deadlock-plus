use std::time::Duration;

pub const IDLE_TIMEOUT: Duration = Duration::from_secs(5 * 60);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct IdleFacts {
    pub since_last_request: Duration,
    pub capture_running: bool,
    /// `Some` only in helper mode, where the server watches the app process.
    pub owner_alive: Option<bool>,
}

pub fn should_exit(facts: &IdleFacts) -> bool {
    if facts.owner_alive == Some(false) {
        return true;
    }
    !facts.capture_running && facts.since_last_request >= IDLE_TIMEOUT
}

#[cfg(test)]
mod tests {
    use super::*;

    fn facts(secs: u64, capture_running: bool, owner_alive: Option<bool>) -> IdleFacts {
        IdleFacts { since_last_request: Duration::from_secs(secs), capture_running, owner_alive }
    }

    #[test]
    fn timeout_is_five_minutes() {
        assert_eq!(IDLE_TIMEOUT, Duration::from_secs(300));
    }

    #[test]
    fn stays_alive_just_under_the_timeout() {
        let f = IdleFacts {
            since_last_request: IDLE_TIMEOUT - Duration::from_nanos(1),
            capture_running: false,
            owner_alive: Some(true),
        };
        assert!(!should_exit(&f));
    }

    #[test]
    fn exits_exactly_at_the_timeout() {
        assert!(should_exit(&facts(300, false, Some(true))));
        assert!(should_exit(&facts(301, false, Some(true))));
    }

    #[test]
    fn running_capture_keeps_it_alive_past_the_timeout() {
        assert!(!should_exit(&facts(3600, true, Some(true))));
        assert!(!should_exit(&facts(3600, true, None)));
    }

    #[test]
    fn dead_owner_exits_at_once_even_with_a_capture() {
        assert!(should_exit(&facts(0, true, Some(false))));
        assert!(should_exit(&facts(0, false, Some(false))));
    }

    #[test]
    fn service_mode_ignores_the_owner() {
        assert!(!should_exit(&facts(0, false, None)));
        assert!(!should_exit(&facts(299, false, None)));
        assert!(should_exit(&facts(300, false, None)));
    }
}
