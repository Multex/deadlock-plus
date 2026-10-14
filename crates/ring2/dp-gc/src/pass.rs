use std::collections::HashSet;
use std::future::Future;

use serde::{Deserialize, Serialize};

use crate::client::{GcSession, RecoveredSalts};
use crate::error::GcError;
use crate::ledger::{FriendCooldowns, SaltAttempts};
use crate::quota::{HistoryQuota, SaltQuota};

/// How long an account whose GC handshake failed is left alone.
pub const GC_BACKOFF_SECS: i64 = 24 * 60 * 60;
/// Friend history lookups per account per pass, so one pass does not spend the day's budget.
pub const MAX_FRIEND_HISTORIES_PER_PASS: usize = 5;
/// After a friend's history was looked up, by any account, they are left alone for a while.
pub const FRIEND_COOLDOWN_SECS: i64 = 6 * 60 * 60;
/// A private history will not become public soon.
pub const PRIVATE_FRIEND_COOLDOWN_SECS: i64 = 7 * 24 * 60 * 60;

/// Persisted per-account state. Keeps the quotas across restarts.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AccountState {
    #[serde(default)]
    pub quota: SaltQuota,
    #[serde(default)]
    pub history_quota: HistoryQuota,
    #[serde(default)]
    pub backoff_until: Option<i64>,
}

impl AccountState {
    pub fn backed_off(&self, now: i64) -> bool {
        self.backoff_until.is_some_and(|until| now < until)
    }

    /// Friend history lookups this account may still make this pass. Each one only pays off with
    /// a salt fetch after it, so the salt quota caps it too.
    pub fn history_budget(&self, now: i64) -> usize {
        self.history_quota.remaining(now).min(MAX_FRIEND_HISTORIES_PER_PASS).min(self.quota.remaining(now))
    }
}

pub trait SaltFetcher {
    fn fetch_match_salts(&self, match_id: u64) -> impl Future<Output = Result<RecoveredSalts, GcError>>;
}

impl SaltFetcher for GcSession {
    fn fetch_match_salts(&self, match_id: u64) -> impl Future<Output = Result<RecoveredSalts, GcError>> {
        GcSession::fetch_match_salts(self, match_id)
    }
}

pub trait HistoryFetcher {
    fn fetch_recent_matches(&self, account_id: u32) -> impl Future<Output = Result<Vec<u64>, GcError>>;
}

impl HistoryFetcher for GcSession {
    fn fetch_recent_matches(&self, account_id: u32) -> impl Future<Output = Result<Vec<u64>, GcError>> {
        GcSession::fetch_recent_matches(self, account_id)
    }
}

