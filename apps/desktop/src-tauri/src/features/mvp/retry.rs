use std::time::Duration;

const BASE_BACKOFF: Duration = Duration::from_secs(30);
const MAX_BACKOFF: Duration = Duration::from_secs(30 * 60);
/// A `Retry-After` longer than this is treated as a mistake and clamped.
const MAX_RETRY_AFTER: Duration = Duration::from_secs(60 * 60);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reply {
    Ok,
    /// 404: the API has not ingested the match yet. Normal for a new match; try again on a later run.
    NotYet,
    /// 429, 5xx or a timeout: wait this long before the next call to the API.
    Wait(Duration),
    Fail,
}

/// `attempt` counts earlier failures of the same call, starting at 0.
pub fn classify(status: u16, retry_after: Option<&str>, attempt: u32) -> Reply {
    match status {
        200..=299 => Reply::Ok,
        404 => Reply::NotYet,
        429 | 500..=599 => Reply::Wait(retry_after.and_then(retry_after_secs).unwrap_or_else(|| backoff(attempt))),
        _ => Reply::Fail,
    }
}

/// Only the delay-seconds form; the HTTP-date form falls back to the backoff.
fn retry_after_secs(value: &str) -> Option<Duration> {
    value.trim().parse::<u64>().ok().map(|s| Duration::from_secs(s).min(MAX_RETRY_AFTER))
}

/// A request that never got a status (timeout, connection reset) backs off like a 5xx.
pub fn transport_failure(attempt: u32) -> Reply {
    Reply::Wait(backoff(attempt))
}

pub fn backoff(attempt: u32) -> Duration {
    BASE_BACKOFF.saturating_mul(1u32.checked_shl(attempt).unwrap_or(u32::MAX)).min(MAX_BACKOFF)
}

#[cfg(test)]
mod tests {
    use super::*;

    const S: fn(u64) -> Duration = Duration::from_secs;

    #[test]
    fn success_and_not_found() {
        assert_eq!(classify(200, None, 0), Reply::Ok);
        assert_eq!(classify(204, None, 3), Reply::Ok);
        assert_eq!(classify(404, None, 0), Reply::NotYet);
    }

    #[test]
    fn rate_limits_honour_retry_after_in_seconds() {
        assert_eq!(classify(429, Some("12"), 0), Reply::Wait(S(12)));
        assert_eq!(classify(429, Some(" 7 "), 4), Reply::Wait(S(7)));
        assert_eq!(classify(503, Some("90"), 0), Reply::Wait(S(90)));
    }

    #[test]
    fn a_missing_or_unreadable_retry_after_backs_off() {
        assert_eq!(classify(429, None, 0), Reply::Wait(S(30)));
        assert_eq!(classify(503, Some("Wed, 21 Oct 2026 07:28:00 GMT"), 1), Reply::Wait(S(60)));
        assert_eq!(classify(500, None, 2), Reply::Wait(S(120)));
        assert_eq!(classify(502, Some(""), 0), Reply::Wait(S(30)));
    }

    #[test]
    fn retry_after_is_clamped_to_an_hour() {
        assert_eq!(classify(429, Some("999999"), 0), Reply::Wait(S(3600)));
    }

    #[test]
    fn backoff_doubles_and_caps_at_thirty_minutes() {
        assert_eq!(backoff(0), S(30));
        assert_eq!(backoff(3), S(240));
        assert_eq!(backoff(6), S(1800));
        assert_eq!(backoff(60), S(1800));
        assert_eq!(transport_failure(1), Reply::Wait(S(60)));
    }

    #[test]
    fn other_client_errors_fail() {
        assert_eq!(classify(400, None, 0), Reply::Fail);
        assert_eq!(classify(403, Some("5"), 0), Reply::Fail);
        assert_eq!(classify(301, None, 0), Reply::Fail);
    }
}
