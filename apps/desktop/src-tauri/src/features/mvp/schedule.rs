use std::time::Duration;

use dp_mvp::ModelCache;

/// No model and the API down: try the sample again this often. Also the gap between failed refreshes of a stale
/// model, so a broken API is not asked for 40 MB every grading run.
pub const REFRESH_RETRY: Duration = Duration::from_secs(60 * 60);
/// How often new matches are looked for while a model is loaded.
pub const GRADE_INTERVAL: Duration = Duration::from_secs(30 * 60);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Plan {
    pub refresh: bool,
    pub grade: bool,
}

/// `last_attempt` is when a refresh last failed or was cancelled, in Unix seconds.
pub fn plan(model: Option<&ModelCache>, now: i64, last_attempt: Option<i64>) -> Plan {
    let stale = model.is_none_or(|m| m.needs_refresh(now));
    let may_retry = last_attempt.is_none_or(|at| now - at >= REFRESH_RETRY.as_secs() as i64);
    Plan { refresh: stale && may_retry, grade: model.is_some() }
}

/// `blocked` is what is left of an API `Retry-After` or backoff.
pub fn next_wake(has_model: bool, blocked: Option<Duration>) -> Duration {
    let base = if has_model { GRADE_INTERVAL } else { REFRESH_RETRY };
    blocked.map_or(base, |b| b.max(base))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::mvp::store::tests::model;

    const DAY: i64 = 86_400;

    #[test]
    fn no_model_refreshes_and_cannot_grade() {
        assert_eq!(plan(None, 1_000, None), Plan { refresh: true, grade: false });
    }

    #[test]
    fn a_fresh_model_grades_without_refreshing() {
        let m = model();
        assert_eq!(plan(Some(&m), m.built_at + DAY, None), Plan { refresh: false, grade: true });
    }

    #[test]
    fn a_week_old_model_refreshes_and_still_grades_meanwhile() {
        let m = model();
        assert_eq!(plan(Some(&m), m.built_at + 8 * DAY, None), Plan { refresh: true, grade: true });
    }

    #[test]
    fn a_failed_refresh_waits_an_hour_before_the_next() {
        let m = model();
        let now = m.built_at + 8 * DAY;
        assert_eq!(plan(Some(&m), now, Some(now - 3599)), Plan { refresh: false, grade: true });
        assert_eq!(plan(Some(&m), now, Some(now - 3600)), Plan { refresh: true, grade: true });
        assert_eq!(plan(None, now, Some(now - 10)), Plan { refresh: false, grade: false });
    }

    #[test]
    fn wakes_hourly_without_a_model_and_every_half_hour_with_one() {
        assert_eq!(next_wake(false, None), REFRESH_RETRY);
        assert_eq!(next_wake(true, None), GRADE_INTERVAL);
    }

    #[test]
    fn a_long_api_block_pushes_the_next_wake_out() {
        assert_eq!(next_wake(true, Some(Duration::from_secs(60))), GRADE_INTERVAL);
        assert_eq!(next_wake(true, Some(Duration::from_secs(2400))), Duration::from_secs(2400));
        assert_eq!(next_wake(false, Some(Duration::from_secs(4000))), Duration::from_secs(4000));
    }
}