/// What the caller supplies around the fetch loops: pacing, the stop condition and delivery.
pub trait Host {
    /// Waits out the request spacing. Returns false when the pass must stop, for example because
    /// Deadlock started.
    fn before_request(&mut self) -> impl Future<Output = bool>;
    /// Hands over recovered salts. Returns whether they were accepted.
    fn deliver(&mut self, salts: RecoveredSalts) -> impl Future<Output = bool>;
    fn now(&self) -> i64;
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Outcome {
    pub delivered: u32,
    pub rate_limited: bool,
}

/// Fetches `picks` in order until they run out, the quota is spent, Steam rate-limits the
/// account or the host asks to stop. Skips matches already processed this pass or given up on.
pub async fn fetch_loop(
    fetcher: &impl SaltFetcher,
    host: &mut impl Host,
    picks: Vec<u64>,
    state: &mut AccountState,
    processed: &mut HashSet<u64>,
    attempts: &mut SaltAttempts,
) -> Outcome {
    let mut out = Outcome::default();
    for match_id in picks {
        if processed.contains(&match_id) || attempts.given_up(match_id) {
            continue;
        }
        if state.quota.remaining(host.now()) == 0 || !host.before_request().await {
            break;
        }
        let salts = match fetcher.fetch_match_salts(match_id).await {
            Ok(salts) => salts,
            // Left unmarked so another account can still fetch it.
            Err(GcError::GcRateLimited) => {
                state.quota.exhaust(host.now());
                out.rate_limited = true;
                break;
            }
            Err(e) => {
                log::warn!("gc: salt fetch failed for {match_id}: {e}");
                processed.insert(match_id);
                attempts.record(match_id);
                continue;
            }
        };
        processed.insert(match_id);
        state.quota.try_consume(host.now());
        if host.deliver(salts).await {
            attempts.record(match_id);
            out.delivered += 1;
        }
    }
    out
}

/// Looks up the newest history page of each `(friend, newest stored match)` pick and returns the
/// match ids newer than what deadlock-api has stored. Every request costs history quota, whatever
/// Steam answers. Stops at a rate limit or when the host asks to.
pub async fn history_loop(
    fetcher: &impl HistoryFetcher,
    host: &mut impl Host,
    picks: Vec<(u32, u64)>,
    state: &mut AccountState,
    cooldowns: &mut FriendCooldowns,
) -> Vec<u64> {
    let mut found = Vec::new();
    for (friend, latest_stored) in picks {
        if state.history_quota.remaining(host.now()) == 0 || !host.before_request().await {
            break;
        }
        let cooldown = match fetcher.fetch_recent_matches(friend).await {
            Ok(history) => {
                state.history_quota.try_consume(host.now());
                found.extend(history.into_iter().filter(|&id| id > latest_stored));
                FRIEND_COOLDOWN_SECS
            }
            Err(GcError::GcRateLimited) => {
                state.history_quota.exhaust(host.now());
                break;
            }
            Err(GcError::HistoryPrivate) => {
                state.history_quota.try_consume(host.now());
                PRIVATE_FRIEND_COOLDOWN_SECS
            }
            Err(e) => {
                log::warn!("gc: match history for friend {friend} failed: {e}");
                state.history_quota.try_consume(host.now());
                FRIEND_COOLDOWN_SECS
            }
        };
        let now = host.now();
        cooldowns.set(friend, now + cooldown, now);
    }
    found
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct FullOutcome {
    pub delivered: u32,
    pub failed: u32,
    pub rate_limited: bool,
    pub stopped: bool,
}

/// Fetches every id in `ids` with no quota, for a run the user started. Ends early at a rate
/// limit or when the host asks to stop. `done` collects what was fetched across accounts.
pub async fn fetch_all(
    fetcher: &impl SaltFetcher,
    host: &mut impl Host,
    ids: &[u64],
    attempts: &mut SaltAttempts,
    done: &mut HashSet<u64>,
) -> FullOutcome {
    let mut out = FullOutcome::default();
    for &match_id in ids {
        if done.contains(&match_id) {
            continue;
        }
        if !host.before_request().await {
            out.stopped = true;
            break;
        }
        let salts = match fetcher.fetch_match_salts(match_id).await {
            Ok(salts) => salts,
            Err(GcError::GcRateLimited) => {
                out.rate_limited = true;
                break;
            }
            Err(e) => {
                log::warn!("gc: salt fetch failed for {match_id}: {e}");
                attempts.record(match_id);
                out.failed += 1;
                continue;
            }
        };
        done.insert(match_id);
        if host.deliver(salts).await {
            attempts.record(match_id);
            out.delivered += 1;
        } else {
            out.failed += 1;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ledger::MAX_SALT_ATTEMPTS;
    use crate::quota::{FETCH_QUOTA_LIMIT, FRIEND_HISTORY_QUOTA_LIMIT};
    use std::cell::RefCell;
    use std::collections::HashMap;

    const NOW: i64 = 1_000_000;

    struct Fake(RefCell<HashMap<u64, Result<RecoveredSalts, GcError>>>);

    impl Fake {
        fn new(entries: Vec<(u64, Result<RecoveredSalts, GcError>)>) -> Self {
            Self(RefCell::new(entries.into_iter().collect()))
        }
    }

    impl SaltFetcher for Fake {
        async fn fetch_match_salts(&self, match_id: u64) -> Result<RecoveredSalts, GcError> {
            self.0.borrow_mut().remove(&match_id).expect("unexpected fetch")
        }
    }

    struct FakeHistory(RefCell<HashMap<u32, Result<Vec<u64>, GcError>>>);

    impl FakeHistory {
        fn new(entries: Vec<(u32, Result<Vec<u64>, GcError>)>) -> Self {
            Self(RefCell::new(entries.into_iter().collect()))
        }
    }

    impl HistoryFetcher for FakeHistory {
        async fn fetch_recent_matches(&self, account_id: u32) -> Result<Vec<u64>, GcError> {
            self.0.borrow_mut().remove(&account_id).expect("unexpected lookup")
        }
    }

    struct TestHost {
        allow_requests: usize,
        accept: bool,
        delivered: Vec<u64>,
    }

    impl TestHost {
        fn new() -> Self {
            Self { allow_requests: usize::MAX, accept: true, delivered: Vec::new() }
        }
    }

    impl Host for TestHost {
        async fn before_request(&mut self) -> bool {
            if self.allow_requests == 0 {
                return false;
            }
            self.allow_requests -= 1;
            true
        }
        async fn deliver(&mut self, salts: RecoveredSalts) -> bool {
            self.delivered.push(salts.match_id);
            self.accept
        }
        fn now(&self) -> i64 {
            NOW
        }
    }

    fn salts(id: u64) -> RecoveredSalts {
        RecoveredSalts { match_id: id, cluster_id: Some(1), metadata_salt: Some(2), replay_salt: None, account_id: 7 }
    }

    fn block_on<T>(fut: impl Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread().build().unwrap().block_on(fut)
    }

    #[derive(Default)]
    struct Ctx {
        state: AccountState,
        processed: HashSet<u64>,
        attempts: SaltAttempts,
    }

    fn run(fetcher: &Fake, host: &mut TestHost, picks: Vec<u64>, ctx: &mut Ctx) -> Outcome {
        block_on(fetch_loop(fetcher, host, picks, &mut ctx.state, &mut ctx.processed, &mut ctx.attempts))
    }

    #[test]
    fn success_delivers_consumes_quota_and_marks_processed() {
        let fetcher = Fake::new(vec![(9, Ok(salts(9)))]);
        let (mut host, mut ctx) = (TestHost::new(), Ctx::default());
        let out = run(&fetcher, &mut host, vec![9], &mut ctx);
        assert_eq!(out, Outcome { delivered: 1, rate_limited: false });
        assert_eq!(host.delivered, vec![9]);
        assert_eq!(ctx.state.quota.remaining(NOW), FETCH_QUOTA_LIMIT - 1);
        assert!(ctx.processed.contains(&9));
    }

    #[test]
    fn rate_limit_exhausts_quota_and_leaves_the_id_for_other_accounts() {
        let fetcher = Fake::new(vec![(9, Err(GcError::GcRateLimited))]);
        let (mut host, mut ctx) = (TestHost::new(), Ctx::default());
        let out = run(&fetcher, &mut host, vec![9, 8], &mut ctx);
        assert!(out.rate_limited);
        assert_eq!(ctx.state.quota.remaining(NOW), 0);
        assert!(!ctx.processed.contains(&9));
        assert!(host.delivered.is_empty());
        assert!(ctx.attempts == SaltAttempts::default());
    }

    #[test]
    fn other_failures_skip_the_id_without_spending_quota() {
        let fetcher = Fake::new(vec![(9, Err(GcError::GcUnavailable("x".into()))), (8, Ok(salts(8)))]);
        let (mut host, mut ctx) = (TestHost::new(), Ctx::default());
        let out = run(&fetcher, &mut host, vec![9, 8], &mut ctx);
        assert_eq!(out.delivered, 1);
        assert!(ctx.processed.contains(&9));
        assert_eq!(ctx.state.quota.remaining(NOW), FETCH_QUOTA_LIMIT - 1);
    }

    #[test]
    fn a_failure_does_not_take_the_place_of_a_later_pick() {
        let mut ctx = Ctx::default();
        for _ in 0..FETCH_QUOTA_LIMIT - 1 {
            ctx.state.quota.try_consume(NOW);
        }
        let fetcher = Fake::new(vec![(9, Err(GcError::GcUnavailable("x".into()))), (8, Ok(salts(8)))]);
        let mut host = TestHost::new();
        assert_eq!(run(&fetcher, &mut host, vec![9, 8], &mut ctx).delivered, 1);
    }

    #[test]
    fn host_stop_ends_the_loop_before_fetching() {
        let fetcher = Fake::new(vec![]);
        let mut host = TestHost { allow_requests: 0, ..TestHost::new() };
        let out = run(&fetcher, &mut host, vec![9], &mut Ctx::default());
        assert_eq!(out, Outcome::default());
    }

    #[test]
    fn a_rejected_delivery_still_costs_quota_but_is_not_counted() {
        let fetcher = Fake::new(vec![(9, Ok(salts(9)))]);
        let mut host = TestHost { accept: false, ..TestHost::new() };
        let mut ctx = Ctx::default();
        let out = run(&fetcher, &mut host, vec![9], &mut ctx);
        assert_eq!(out.delivered, 0);
        assert_eq!(ctx.state.quota.remaining(NOW), FETCH_QUOTA_LIMIT - 1);
        assert!(ctx.attempts == SaltAttempts::default());
    }

    #[test]
    fn accepted_salts_and_gc_failures_count_as_attempts() {
        let fetcher = Fake::new(vec![(9, Err(GcError::GcUnavailable("x".into()))), (8, Ok(salts(8)))]);
        let (mut host, mut ctx) = (TestHost::new(), Ctx::default());
        run(&fetcher, &mut host, vec![9, 8], &mut ctx);
        let mut expected = SaltAttempts::default();
        expected.record(9);
        expected.record(8);
        assert_eq!(ctx.attempts, expected);
    }

    #[test]
    fn given_up_matches_are_skipped_without_a_request() {
        let mut ctx = Ctx::default();
        for _ in 0..MAX_SALT_ATTEMPTS {
            ctx.attempts.record(9);
        }
        let fetcher = Fake::new(vec![(8, Ok(salts(8)))]);
        let mut host = TestHost { allow_requests: 1, ..TestHost::new() };
        assert_eq!(run(&fetcher, &mut host, vec![9, 8], &mut ctx).delivered, 1);
    }

    #[test]
    fn stops_when_the_quota_runs_out_mid_loop() {
        let mut ctx = Ctx::default();
        for _ in 0..FETCH_QUOTA_LIMIT - 1 {
            ctx.state.quota.try_consume(NOW);
        }
        let fetcher = Fake::new(vec![(9, Ok(salts(9))), (8, Ok(salts(8)))]);
        let mut host = TestHost::new();
        let out = run(&fetcher, &mut host, vec![9, 8], &mut ctx);
        assert_eq!(out.delivered, 1);
        assert!(!ctx.processed.contains(&8));
    }

    #[test]
    fn backoff_applies_until_its_deadline() {
        let state = AccountState { backoff_until: Some(NOW + 10), ..Default::default() };
        assert!(state.backed_off(NOW));
        assert!(!state.backed_off(NOW + 10));
        assert!(!AccountState::default().backed_off(NOW));
    }

    #[test]
    fn history_budget_is_capped_per_pass_and_by_both_quotas() {
        let mut state = AccountState::default();
        assert_eq!(state.history_budget(NOW), MAX_FRIEND_HISTORIES_PER_PASS);
        for _ in 0..FRIEND_HISTORY_QUOTA_LIMIT - 2 {
            state.history_quota.try_consume(NOW);
        }
        assert_eq!(state.history_budget(NOW), 2);
        state.quota.exhaust(NOW);
        assert_eq!(state.history_budget(NOW), 0);
    }

    #[test]
    fn old_account_state_without_history_quota_still_loads() {
        let state: AccountState = serde_json::from_str(r#"{"quota":{"hits":[1,2]},"backoff_until":null}"#).unwrap();
        assert_eq!(state.quota.hits(), &[1, 2]);
        assert!(state.history_quota.hits().is_empty());
    }

    fn history(
        fetcher: &FakeHistory,
        host: &mut TestHost,
        picks: Vec<(u32, u64)>,
        state: &mut AccountState,
        cooldowns: &mut FriendCooldowns,
    ) -> Vec<u64> {
        block_on(history_loop(fetcher, host, picks, state, cooldowns))
    }

    #[test]
    fn history_lookup_keeps_matches_newer_than_the_stored_one() {
        let fetcher = FakeHistory::new(vec![(1, Ok(vec![12, 11, 10, 9])), (2, Err(GcError::HistoryPrivate))]);
        let (mut host, mut state, mut cooldowns) =
            (TestHost::new(), AccountState::default(), FriendCooldowns::default());
        let found = history(&fetcher, &mut host, vec![(1, 10), (2, 5)], &mut state, &mut cooldowns);
        assert_eq!(found, vec![12, 11]);
        assert_eq!(state.history_quota.remaining(NOW), FRIEND_HISTORY_QUOTA_LIMIT - 2);
        assert!(!cooldowns.is_due(1, NOW + FRIEND_COOLDOWN_SECS - 1));
        assert!(cooldowns.is_due(1, NOW + FRIEND_COOLDOWN_SECS));
        assert!(!cooldowns.is_due(2, NOW + PRIVATE_FRIEND_COOLDOWN_SECS - 1));
    }

    #[test]
    fn history_rate_limit_exhausts_and_stops() {
        let fetcher = FakeHistory::new(vec![(1, Err(GcError::GcRateLimited))]);
        let (mut host, mut state, mut cooldowns) =
            (TestHost::new(), AccountState::default(), FriendCooldowns::default());
        let found = history(&fetcher, &mut host, vec![(1, 0), (2, 0)], &mut state, &mut cooldowns);
        assert!(found.is_empty());
        assert_eq!(state.history_quota.remaining(NOW), 0);
        assert!(cooldowns.is_due(1, NOW));
    }

    #[test]
    fn history_lookup_stops_when_the_host_does() {
        let fetcher = FakeHistory::new(vec![]);
        let mut host = TestHost { allow_requests: 0, ..TestHost::new() };
        let (mut state, mut cooldowns) = (AccountState::default(), FriendCooldowns::default());
        assert!(history(&fetcher, &mut host, vec![(1, 0)], &mut state, &mut cooldowns).is_empty());
        assert_eq!(state.history_quota.remaining(NOW), FRIEND_HISTORY_QUOTA_LIMIT);
    }

    #[test]
    fn full_run_ignores_the_quota_and_counts_failures() {
        let fetcher =
            Fake::new(vec![(9, Ok(salts(9))), (8, Err(GcError::GcUnavailable("x".into()))), (7, Ok(salts(7)))]);
        let mut host = TestHost::new();
        let (mut attempts, mut done) = (SaltAttempts::default(), HashSet::from([6]));
        let out = block_on(fetch_all(&fetcher, &mut host, &[9, 8, 7, 6], &mut attempts, &mut done));
        assert_eq!(out, FullOutcome { delivered: 2, failed: 1, rate_limited: false, stopped: false });
        assert_eq!(done, HashSet::from([9, 7, 6]));
    }

    #[test]
    fn full_run_ends_at_a_rate_limit() {
        let fetcher = Fake::new(vec![(9, Err(GcError::GcRateLimited))]);
        let mut host = TestHost::new();
        let (mut attempts, mut done) = (SaltAttempts::default(), HashSet::new());
        let out = block_on(fetch_all(&fetcher, &mut host, &[9, 8], &mut attempts, &mut done));
        assert!(out.rate_limited);
        assert_eq!(out.delivered + out.failed, 0);
    }

    #[test]
    fn full_run_counts_a_rejected_post_as_failed_without_an_attempt() {
        let fetcher = Fake::new(vec![(9, Ok(salts(9)))]);
        let mut host = TestHost { accept: false, ..TestHost::new() };
        let (mut attempts, mut done) = (SaltAttempts::default(), HashSet::new());
        let out = block_on(fetch_all(&fetcher, &mut host, &[9], &mut attempts, &mut done));
        assert_eq!(out.failed, 1);
        assert_eq!(attempts, SaltAttempts::default());
    }

    #[test]
    fn full_run_reports_a_stop() {
        let fetcher = Fake::new(vec![]);
        let mut host = TestHost { allow_requests: 0, ..TestHost::new() };
        let out = block_on(fetch_all(&fetcher, &mut host, &[9], &mut SaltAttempts::default(), &mut HashSet::new()));
        assert!(out.stopped);
    }
}
