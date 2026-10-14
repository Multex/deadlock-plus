use serde::{Deserialize, Serialize};

pub const FETCH_QUOTA_LIMIT: usize = 40;
pub const FETCH_QUOTA_WINDOW_SECS: i64 = 24 * 60 * 60;
/// `GetMatchHistory` has its own per-account Steam limit. Friend lookups stay well below it so
/// a manual own-history recovery still has headroom.
pub const FRIEND_HISTORY_QUOTA_LIMIT: usize = 20;

pub type SaltQuota = QuotaWindow<FETCH_QUOTA_LIMIT>;
pub type HistoryQuota = QuotaWindow<FRIEND_HISTORY_QUOTA_LIMIT>;

/// A rolling 24 hour window capped at `LIMIT` requests.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct QuotaWindow<const LIMIT: usize> {
    hits: Vec<i64>,
}

impl<const LIMIT: usize> QuotaWindow<LIMIT> {
    pub fn from_hits(hits: Vec<i64>) -> Self {
        Self { hits }
    }

    pub fn remaining(&self, now: i64) -> usize {
        let cutoff = now - FETCH_QUOTA_WINDOW_SECS;
        let used = self.hits.iter().filter(|&&t| t > cutoff).count();
        LIMIT.saturating_sub(used)
    }

    /// Records `now` and returns true, or returns false when the window is full.
    pub fn try_consume(&mut self, now: i64) -> bool {
        let cutoff = now - FETCH_QUOTA_WINDOW_SECS;
        self.hits.retain(|&t| t > cutoff);
        if self.hits.len() >= LIMIT {
            return false;
        }
        self.hits.push(now);
        true
    }

    pub fn hits(&self) -> &[i64] {
        &self.hits
    }

    /// For when Steam itself rate-limits the account: the window counts as full from `now`.
    pub fn exhaust(&mut self, now: i64) {
        self.hits = vec![now; LIMIT];
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const START: i64 = 1_000_000;

    #[test]
    fn allows_up_to_the_limit_then_blocks() {
        let mut q = SaltQuota::default();
        for _ in 0..FETCH_QUOTA_LIMIT {
            assert!(q.try_consume(START));
        }
        assert_eq!(q.remaining(START), 0);
        assert!(!q.try_consume(START));
    }

    #[test]
    fn frees_capacity_as_hits_age_out() {
        let mut q = SaltQuota::default();
        for _ in 0..FETCH_QUOTA_LIMIT {
            q.try_consume(START);
        }
        assert!(!q.try_consume(START + FETCH_QUOTA_WINDOW_SECS - 1));
        let later = START + FETCH_QUOTA_WINDOW_SECS + 1;
        assert_eq!(q.remaining(later), FETCH_QUOTA_LIMIT);
        assert!(q.try_consume(later));
    }

    #[test]
    fn exhaust_blocks_for_a_full_window_from_now() {
        let mut q = SaltQuota::default();
        q.try_consume(START);
        q.exhaust(START);
        assert_eq!(q.hits().len(), FETCH_QUOTA_LIMIT);
        assert_eq!(q.remaining(START + FETCH_QUOTA_WINDOW_SECS - 1), 0);
        assert_eq!(q.remaining(START + FETCH_QUOTA_WINDOW_SECS + 1), FETCH_QUOTA_LIMIT);
    }

    #[test]
    fn exhaust_ignores_older_hits_about_to_expire() {
        let mut q = SaltQuota::default();
        q.try_consume(START);
        let now = START + FETCH_QUOTA_WINDOW_SECS - 10;
        q.exhaust(now);
        assert_eq!(q.remaining(START + FETCH_QUOTA_WINDOW_SECS + 1), 0);
        assert_eq!(q.remaining(now + FETCH_QUOTA_WINDOW_SECS + 1), FETCH_QUOTA_LIMIT);
    }

    #[test]
    fn history_quota_has_its_own_limit() {
        let mut q = HistoryQuota::default();
        for _ in 0..FRIEND_HISTORY_QUOTA_LIMIT {
            assert!(q.try_consume(START));
        }
        assert!(!q.try_consume(START));
        q.exhaust(START);
        assert_eq!(q.hits().len(), FRIEND_HISTORY_QUOTA_LIMIT);
    }

    #[test]
    fn stored_hits_keep_their_shape() {
        assert_eq!(serde_json::to_string(&SaltQuota::from_hits(vec![5])).unwrap(), r#"{"hits":[5]}"#);
    }
}
