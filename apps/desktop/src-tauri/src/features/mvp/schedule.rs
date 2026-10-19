use std::time::Duration;

/// How often the background run looks for matches to grade.
pub const GRADE_INTERVAL: Duration = Duration::from_secs(30 * 60);

/// `blocked` is what is left of an API `Retry-After` or backoff.
pub fn next_wake(blocked: Option<Duration>) -> Duration {
    blocked.map_or(GRADE_INTERVAL, |b| b.max(GRADE_INTERVAL))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wakes_every_half_hour() {
        assert_eq!(next_wake(None), GRADE_INTERVAL);
    }

    #[test]
    fn a_long_api_block_pushes_the_next_wake_out() {
        assert_eq!(next_wake(Some(Duration::from_secs(60))), GRADE_INTERVAL);
        assert_eq!(next_wake(Some(Duration::from_secs(2400))), Duration::from_secs(2400));
    }
}
