use std::collections::HashSet;
use std::future::Future;

use serde::{Deserialize, Serialize};

use crate::client::{GcSession, RecoveredSalts};
use crate::error::GcError;
use crate::ledger::{FriendCooldowns, SaltAttempts};
use crate::quota::{HistoryQuota, SaltQuota};

/// How long an account whose GC handshake failed is left alone.
pub const GC_BACKOFF_SECS: i64 = 24 * 60 * 60;
/// How long an account is left alone after it stepped aside for the user's own Steam client. Long
/// enough to skip the next pass (30 minutes apart), so a user who just pressed Play is not met by
/// a claim straight after.
pub const YIELD_BACKOFF_SECS: i64 = 60 * 60;
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

    pub fn yield_to_user(&mut self, now: i64) {
        self.backoff_until = Some(now + YIELD_BACKOFF_SECS);
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

/// Ends what a session claimed on the account. See [`GcSession::release`].
pub trait Release {
    fn release(&self) -> impl Future<Output = ()>;
}

impl Release for GcSession {
    fn release(&self) -> impl Future<Output = ()> {
        GcSession::release(self)
    }
}

/// Runs `body` on `session`, then releases it, whichever way `body` returns. Taking the session
/// by value keeps it from being used after the release. Each request already releases its own
/// claim; this one covers a request whose future was dropped part way.
pub async fn with_release<S: Release, T>(session: S, body: impl AsyncFnOnce(&S) -> T) -> T {
    let out = body(&session).await;
    session.release().await;
    out
}

/// Reports the account as playing Deadlock for the length of one GC request.
pub trait Claim: Release {
    /// Claims the game and waits until the GC answers.
    fn claim(&self) -> impl Future<Output = Result<(), GcError>>;
}

impl Claim for GcSession {
    fn claim(&self) -> impl Future<Output = Result<(), GcError>> {
        GcSession::claim(self)
    }
}

/// Claims the game, runs `job` and releases, whichever way either returns. A failed claim is
/// released too: the game may have been reported before the handshake failed.
pub async fn claimed<C: Claim, T>(session: &C, job: impl AsyncFnOnce() -> Result<T, GcError>) -> Result<T, GcError> {
    let out = match session.claim().await {
        Ok(()) => job().await,
        Err(e) => Err(e),
    };
    session.release().await;
    out
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
            // Neither reached the GC, so they cost nothing and the match stays open for later.
            Err(e @ (GcError::Yielded | GcError::ClaimFailed(_))) => {
                log::info!("gc: salt fetches stopped: {e}");
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
            Err(e @ (GcError::Yielded | GcError::ClaimFailed(_))) => {
                log::info!("gc: friend history lookups stopped: {e}");
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
            Err(GcError::Yielded) => {
                out.stopped = true;
                break;
            }
            Err(e @ GcError::ClaimFailed(_)) => {
                log::warn!("gc: salt fetches stopped: {e}");
                out.failed += 1;
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
    use std::cell::{Cell, RefCell};
    use std::collections::HashMap;
    use std::rc::Rc;

    const NOW: i64 = 1_000_000;

    /// What a fake session has claimed on the account. Shared with the host so it can check that
    /// nothing is held while it waits.
    #[derive(Default)]
    struct Claims {
        held: Cell<bool>,
        claims: Cell<u32>,
        releases: Cell<u32>,
        refuse: RefCell<Option<GcError>>,
    }

    impl Claims {
        /// A failed claim still counts as held: the real one may have reported the game before the
        /// handshake failed.
        fn claim(&self) -> Result<(), GcError> {
            assert!(!self.held.get(), "claims overlap");
            self.held.set(true);
            self.claims.set(self.claims.get() + 1);
            match self.refuse.borrow().clone() {
                Some(e) => Err(e),
                None => Ok(()),
            }
        }

        fn release(&self) {
            self.held.set(false);
            self.releases.set(self.releases.get() + 1);
        }
    }

    struct Fake {
        replies: RefCell<HashMap<u64, Result<RecoveredSalts, GcError>>>,
        claims: Rc<Claims>,
    }

    impl Fake {
        fn new(entries: Vec<(u64, Result<RecoveredSalts, GcError>)>) -> Self {
            Self { replies: RefCell::new(entries.into_iter().collect()), claims: Rc::default() }
        }
    }

    impl SaltFetcher for Fake {
        async fn fetch_match_salts(&self, match_id: u64) -> Result<RecoveredSalts, GcError> {
            claimed(self, async || {
                assert!(self.claims.held.get(), "fetch without a claim");
                self.replies.borrow_mut().remove(&match_id).expect("unexpected fetch")
            })
            .await
        }
    }

    impl Claim for Fake {
        async fn claim(&self) -> Result<(), GcError> {
            self.claims.claim()
        }
    }

    impl Release for Fake {
        async fn release(&self) {
            self.claims.release();
        }
    }

    struct FakeHistory {
        replies: RefCell<HashMap<u32, Result<Vec<u64>, GcError>>>,
        claims: Rc<Claims>,
    }

    impl FakeHistory {
        fn new(entries: Vec<(u32, Result<Vec<u64>, GcError>)>) -> Self {
            Self { replies: RefCell::new(entries.into_iter().collect()), claims: Rc::default() }
        }
    }

    impl HistoryFetcher for FakeHistory {
        async fn fetch_recent_matches(&self, account_id: u32) -> Result<Vec<u64>, GcError> {
            claimed(self, async || {
                assert!(self.claims.held.get(), "lookup without a claim");
                self.replies.borrow_mut().remove(&account_id).expect("unexpected lookup")
            })
            .await
        }
    }

    impl Claim for FakeHistory {
        async fn claim(&self) -> Result<(), GcError> {
            self.claims.claim()
        }
    }

    impl Release for FakeHistory {
        async fn release(&self) {
            self.claims.release();
        }
    }

    struct TestHost {
        allow_requests: usize,
        accept: bool,
        delivered: Vec<u64>,
        claims: Rc<Claims>,
    }

    impl TestHost {
        fn new() -> Self {
            Self { allow_requests: usize::MAX, accept: true, delivered: Vec::new(), claims: Rc::default() }
        }

        fn watching(claims: &Rc<Claims>) -> Self {
            Self { claims: claims.clone(), ..Self::new() }
        }
    }

    impl Host for TestHost {
        async fn before_request(&mut self) -> bool {
            assert!(!self.claims.held.get(), "claimed while waiting");
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

    #[test]
    fn release_follows_the_body_whatever_it_returns() {
        let fake = Fake::new(vec![]);
        let claims = fake.claims.clone();
        let out = block_on(with_release(fake, async |_| Err::<(), _>(GcError::GcRateLimited)));
        assert_eq!(out, Err(GcError::GcRateLimited));
        assert_eq!(claims.releases.get(), 1);
    }

    fn stopped() -> TestHost {
        TestHost { allow_requests: 0, ..TestHost::new() }
    }

    #[test]
    fn release_runs_after_every_way_a_fetch_loop_ends() {
        let mut spent = Ctx::default();
        spent.state.quota.exhaust(NOW);
        let cases: Vec<(&str, Fake, TestHost, Ctx)> = vec![
            ("all fetched", Fake::new(vec![(9, Ok(salts(9))), (8, Ok(salts(8)))]), TestHost::new(), Ctx::default()),
            ("rate limited", Fake::new(vec![(9, Err(GcError::GcRateLimited))]), TestHost::new(), Ctx::default()),
            ("host stopped", Fake::new(vec![]), stopped(), Ctx::default()),
            ("quota spent", Fake::new(vec![]), TestHost::new(), spent),
        ];
        for (name, fetcher, host, mut ctx) in cases {
            let claims = fetcher.claims.clone();
            let mut host = TestHost { claims: claims.clone(), ..host };
            let in_body = block_on(with_release(fetcher, async |f| {
                fetch_loop(f, &mut host, vec![9, 8], &mut ctx.state, &mut ctx.processed, &mut ctx.attempts).await;
                claims.releases.get()
            }));
            assert_eq!(claims.releases.get(), in_body + 1, "{name}");
            assert!(!claims.held.get(), "{name}");
        }
    }

    #[test]
    fn release_runs_after_every_way_a_full_run_ends() {
        let cases: Vec<(&str, Fake, TestHost)> = vec![
            ("all fetched", Fake::new(vec![(9, Ok(salts(9))), (8, Ok(salts(8)))]), TestHost::new()),
            ("rate limited", Fake::new(vec![(9, Err(GcError::GcRateLimited))]), TestHost::new()),
            ("cancelled", Fake::new(vec![]), stopped()),
        ];
        for (name, fetcher, host) in cases {
            let claims = fetcher.claims.clone();
            let mut host = TestHost { claims: claims.clone(), ..host };
            let in_body = block_on(with_release(fetcher, async |f| {
                fetch_all(f, &mut host, &[9, 8], &mut SaltAttempts::default(), &mut HashSet::new()).await;
                claims.releases.get()
            }));
            assert_eq!(claims.releases.get(), in_body + 1, "{name}");
            assert!(!claims.held.get(), "{name}");
        }
    }

    #[test]
    fn release_runs_after_every_way_a_history_loop_ends() {
        let cases: Vec<(&str, FakeHistory, TestHost)> = vec![
            ("all looked up", FakeHistory::new(vec![(1, Ok(vec![12])), (2, Ok(vec![13]))]), TestHost::new()),
            ("rate limited", FakeHistory::new(vec![(1, Err(GcError::GcRateLimited))]), TestHost::new()),
            ("host stopped", FakeHistory::new(vec![]), stopped()),
        ];
        for (name, fetcher, host) in cases {
            let claims = fetcher.claims.clone();
            let mut host = TestHost { claims: claims.clone(), ..host };
            let (mut state, mut cooldowns) = (AccountState::default(), FriendCooldowns::default());
            let in_body = block_on(with_release(fetcher, async |f| {
                history_loop(f, &mut host, vec![(1, 0), (2, 0)], &mut state, &mut cooldowns).await;
                claims.releases.get()
            }));
            assert_eq!(claims.releases.get(), in_body + 1, "{name}");
            assert!(!claims.held.get(), "{name}");
        }
    }

    #[test]
    fn a_claim_is_released_whatever_the_job_returns() {
        let fake = Fake::new(vec![]);
        let out = block_on(claimed(&fake, async || Err::<(), _>(GcError::HistoryPrivate)));
        assert_eq!(out, Err(GcError::HistoryPrivate));
        assert_eq!((fake.claims.claims.get(), fake.claims.releases.get()), (1, 1));
        assert!(!fake.claims.held.get());
    }

    #[test]
    fn a_failed_claim_is_released_and_skips_the_job() {
        let fake = Fake::new(vec![]);
        *fake.claims.refuse.borrow_mut() = Some(no_welcome());
        let out = block_on(claimed(&fake, async || -> Result<(), GcError> { panic!("job ran without a claim") }));
        assert_eq!(out, Err(no_welcome()));
        assert!(!fake.claims.held.get());
        assert_eq!(fake.claims.releases.get(), 1);
    }

    #[test]
    fn each_salt_fetch_is_its_own_claim() {
        let fetcher =
            Fake::new(vec![(9, Ok(salts(9))), (8, Err(GcError::GcUnavailable("x".into()))), (7, Ok(salts(7)))]);
        let mut host = TestHost::watching(&fetcher.claims);
        let mut ctx = Ctx::default();
        block_on(fetch_loop(&fetcher, &mut host, vec![9, 8, 7], &mut ctx.state, &mut ctx.processed, &mut ctx.attempts));
        assert_eq!((fetcher.claims.claims.get(), fetcher.claims.releases.get()), (3, 3));
        assert!(!fetcher.claims.held.get());
    }

    #[test]
    fn each_history_lookup_is_its_own_claim() {
        let fetcher = FakeHistory::new(vec![(1, Ok(vec![12])), (2, Err(GcError::HistoryPrivate))]);
        let mut host = TestHost::watching(&fetcher.claims);
        let (mut state, mut cooldowns) = (AccountState::default(), FriendCooldowns::default());
        block_on(history_loop(&fetcher, &mut host, vec![(1, 0), (2, 0)], &mut state, &mut cooldowns));
        assert_eq!((fetcher.claims.claims.get(), fetcher.claims.releases.get()), (2, 2));
    }

    fn no_welcome() -> GcError {
        GcError::ClaimFailed("no welcome".into())
    }

    #[test]
    fn a_yield_during_the_claim_is_released_and_skips_the_job() {
        let fake = Fake::new(vec![]);
        *fake.claims.refuse.borrow_mut() = Some(GcError::Yielded);
        let out = block_on(claimed(&fake, async || -> Result<(), GcError> { panic!("job ran without a claim") }));
        assert_eq!(out, Err(GcError::Yielded));
        assert!(!fake.claims.held.get());
    }

    #[test]
    fn a_yield_mid_job_is_released() {
        let fake = Fake::new(vec![]);
        let out = block_on(claimed(&fake, async || Err::<(), _>(GcError::Yielded)));
        assert_eq!(out, Err(GcError::Yielded));
        assert_eq!((fake.claims.claims.get(), fake.claims.releases.get()), (1, 1));
        assert!(!fake.claims.held.get());
    }

    #[test]
    fn a_yield_ends_the_fetch_loop_at_no_cost() {
        let fetcher = Fake::new(vec![(9, Err(GcError::Yielded))]);
        let mut host = TestHost::watching(&fetcher.claims);
        let mut ctx = Ctx::default();
        let out = run(&fetcher, &mut host, vec![9, 8], &mut ctx);
        assert_eq!(out, Outcome::default());
        assert_eq!(ctx.state.quota.remaining(NOW), FETCH_QUOTA_LIMIT);
        assert!(ctx.processed.is_empty());
        assert_eq!(ctx.attempts, SaltAttempts::default());
        assert!(!fetcher.claims.held.get());
    }

    #[test]
    fn a_failed_claim_ends_the_fetch_loop_at_no_cost() {
        let fetcher = Fake::new(vec![]);
        *fetcher.claims.refuse.borrow_mut() = Some(no_welcome());
        let mut host = TestHost::watching(&fetcher.claims);
        let mut ctx = Ctx::default();
        let out = run(&fetcher, &mut host, vec![9, 8], &mut ctx);
        assert_eq!(out, Outcome::default());
        assert_eq!(fetcher.claims.claims.get(), 1);
        assert_eq!(ctx.state.quota.remaining(NOW), FETCH_QUOTA_LIMIT);
        assert!(ctx.processed.is_empty());
        assert_eq!(ctx.attempts, SaltAttempts::default());
    }

    #[test]
    fn a_yield_or_failed_claim_ends_the_history_loop_at_no_cost() {
        let yielded = FakeHistory::new(vec![(1, Err(GcError::Yielded))]);
        let refused = FakeHistory::new(vec![]);
        *refused.claims.refuse.borrow_mut() = Some(no_welcome());
        for (name, fetcher) in [("yielded", yielded), ("claim failed", refused)] {
            let mut host = TestHost::watching(&fetcher.claims);
            let (mut state, mut cooldowns) = (AccountState::default(), FriendCooldowns::default());
            let found = history(&fetcher, &mut host, vec![(1, 0), (2, 0)], &mut state, &mut cooldowns);
            assert!(found.is_empty(), "{name}");
            assert_eq!(fetcher.claims.claims.get(), 1, "{name}");
            assert_eq!(state.history_quota.remaining(NOW), FRIEND_HISTORY_QUOTA_LIMIT, "{name}");
            assert!(cooldowns.is_due(1, NOW), "{name}");
        }
    }

    #[test]
    fn a_yield_stops_a_full_run_at_no_cost() {
        let fetcher = Fake::new(vec![(9, Err(GcError::Yielded))]);
        let mut host = TestHost::watching(&fetcher.claims);
        let (mut attempts, mut done) = (SaltAttempts::default(), HashSet::new());
        let out = block_on(fetch_all(&fetcher, &mut host, &[9, 8], &mut attempts, &mut done));
        assert_eq!(out, FullOutcome { stopped: true, ..Default::default() });
        assert_eq!(attempts, SaltAttempts::default());
        assert!(done.is_empty());
    }

    #[test]
    fn a_failed_claim_ends_a_full_run_without_an_attempt() {
        let fetcher = Fake::new(vec![]);
        *fetcher.claims.refuse.borrow_mut() = Some(no_welcome());
        let mut host = TestHost::watching(&fetcher.claims);
        let (mut attempts, mut done) = (SaltAttempts::default(), HashSet::new());
        let out = block_on(fetch_all(&fetcher, &mut host, &[9, 8], &mut attempts, &mut done));
        assert_eq!(out, FullOutcome { failed: 1, ..Default::default() });
        assert_eq!(fetcher.claims.claims.get(), 1);
        assert_eq!(attempts, SaltAttempts::default());
        assert!(!fetcher.claims.held.get());
    }

    #[test]
    fn yielding_backs_off_briefly() {
        let mut state = AccountState::default();
        state.yield_to_user(NOW);
        assert!(state.backed_off(NOW + YIELD_BACKOFF_SECS - 1));
        assert!(!state.backed_off(NOW + YIELD_BACKOFF_SECS));
        const { assert!(YIELD_BACKOFF_SECS < GC_BACKOFF_SECS) };
    }
}
