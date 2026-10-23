use std::time::Duration;

use serde::Deserialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reply {
    Ok,
    /// 404: the API has not ingested the match yet. Normal for a new match; try again on a later run.
    NotYet,
    /// 429, 5xx or a timeout: wait this long before the next call to the API.
    Wait(Duration),
    Fail,
}

/// How long to wait before calling deadlock-api again after a rate limit or a busy server.
#[derive(Debug, Clone, Copy)]
pub struct Backoff {
    pub base: Duration,
    pub max: Duration,
    /// A `Retry-After` longer than this is treated as a mistake and clamped.
    pub max_retry_after: Duration,
    /// deadlock-api floors `Retry-After` to whole seconds, so `0` means "under a second", not "now".
    pub min_retry_after: Duration,
}

impl Backoff {
    /// `attempt` counts earlier failures of the same call, starting at 0.
    pub fn classify(&self, status: u16, retry_after: Option<&str>, attempt: u32) -> Reply {
        match status {
            200..=299 => Reply::Ok,
            404 => Reply::NotYet,
            429 | 500..=599 => {
                Reply::Wait(retry_after.and_then(|v| self.retry_after(v)).unwrap_or_else(|| self.after(attempt)))
            }
            _ => Reply::Fail,
        }
    }

    /// Only the delay-seconds form; the HTTP-date form falls back to the backoff.
    fn retry_after(&self, value: &str) -> Option<Duration> {
        let secs = value.trim().parse::<u64>().ok()?;
        Some(Duration::from_secs(secs).max(self.min_retry_after).min(self.max_retry_after))
    }

    pub fn after(&self, attempt: u32) -> Duration {
        self.base.saturating_mul(1u32.checked_shl(attempt).unwrap_or(u32::MAX)).min(self.max)
    }
}

#[derive(Deserialize)]
struct RateLimitBody {
    #[serde(rename = "type")]
    quota: String,
}

/// Which deadlock-api quota a 429 body says ran out: per IP, per key or global.
pub fn rate_limit_quota(body: &[u8]) -> Option<String> {
    serde_json::from_slice::<RateLimitBody>(body).ok().map(|b| b.quota)
}
