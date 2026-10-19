use std::collections::{BTreeSet, HashSet};
use std::future::Future;
use std::sync::{Mutex, MutexGuard};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use ts_rs::TS;

use dp_gc::auth::AuthContext;
use dp_gc::client::{GcSession, HistoryMatch, RecoveredSalts};
use dp_gc::error::GcError as SteamGcError;
use dp_gc::ledger::SaltAttempts;
use dp_gc::pass::{with_release, Host, Release, SaltFetcher};
use dp_gc::quota::{SaltQuota, FETCH_QUOTA_LIMIT};
use dp_gc::recovery::{AccountUse, Attempt, RecoveryQueue, Step};
use dp_sync::LockExt;

use super::{
    api, block_on, load, local_coverage, save, steam_accounts, AppSink, GcHost, Shared, Sink, States, ACCOUNTS_KEY,
    ATTEMPTS_KEY, SALTS_URL,
};
use crate::features::error::AppError;
use crate::features::stop::StopSignal;

pub(super) const RUN_KEY: &str = "recovery_run";
pub(super) const LAST_RUN_KEY: &str = "last_run";

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum OwnRecoveryOutcome {
    Done,
    /// Some matches or accounts failed. Running it again retries them.
    Incomplete,
    /// Steam's limit was reached. The rest can be fetched another day.
    RateLimited,
    /// Cancelled, or Deadlock was started.
    Stopped,
    Failed,
}

/// Why a run that still has matches left is not fetching.
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(tag = "reason", rename_all = "snake_case")]
pub enum RecoveryWait {
    GameOpen,
    /// Every account has used its daily limit; `until` is when the first one has some again.
    DailyLimit {
        until: i64,
    },
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AccountProgress {
    pub account_id: u32,
    /// Matches this account sent in the last 24 hours.
    pub delivered: u32,
    /// Fetches this account spent of its daily limit in the last 24 hours.
    pub used_today: u32,
    pub rate_limited: bool,
}

impl From<AccountUse> for AccountProgress {
    fn from(u: AccountUse) -> Self {
        Self {
            account_id: u.account_id,
            delivered: u.delivered_today,
            used_today: u.used_today,
            rate_limited: u.rate_limited,
        }
    }
}

/// One kind of fetch a recovery run makes.
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryStep {
    Details,
    Replays,
}

impl From<Step> for RecoveryStep {
    fn from(step: Step) -> Self {
        match step {
            Step::Details => Self::Details,
            Step::Replays => Self::Replays,
        }
    }
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct StepProgress {
    pub step: RecoveryStep,
    pub done: u32,
    pub total: u32,
}

/// A run that recovers missing match details.
#[derive(Serialize, Clone, Default, Debug, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct OwnRecovery {
    pub running: bool,
    /// Stays set across restarts until resumed.
    pub paused: bool,
    pub waiting: Option<RecoveryWait>,
    /// Matches this run finished, sent or not.
    pub done: u32,
    /// Matches this run has taken on so far; it grows while account histories are read.
    pub total: u32,
    pub delivered: u32,
    pub failed: u32,
    /// Matches left, next first.
    pub queued: Vec<u64>,
    pub eta_secs: u64,
    pub accounts: Vec<AccountProgress>,
    pub outcome: Option<OwnRecoveryOutcome>,
    pub error: Option<AppError>,
    /// Each kind of fetch this run makes, in the order it runs them.
    pub steps: Vec<StepProgress>,
}

/// How the last run ended, kept across restarts.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct LastRun {
    pub ended_at: i64,
    pub delivered: u32,
    pub left: u32,
    pub outcome: OwnRecoveryOutcome,
}

/// Which of the asked match ids the Deadlock API has details for, and which have a replay.
#[derive(Serialize, Clone, Default, Debug, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct DetailCoverage {
    pub with_details: Vec<u64>,
    pub with_replay: Vec<u64>,
}

/// Steam hands out a match's replay until this long after it started.
const REPLAY_WINDOW_SECS: i64 = 21 * 24 * 60 * 60;

/// Matches in `history` with no details anywhere and that are not given up on.
fn missing_matches(history: &[u64], with_details: &HashSet<u64>, attempts: &SaltAttempts) -> Vec<u64> {
    history.iter().copied().filter(|id| !with_details.contains(id) && !attempts.given_up(*id)).collect()
}

/// Matches in `history` Steam still has a replay for that have details but no replay anywhere.
fn replay_gaps(history: &History, now: i64) -> Vec<u64> {
    history
        .matches
        .iter()
        .filter(|m| m.start_time.is_some_and(|start| i64::from(start) > now - REPLAY_WINDOW_SECS))
        .map(|m| m.match_id)
        .filter(|id| history.with_details.contains(id) && !history.with_replay.contains(id))
        .collect()
}

/// A run as kept across restarts.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub(super) struct SavedRun {
    queue: RecoveryQueue,
    /// Accounts whose own history this run already queued.
    histories_read: BTreeSet<u32>,
    /// Started and not ended yet. A run waiting for Steam's daily limit is still active.
    active: bool,
    /// Takes every saved account's own history after the ids it was given.
    with_history: bool,
}

/// Where a run's state outlives the app.
pub(super) trait RunStore {
    fn save_run(&mut self, run: &SavedRun);
    fn save_last_run(&mut self, last: LastRun);
}

/// One account's own match history and which of it has details and a replay.
#[derive(Debug, Default)]
pub(super) struct History {
    pub matches: Vec<HistoryMatch>,
    /// In the Deadlock API, loaded by Deadlock+ itself, or already shared.
    pub with_details: HashSet<u64>,
    /// In the Deadlock API or already shared.
    pub with_replay: HashSet<u64>,
}

impl History {
    fn ids(&self) -> Vec<u64> {
        self.matches.iter().map(|m| m.match_id).collect()
    }
}

/// Everything a drive reaches beyond the run itself: Steam, deadlock-api and saved state.
pub(super) trait RunEnv: Host + RunStore {
    type Session: SaltFetcher + Release;

    fn game_running(&self) -> bool;
    fn accounts(&mut self) -> Result<Vec<u32>, AppError>;
    fn connect(&mut self, account_id: u32) -> impl Future<Output = Result<Self::Session, SteamGcError>>;
    fn history(
        &mut self,
        session: &Self::Session,
        account_id: u32,
    ) -> impl Future<Output = Result<History, SteamGcError>>;
    /// The account's daily limit as the background pass keeps it.
    fn quota(&self, account_id: u32) -> SaltQuota;
    fn save_quota(&mut self, account_id: u32, quota: &SaltQuota);
    fn attempts(&self) -> SaltAttempts;
    fn save_attempts(&mut self, attempts: &SaltAttempts);
    fn report(&mut self, status: OwnRecovery);
}

/// Why a drive stopped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum RunEnd {
    Done,
    Cancelled,
    Paused,
    GameOpen,
    DailyLimit {
        until: i64,
    },
    /// Stopped from outside, for example the app closing. The run carries on at the next drive.
    Interrupted,
    /// No account could reach Steam.
    Unreachable,
    /// No Steam login to use.
    Failed,
}

#[derive(Default)]
struct RunInner {
    saved: SavedRun,
    driving: bool,
    /// Bumped when a run is cancelled or a new one starts, so a drive part way through a fetch
    /// does not count it towards the wrong run.
    epoch: u64,
    /// A run just started: its drive's end is recorded even if it fetched nothing.
    fresh: bool,
    accounts: Vec<u32>,
    waiting: Option<RecoveryWait>,
    outcome: Option<OwnRecoveryOutcome>,
    error: Option<AppError>,
}

impl RunInner {
    fn claim(&mut self) -> bool {
        if self.driving || !self.saved.active || self.saved.queue.is_paused() {
            return false;
        }
        self.driving = true;
        true
    }
}

/// The recovery run, shared by the thread that drives it and the commands that steer it.
#[derive(Default)]
pub(super) struct Run {
    inner: Mutex<RunInner>,
}

impl Run {
    pub(super) fn restore(saved: SavedRun) -> Self {
        Self { inner: Mutex::new(RunInner { saved, ..RunInner::default() }) }
    }

    fn lock(&self) -> MutexGuard<'_, RunInner> {
        self.inner.lock_or_recover()
    }

    /// Puts `ids` next and `replay_ids` after every details match, and unpauses, starting a run
    /// when none is going. `with_history` adds every saved account's own history after `ids`; a run
    /// that already takes it keeps it either way. Returns true when the caller must drive the run.
    pub(super) fn start(&self, ids: &[u64], replay_ids: &[u64], with_history: bool, store: &mut impl RunStore) -> bool {
        let mut inner = self.lock();
        let inner = &mut *inner;
        let saved = &mut inner.saved;
        if !saved.active {
            saved.queue.cancel();
            saved.histories_read.clear();
            saved.active = true;
            saved.with_history = with_history;
            saved.queue.enqueue_front(ids);
            inner.epoch += 1;
            inner.fresh = true;
        } else if saved.queue.is_done() {
            // On an empty queue the front is the back, and a front enqueue would reset the run.
            saved.queue.enqueue_back(ids);
        } else {
            saved.queue.enqueue_front(ids);
        }
        saved.queue.enqueue_replays(replay_ids);
        saved.with_history |= with_history;
        saved.queue.resume();
        inner.waiting = None;
        inner.outcome = None;
        inner.error = None;
        store.save_run(&inner.saved);
        inner.claim()
    }

    /// The drive stops before its next match.
    pub(super) fn pause(&self, store: &mut impl RunStore) {
        let mut inner = self.lock();
        inner.saved.queue.pause();
        store.save_run(&inner.saved);
    }

    /// Returns true when the caller must drive the run.
    pub(super) fn resume(&self, store: &mut impl RunStore) -> bool {
        let mut inner = self.lock();
        inner.saved.queue.resume();
        store.save_run(&inner.saved);
        inner.claim()
    }

    /// Ends the run and records it. A drive still going stops before its next match.
    pub(super) fn cancel(&self, store: &mut impl RunStore, now: i64) {
        let mut inner = self.lock();
        if inner.saved.active {
            let p = inner.saved.queue.progress();
            store.save_last_run(LastRun {
                ended_at: now,
                delivered: p.delivered,
                left: p.queued,
                outcome: OwnRecoveryOutcome::Stopped,
            });
            inner.outcome = Some(OwnRecoveryOutcome::Stopped);
        }
        inner.saved.queue.cancel();
        inner.saved.histories_read.clear();
        inner.saved.active = false;
        inner.epoch += 1;
        inner.waiting = None;
        store.save_run(&inner.saved);
    }

    /// For continuing a run on its own, after Deadlock closed or the daily limit reopened.
    /// Returns true when the caller must drive the run.
    pub(super) fn claim_driver(&self) -> bool {
        self.lock().claim()
    }

    /// Whether a drive must stop at its next request.
    pub(super) fn halted(&self) -> bool {
        let inner = self.lock();
        !inner.saved.active || inner.saved.queue.is_paused()
    }

    pub(super) fn status(&self, now: i64) -> OwnRecovery {
        let inner = self.lock();
        let queue = &inner.saved.queue;
        let p = queue.progress();
        let accounts = queue
            .account_use(now)
            .into_iter()
            .filter(|u| inner.accounts.is_empty() || inner.accounts.contains(&u.account_id))
            .map(AccountProgress::from)
            .collect();
        OwnRecovery {
            running: inner.driving,
            paused: queue.is_paused(),
            waiting: inner.waiting,
            done: p.done,
            total: p.total,
            delivered: p.delivered,
            failed: p.failed,
            queued: queue.ids().collect(),
            eta_secs: p.eta_secs,
            accounts,
            outcome: inner.outcome,
            error: inner.error.clone(),
            steps: [Step::Details, Step::Replays]
                .into_iter()
                .map(|step| (step, queue.step_count(step)))
                .filter(|(_, count)| count.total > 0)
                .map(|(step, count)| StepProgress { step: step.into(), done: count.done, total: count.total })
                .collect(),
        }
    }

    /// The status with one card per saved account, run or not. `saved` carries each account's
    /// daily limit from the ledger, which the background pass may have spent since the run looked.
    /// With no saved accounts known, the run's own accounts stay.
    pub(super) fn status_for(&self, now: i64, saved: &[(u32, SaltQuota)]) -> OwnRecovery {
        let mut status = self.status(now);
        if saved.is_empty() {
            return status;
        }
        let run_use = self.lock().saved.queue.account_use(now);
        let mut accounts: Vec<AccountProgress> = saved
            .iter()
            .map(|(id, quota)| {
                let run = run_use.iter().find(|u| u.account_id == *id);
                AccountProgress {
                    account_id: *id,
                    delivered: run.map_or(0, |u| u.delivered_today),
                    used_today: u32::try_from(FETCH_QUOTA_LIMIT - quota.remaining(now)).unwrap_or(u32::MAX),
                    rate_limited: run.is_some_and(|u| u.rate_limited),
                }
            })
            .collect();
        accounts.sort_by_key(|a| a.account_id);
        status.accounts = accounts;
        status
    }

    fn report(&self, env: &mut impl RunEnv) {
        let status = self.status(env.now());
        env.report(status);
    }

    fn finish(&self, env: &mut impl RunEnv, end: RunEnd, drive: &Drive) {
        let now = env.now();
        let mut inner = self.lock();
        inner.driving = false;
        let p = inner.saved.queue.progress();
        let outcome = match end {
            RunEnd::Done if p.failed > 0 || !drive.skipped.is_empty() => Some(OwnRecoveryOutcome::Incomplete),
            RunEnd::Done => Some(OwnRecoveryOutcome::Done),
            RunEnd::Unreachable => Some(OwnRecoveryOutcome::Incomplete),
            RunEnd::Failed => Some(OwnRecoveryOutcome::Failed),
            RunEnd::DailyLimit { until } => {
                inner.waiting = Some(RecoveryWait::DailyLimit { until });
                None
            }
            RunEnd::GameOpen => {
                inner.waiting = Some(RecoveryWait::GameOpen);
                None
            }
            RunEnd::Paused | RunEnd::Interrupted | RunEnd::Cancelled => None,
        };
        let limit_reached = matches!(end, RunEnd::DailyLimit { .. }) && drive.worked;
        if let Some(outcome) = outcome {
            inner.outcome = Some(outcome);
            inner.saved.active = false;
        }
        if let Some(outcome) = outcome.or(limit_reached.then_some(OwnRecoveryOutcome::RateLimited)) {
            env.save_last_run(LastRun { ended_at: now, delivered: p.delivered, left: p.queued, outcome });
        }
        env.save_run(&inner.saved);
        drop(inner);
        self.report(env);
    }
}

enum Pick {
    Account(u32),
    End(RunEnd),
}

/// One drive's working state.
#[derive(Default)]
struct Drive {
    epoch: u64,
    accounts: Vec<u32>,
    /// Accounts that could not reach Steam this drive.
    skipped: HashSet<u32>,
    attempts: SaltAttempts,
    /// Fetched or read anything, or started the run.
    worked: bool,
}

/// Fetches the run's queue until it ends, pauses, waits or is stopped. The caller holds the
/// driver's slot (`start`, `resume` or `claim_driver` returned true); this hands it back.
pub(super) async fn drive(run: &Run, env: &mut impl RunEnv) -> RunEnd {
    let mut drive = Drive::default();
    let end = drive.steps(run, env).await;
    run.finish(env, end, &drive);
    end
}

impl Drive {
    async fn steps<E: RunEnv>(&mut self, run: &Run, env: &mut E) -> RunEnd {
        if env.game_running() {
            return RunEnd::GameOpen;
        }
        self.accounts = match env.accounts() {
            Ok(accounts) => accounts,
            Err(e) => {
                run.lock().error = Some(e);
                return RunEnd::Failed;
            }
        };
        self.attempts = env.attempts();
        {
            let mut inner = run.lock();
            self.epoch = inner.epoch;
            self.worked = std::mem::take(&mut inner.fresh);
            inner.accounts.clone_from(&self.accounts);
            inner.waiting = None;
            let queue = &mut inner.saved.queue;
            queue.track_accounts(&self.accounts);
            for &id in &self.accounts {
                queue.set_quota(id, env.quota(id));
            }
        }
        run.report(env);
        loop {
            let account = {
                let mut inner = run.lock();
                if let Some(end) = self.interrupted(&mut inner) {
                    return end;
                }
                match self.pick(&inner, env.now()) {
                    Pick::Account(id) => id,
                    Pick::End(end) => return end,
                }
            };
            let session = match env.connect(account).await {
                Ok(session) => session,
                Err(SteamGcError::Yielded) => return RunEnd::GameOpen,
                Err(e) => {
                    log::warn!("gc: account {account} cannot reach the GC: {e}");
                    self.skipped.insert(account);
                    continue;
                }
            };
            let end = with_release(session, async |session| self.on_account(run, env, session, account).await).await;
            env.save_attempts(&self.attempts);
            if let Some(end) = end {
                return end;
            }
        }
    }

    /// Checks for a cancel, a new run or a pause since the last look.
    fn interrupted(&mut self, inner: &mut RunInner) -> Option<RunEnd> {
        if inner.epoch != self.epoch {
            if !inner.saved.active {
                return Some(RunEnd::Cancelled);
            }
            self.epoch = inner.epoch;
            self.skipped.clear();
            self.worked |= std::mem::take(&mut inner.fresh);
        }
        inner.saved.queue.is_paused().then_some(RunEnd::Paused)
    }

    /// An account whose history the run still has to read. Its missing details go before any replay.
    fn unread_history(&self, saved: &SavedRun) -> Option<u32> {
        let unread = |id: &&u32| saved.with_history && !saved.histories_read.contains(id) && !self.skipped.contains(id);
        self.accounts.iter().find(unread).copied()
    }

    fn pick(&self, inner: &RunInner, now: i64) -> Pick {
        let saved = &inner.saved;
        let queue = &saved.queue;
        let unread = self.unread_history(saved);
        let details = queue.step_count(Step::Details);
        if details.done < details.total || (!queue.is_done() && unread.is_none()) {
            let usable: Vec<AccountUse> = queue
                .account_use(now)
                .into_iter()
                .filter(|u| self.accounts.contains(&u.account_id) && !self.skipped.contains(&u.account_id))
                .collect();
            if let Some(u) = usable.iter().find(|u| u.reopens_at.is_none()) {
                return Pick::Account(u.account_id);
            }
            return match usable.iter().filter_map(|u| u.reopens_at).min() {
                Some(until) => Pick::End(RunEnd::DailyLimit { until }),
                None => Pick::End(RunEnd::Unreachable),
            };
        }
        match unread {
            Some(id) => Pick::Account(id),
            None => Pick::End(RunEnd::Done),
        }
    }

    /// The next match `account` may fetch, or None when it has nothing left to do.
    fn next_match(&mut self, run: &Run, account: u32, now: i64) -> Result<Option<u64>, RunEnd> {
        let mut inner = run.lock();
        if let Some(end) = self.interrupted(&mut inner) {
            return Err(end);
        }
        let queue = &inner.saved.queue;
        if queue.quota(account).is_some_and(|q| q.remaining(now) == 0) {
            return Ok(None);
        }
        let next = queue.next_id();
        if next.is_some_and(|id| queue.step_of(id) == Some(Step::Replays))
            && self.unread_history(&inner.saved).is_some()
        {
            return Ok(None);
        }
        Ok(next)
    }

    async fn on_account<E: RunEnv>(
        &mut self,
        run: &Run,
        env: &mut E,
        session: &E::Session,
        account: u32,
    ) -> Option<RunEnd> {
        let unread = {
            let saved = &run.lock().saved;
            saved.with_history && !saved.histories_read.contains(&account)
        };
        if unread {
            if let Some(end) = self.read_history(run, env, session, account).await {
                return Some(end);
            }
        }
        loop {
            match self.next_match(run, account, env.now()) {
                Ok(Some(_)) => {}
                Ok(None) => return None,
                Err(end) => return Some(end),
            }
            if !env.before_request().await {
                return Some(self.halted(run, env));
            }
            // Ids started while the drive waited go first.
            let match_id = match self.next_match(run, account, env.now()) {
                Ok(Some(id)) => id,
                Ok(None) => return None,
                Err(end) => return Some(end),
            };
            self.worked = true;
            let result = session.fetch_match_salts(match_id).await;
            match result {
                Ok(salts) => self.deliver(run, env, salts).await,
                Err(SteamGcError::GcRateLimited) => {
                    log::warn!("gc: account {account} was rate-limited by Steam");
                    let now = env.now();
                    let mut inner = run.lock();
                    inner.saved.queue.rate_limited(account, now);
                    save_quota(&inner, env, account);
                    env.save_run(&inner.saved);
                    drop(inner);
                    run.report(env);
                    return None;
                }
                Err(SteamGcError::Yielded) => return Some(RunEnd::GameOpen),
                Err(e @ SteamGcError::ClaimFailed(_)) => {
                    log::warn!("gc: account {account} stopped fetching: {e}");
                    self.skipped.insert(account);
                    return None;
                }
                Err(e) => {
                    log::warn!("gc: salt fetch failed for {match_id}: {e}");
                    self.attempts.record(match_id);
                    let now = env.now();
                    self.record(run, env, match_id, account, Attempt::Failed, now);
                }
            }
            env.save_attempts(&self.attempts);
            run.report(env);
        }
    }

    async fn deliver(&mut self, run: &Run, env: &mut impl RunEnv, salts: RecoveredSalts) {
        let (match_id, account) = (salts.match_id, salts.account_id);
        let sent = env.deliver(salts).await;
        if sent {
            self.attempts.record(match_id);
        }
        let now = env.now();
        self.record(run, env, match_id, account, if sent { Attempt::Delivered } else { Attempt::NotSent }, now);
    }

    fn record(&self, run: &Run, env: &mut impl RunEnv, match_id: u64, account: u32, attempt: Attempt, now: i64) {
        let mut inner = run.lock();
        let spent = attempt != Attempt::Failed;
        if inner.epoch == self.epoch {
            inner.saved.queue.record(match_id, account, attempt, now);
        } else if spent {
            // The run this match belonged to is gone, but Steam still counted the fetch.
            let mut quota = inner.saved.queue.quota(account).cloned().unwrap_or_default();
            quota.try_consume(now);
            inner.saved.queue.set_quota(account, quota);
        }
        if spent {
            save_quota(&inner, env, account);
        }
        env.save_run(&inner.saved);
    }

    async fn read_history<E: RunEnv>(
        &mut self,
        run: &Run,
        env: &mut E,
        session: &E::Session,
        account: u32,
    ) -> Option<RunEnd> {
        self.worked = true;
        let (missing, replays) = match env.history(session, account).await {
            Ok(history) => {
                let gaps = replay_gaps(&history, env.now());
                // A match still short of its replay keeps its attempts, so one Steam never answers
                // with a replay is given up on like any other.
                let done: HashSet<u64> = history.with_details.iter().copied().filter(|id| !gaps.contains(id)).collect();
                self.attempts.forget(&done);
                let ids = history.ids();
                let missing = missing_matches(&ids, &history.with_details, &self.attempts);
                let replays: Vec<u64> = gaps.into_iter().filter(|id| !self.attempts.given_up(*id)).collect();
                log::info!(
                    "gc: account {account} has {} match(es), {} missing details, {} missing a recent replay",
                    ids.len(),
                    missing.len(),
                    replays.len()
                );
                (missing, replays)
            }
            Err(SteamGcError::Yielded) => return Some(RunEnd::GameOpen),
            Err(e) => {
                log::warn!("gc: could not read the history of account {account}: {e}");
                (Vec::new(), Vec::new())
            }
        };
        let mut inner = run.lock();
        if inner.epoch == self.epoch {
            inner.saved.queue.enqueue_back(&missing);
            inner.saved.queue.enqueue_replays(&replays);
            inner.saved.histories_read.insert(account);
            env.save_run(&inner.saved);
        }
        drop(inner);
        env.save_attempts(&self.attempts);
        run.report(env);
        None
    }

    /// Why `before_request` said stop.
    fn halted(&mut self, run: &Run, env: &impl RunEnv) -> RunEnd {
        if env.game_running() {
            return RunEnd::GameOpen;
        }
        self.interrupted(&mut run.lock()).unwrap_or(RunEnd::Interrupted)
    }
}

fn save_quota(inner: &RunInner, env: &mut impl RunEnv, account: u32) {
    if let Some(quota) = inner.saved.queue.quota(account) {
        env.save_quota(account, quota);
    }
}

pub(super) fn load_run(app: &AppHandle) -> SavedRun {
    load(app, RUN_KEY)
}

pub(super) fn load_last_run(app: &AppHandle) -> Option<LastRun> {
    load(app, LAST_RUN_KEY)
}

/// Saves the run in kv and mirrors the last run into the status.
pub(super) struct KvRunStore<'a> {
    pub app: &'a AppHandle,
    pub shared: &'a Shared,
}

impl RunStore for KvRunStore<'_> {
    fn save_run(&mut self, run: &SavedRun) {
        save(self.app, RUN_KEY, run);
    }

    fn save_last_run(&mut self, last: LastRun) {
        save(self.app, LAST_RUN_KEY, &last);
        self.shared.status.lock_or_recover().last_run = Some(last);
    }
}

struct AppEnv<'a, H: Fn() -> bool, S: Sink> {
    host: GcHost<'a, H, S>,
    store: KvRunStore<'a>,
    http: &'a reqwest::Client,
    contexts: Vec<AuthContext>,
}

impl<H: Fn() -> bool, S: Sink> AppEnv<'_, H, S> {
    fn steam_id(&self, account_id: u32) -> Option<u64> {
        self.contexts.iter().find(|c| c.account_id() == account_id).map(|c| c.steam_id64)
    }
}

impl<H: Fn() -> bool, S: Sink> Host for AppEnv<'_, H, S> {
    async fn before_request(&mut self) -> bool {
        self.host.before_request().await
    }

    async fn deliver(&mut self, salts: RecoveredSalts) -> bool {
        self.host.deliver(salts).await
    }

    fn now(&self) -> i64 {
        self.host.now()
    }
}

impl<H: Fn() -> bool, S: Sink> RunStore for AppEnv<'_, H, S> {
    fn save_run(&mut self, run: &SavedRun) {
        self.store.save_run(run);
    }

    fn save_last_run(&mut self, last: LastRun) {
        self.store.save_last_run(last);
    }
}

impl<H: Fn() -> bool, S: Sink> RunEnv for AppEnv<'_, H, S> {
    type Session = GcSession;

    fn game_running(&self) -> bool {
        dp_game::is_running()
    }

    fn accounts(&mut self) -> Result<Vec<u32>, AppError> {
        let contexts = steam_accounts();
        self.store.shared.remember_accounts(contexts.as_deref().unwrap_or_default());
        self.contexts = contexts?;
        self.store.shared.status.lock_or_recover().accounts = u32::try_from(self.contexts.len()).unwrap_or(u32::MAX);
        Ok(self.contexts.iter().map(AuthContext::account_id).collect())
    }

    async fn connect(&mut self, account_id: u32) -> Result<GcSession, SteamGcError> {
        let ctx = self.contexts.iter().find(|c| c.account_id() == account_id);
        match ctx {
            Some(ctx) => GcSession::connect(ctx).await,
            None => Err(SteamGcError::AuthUnavailable(format!("account {account_id} is no longer signed in"))),
        }
    }

    async fn history(&mut self, session: &GcSession, account_id: u32) -> Result<History, SteamGcError> {
        let (matches, complete) = session.fetch_history_matches(account_id, |_| {}).await?;
        if !complete {
            log::info!("gc: Steam cut the history of account {account_id} short; the next run reads the rest");
        }
        let ids: Vec<u64> = matches.iter().map(|m| m.match_id).collect();
        let (known, replays) =
            futures::join!(api::known_match_ids(self.http, &ids), api::replay_match_ids(self.http, &ids));
        let mut with_details = known.map_err(|e| SteamGcError::Api(e.to_string()))?;
        let mut with_replay: HashSet<u64> = match replays {
            Ok(replays) => replays.into_iter().collect(),
            Err(e) => {
                log::warn!("gc: could not check which matches of account {account_id} have a replay: {e}");
                // Unknown reads as present, so no fetch is spent on a guess.
                ids.iter().copied().collect()
            }
        };
        let local = local_coverage(self.store.app, &ids);
        with_details.extend(local.details);
        with_replay.extend(local.replay);
        Ok(History { matches, with_details, with_replay })
    }

    fn quota(&self, account_id: u32) -> SaltQuota {
        let Some(steam_id) = self.steam_id(account_id) else { return SaltQuota::default() };
        let ledger: States = load(self.store.app, ACCOUNTS_KEY);
        ledger.get(&steam_id.to_string()).map(|s| s.quota.clone()).unwrap_or_default()
    }

    fn save_quota(&mut self, account_id: u32, quota: &SaltQuota) {
        let Some(steam_id) = self.steam_id(account_id) else { return };
        let mut ledger: States = load(self.store.app, ACCOUNTS_KEY);
        ledger.entry(steam_id.to_string()).or_default().quota = quota.clone();
        save(self.store.app, ACCOUNTS_KEY, &ledger);
    }

    fn attempts(&self) -> SaltAttempts {
        load(self.store.app, ATTEMPTS_KEY)
    }

    fn save_attempts(&mut self, attempts: &SaltAttempts) {
        save(self.store.app, ATTEMPTS_KEY, attempts);
    }

    fn report(&mut self, status: OwnRecovery) {
        self.store.shared.status.lock_or_recover().own_recovery = Some(status);
    }
}

/// Drives `run` on this thread, holding the GC for the whole drive so the background pass waits.
/// The caller holds the driver's slot and counts itself in `recovering`.
pub(super) fn drive_blocking(
    run: &Run,
    stop: &StopSignal,
    shared: &Shared,
    app: &AppHandle,
    http: &reqwest::Client,
) -> RunEnd {
    let _gc = shared.gc_lock.blocking_lock();
    let mut last_request = None;
    let mut env = AppEnv {
        host: GcHost {
            http,
            salts_url: SALTS_URL,
            last_request: &mut last_request,
            halted: || stop.is_stopped() || run.halted(),
            // Asking for the run was consent for it, whatever the background toggle says.
            sink: AppSink { app, consented: || true, on_delivered: || {} },
        },
        store: KvRunStore { app, shared },
        http,
        contexts: Vec::new(),
    };
    let end = block_on(drive(run, &mut env));
    log::info!("gc: match recovery stopped: {end:?}");
    end
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::collections::HashMap;
    use std::rc::Rc;

    use dp_gc::quota::{FETCH_QUOTA_LIMIT, FETCH_QUOTA_WINDOW_SECS};

    use super::*;

    const NOW: i64 = 1_800_000_000;
    const A: u32 = 11;
    const B: u32 = 22;

    #[derive(Default)]
    struct Script {
        fetches: RefCell<Vec<(u32, u64)>>,
        rate_limited: RefCell<HashSet<u32>>,
        fails: HashSet<u64>,
    }

    struct FakeSession {
        account: u32,
        script: Rc<Script>,
    }

    impl SaltFetcher for FakeSession {
        async fn fetch_match_salts(&self, match_id: u64) -> Result<RecoveredSalts, SteamGcError> {
            self.script.fetches.borrow_mut().push((self.account, match_id));
            if self.script.rate_limited.borrow().contains(&self.account) {
                return Err(SteamGcError::GcRateLimited);
            }
            if self.script.fails.contains(&match_id) {
                return Err(SteamGcError::GcUnavailable("no metadata".into()));
            }
            Ok(RecoveredSalts {
                match_id,
                cluster_id: Some(1),
                metadata_salt: Some(2),
                replay_salt: None,
                account_id: self.account,
            })
        }
    }

    impl Release for FakeSession {
        async fn release(&self) {}
    }

    #[derive(Default)]
    struct FakeEnv<'r> {
        run: Option<&'r Run>,
        game_open: bool,
        accounts: Vec<u32>,
        histories: HashMap<u32, History>,
        script: Rc<Script>,
        ledger: HashMap<u32, SaltQuota>,
        saved: Vec<serde_json::Value>,
        last_runs: Vec<LastRun>,
        requests: usize,
        started_mid_run: Option<(usize, Vec<u64>, bool)>,
        started_mid_run_replays: Vec<u64>,
        attempts: SaltAttempts,
        started_mid_run_drives: Option<bool>,
        game_opens_at: Option<usize>,
        pause_on_deliver: Option<u64>,
        cancel_on_deliver: Option<u64>,
        status: Option<OwnRecovery>,
    }

    impl<'r> FakeEnv<'r> {
        fn new(run: &'r Run, accounts: &[u32]) -> Self {
            Self { run: Some(run), accounts: accounts.to_vec(), ..Self::default() }
        }

        fn run(&self) -> &'r Run {
            self.run.unwrap()
        }

        fn fetched(&self) -> Vec<u64> {
            self.script.fetches.borrow().iter().map(|&(_, id)| id).collect()
        }

        fn last_saved(&self) -> SavedRun {
            serde_json::from_value(self.saved.last().unwrap().clone()).unwrap()
        }

        fn history(&mut self, account: u32, ids: &[u64], known: &[u64]) {
            let rows: Vec<(u64, Option<u32>)> = ids.iter().map(|&id| (id, None)).collect();
            self.timed_history(account, &rows, known, &[]);
        }

        fn timed_history(&mut self, account: u32, rows: &[(u64, Option<u32>)], details: &[u64], replay: &[u64]) {
            let history = History {
                matches: rows.iter().map(|&(match_id, start_time)| HistoryMatch { match_id, start_time }).collect(),
                with_details: details.iter().copied().collect(),
                with_replay: replay.iter().copied().collect(),
            };
            self.histories.insert(account, history);
        }

        fn spent(&mut self, account: u32, fetches: usize, at: i64) {
            self.ledger.insert(account, SaltQuota::from_hits(vec![at; fetches]));
        }
    }

    impl Host for FakeEnv<'_> {
        async fn before_request(&mut self) -> bool {
            self.requests += 1;
            let n = self.requests;
            if let Some((at, ids, with_history)) = self.started_mid_run.clone() {
                if at == n {
                    let run = self.run();
                    let replays = self.started_mid_run_replays.clone();
                    self.started_mid_run_drives = Some(run.start(&ids, &replays, with_history, self));
                }
            }
            if self.game_opens_at == Some(n) {
                self.game_open = true;
            }
            !self.game_open && !self.run().halted()
        }

        async fn deliver(&mut self, salts: RecoveredSalts) -> bool {
            let run = self.run();
            if self.pause_on_deliver == Some(salts.match_id) {
                run.pause(self);
            }
            if self.cancel_on_deliver == Some(salts.match_id) {
                run.cancel(self, NOW);
            }
            true
        }

        fn now(&self) -> i64 {
            NOW
        }
    }

    impl RunStore for FakeEnv<'_> {
        fn save_run(&mut self, run: &SavedRun) {
            self.saved.push(serde_json::to_value(run).unwrap());
        }

        fn save_last_run(&mut self, last: LastRun) {
            self.last_runs.push(last);
        }
    }

    impl RunEnv for FakeEnv<'_> {
        type Session = FakeSession;

        fn game_running(&self) -> bool {
            self.game_open
        }

        fn accounts(&mut self) -> Result<Vec<u32>, AppError> {
            Ok(self.accounts.clone())
        }

        async fn connect(&mut self, account_id: u32) -> Result<FakeSession, SteamGcError> {
            Ok(FakeSession { account: account_id, script: self.script.clone() })
        }

        async fn history(&mut self, _: &FakeSession, account_id: u32) -> Result<History, SteamGcError> {
            Ok(self.histories.remove(&account_id).unwrap_or_default())
        }

        fn quota(&self, account_id: u32) -> SaltQuota {
            self.ledger.get(&account_id).cloned().unwrap_or_default()
        }

        fn save_quota(&mut self, account_id: u32, quota: &SaltQuota) {
            self.ledger.insert(account_id, quota.clone());
        }

        fn attempts(&self) -> SaltAttempts {
            self.attempts.clone()
        }

        fn save_attempts(&mut self, _: &SaltAttempts) {}

        fn report(&mut self, status: OwnRecovery) {
            self.status = Some(status);
        }
    }

    fn start(env: &mut FakeEnv<'_>, ids: &[u64]) -> RunEnd {
        start_with(env, ids, true)
    }

    fn start_with(env: &mut FakeEnv<'_>, ids: &[u64], with_history: bool) -> RunEnd {
        start_replays(env, ids, &[], with_history)
    }

    fn start_replays(env: &mut FakeEnv<'_>, ids: &[u64], replay_ids: &[u64], with_history: bool) -> RunEnd {
        let run = env.run();
        assert!(run.start(ids, replay_ids, with_history, env), "a fresh start must hand over the drive");
        super::super::block_on(drive(run, env))
    }

    /// Unix seconds `days` days before `NOW`.
    fn days_ago(days: i64) -> Option<u32> {
        Some(u32::try_from(NOW - days * 24 * 60 * 60).unwrap())
    }

    fn resume_drive(env: &mut FakeEnv<'_>) -> RunEnd {
        super::super::block_on(drive(env.run(), env))
    }

    #[test]
    fn given_ids_go_first_then_each_accounts_missing_history() {
        let run = Run::default();
        let mut env = FakeEnv::new(&run, &[A]);
        env.history(A, &[5, 6, 7, 1], &[6]);
        assert_eq!(start(&mut env, &[1, 2]), RunEnd::Done);
        assert_eq!(env.fetched(), [1, 2, 5, 7]);
        let status = run.status(NOW);
        assert_eq!((status.done, status.total, status.delivered, status.failed), (4, 4, 4, 0));
        assert!(!status.running);
        assert_eq!(status.outcome, Some(OwnRecoveryOutcome::Done));
    }

    #[test]
    fn ids_started_into_a_running_run_come_next() {
        let run = Run::default();
        let mut env = FakeEnv::new(&run, &[A]);
        env.started_mid_run = Some((2, vec![9, 3], true));
        assert_eq!(start(&mut env, &[1, 2, 3]), RunEnd::Done);
        assert_eq!(env.started_mid_run_drives, Some(false));
        assert_eq!(env.fetched(), [1, 9, 3, 2]);
        assert_eq!(run.status(NOW).total, 4);
    }

    #[test]
    fn without_history_only_the_given_ids_are_fetched() {
        let run = Run::default();
        let mut env = FakeEnv::new(&run, &[A]);
        env.history(A, &[5], &[]);
        assert_eq!(start_with(&mut env, &[1, 2], false), RunEnd::Done);
        assert_eq!(env.fetched(), [1, 2]);
        assert!(env.histories.contains_key(&A), "no history was read");
        assert_eq!(run.status(NOW).total, 2);
    }

    #[test]
    fn a_start_without_history_into_a_run_with_history_keeps_it() {
        let run = Run::default();
        let mut env = FakeEnv::new(&run, &[A, B]);
        env.history(B, &[5], &[]);
        env.started_mid_run = Some((2, vec![9], false));
        assert_eq!(start_with(&mut env, &[1, 2, 3], true), RunEnd::Done);
        assert_eq!(env.started_mid_run_drives, Some(false));
        assert_eq!(env.fetched(), [1, 9, 2, 3, 5]);
    }

    #[test]
    fn a_start_with_history_into_a_run_without_it_adds_it() {
        let run = Run::default();
        let mut env = FakeEnv::new(&run, &[A, B]);
        env.history(B, &[5], &[]);
        env.started_mid_run = Some((2, vec![9], true));
        assert_eq!(start_with(&mut env, &[1, 2], false), RunEnd::Done);
        assert_eq!(env.fetched(), [1, 9, 2, 5]);
    }

    #[test]
    fn a_rate_limited_account_hands_the_match_to_the_next() {
        let run = Run::default();
        let mut env = FakeEnv::new(&run, &[A, B]);
        env.script.rate_limited.borrow_mut().insert(A);
        assert_eq!(start(&mut env, &[1, 2]), RunEnd::Done);
        assert_eq!(*env.script.fetches.borrow(), [(A, 1), (B, 1), (B, 2)]);
        let status = run.status(NOW);
        assert_eq!(
            status.accounts,
            [
                AccountProgress {
                    account_id: A,
                    delivered: 0,
                    used_today: FETCH_QUOTA_LIMIT as u32,
                    rate_limited: true
                },
                AccountProgress { account_id: B, delivered: 2, used_today: 2, rate_limited: false },
            ]
        );
        assert_eq!(env.ledger[&A].remaining(NOW), 0);
        assert_eq!(env.ledger[&B].remaining(NOW), FETCH_QUOTA_LIMIT - 2);
    }

    #[test]
    fn the_background_pass_and_a_run_share_one_daily_limit() {
        let run = Run::default();
        let mut env = FakeEnv::new(&run, &[A]);
        env.spent(A, 35, NOW - 60);
        let ids: Vec<u64> = (1..=10).collect();
        assert_eq!(start(&mut env, &ids), RunEnd::DailyLimit { until: NOW - 60 + FETCH_QUOTA_WINDOW_SECS });
        assert_eq!(env.fetched(), [1, 2, 3, 4, 5]);
        assert_eq!(env.ledger[&A].remaining(NOW), 0);
        assert_eq!(env.ledger[&A].hits().len(), FETCH_QUOTA_LIMIT);
        assert_eq!(run.status(NOW).accounts[0].used_today, FETCH_QUOTA_LIMIT as u32);
    }

    #[test]
    fn every_account_spent_waits_for_the_first_to_reopen() {
        let run = Run::default();
        let mut env = FakeEnv::new(&run, &[A, B]);
        env.spent(A, FETCH_QUOTA_LIMIT, NOW - 100);
        env.spent(B, FETCH_QUOTA_LIMIT, NOW - 50);
        let until = NOW - 100 + FETCH_QUOTA_WINDOW_SECS;
        assert_eq!(start(&mut env, &[1, 2]), RunEnd::DailyLimit { until });
        assert!(env.fetched().is_empty());
        let status = run.status(NOW);
        assert_eq!(status.waiting, Some(RecoveryWait::DailyLimit { until }));
        assert_eq!(status.queued, [1, 2]);
        assert!(!status.running);
        assert_eq!(
            env.last_runs,
            [LastRun { ended_at: NOW, delivered: 0, left: 2, outcome: OwnRecoveryOutcome::RateLimited }]
        );
        assert!(env.last_saved().active, "the run goes on once the limit reopens");
    }

    #[test]
    fn a_pause_survives_reloading_the_saved_run() {
        let run = Run::default();
        let mut env = FakeEnv::new(&run, &[A]);
        env.pause_on_deliver = Some(1);
        assert_eq!(start(&mut env, &[1, 2, 3]), RunEnd::Paused);
        assert_eq!(env.fetched(), [1]);
        assert!(env.last_runs.is_empty());

        let reloaded = Run::restore(env.last_saved());
        let status = reloaded.status(NOW);
        assert!(status.paused);
        assert_eq!((status.done, status.delivered, status.queued.as_slice()), (1, 1, &[2, 3][..]));
        assert!(!reloaded.claim_driver(), "a paused run does not continue on its own");

        let mut env = FakeEnv::new(&reloaded, &[A]);
        assert!(reloaded.resume(&mut env));
        assert_eq!(resume_drive(&mut env), RunEnd::Done);
        assert_eq!(env.fetched(), [2, 3]);
        assert_eq!(
            env.last_runs,
            [LastRun { ended_at: NOW, delivered: 3, left: 0, outcome: OwnRecoveryOutcome::Done }]
        );
    }

    #[test]
    fn deadlock_opening_mid_run_keeps_the_queue() {
        let run = Run::default();
        let mut env = FakeEnv::new(&run, &[A]);
        env.game_opens_at = Some(2);
        assert_eq!(start(&mut env, &[1, 2, 3]), RunEnd::GameOpen);
        assert_eq!(env.fetched(), [1]);
        let status = run.status(NOW);
        assert_eq!(status.waiting, Some(RecoveryWait::GameOpen));
        assert!(!status.running);
        assert_eq!(status.queued, [2, 3]);
        assert_eq!(env.last_saved().queue.ids().collect::<Vec<_>>(), [2, 3]);
        assert!(env.last_runs.is_empty());

        env.game_open = false;
        assert!(run.claim_driver());
        assert_eq!(resume_drive(&mut env), RunEnd::Done);
        assert_eq!(env.fetched(), [1, 2, 3]);
        assert_eq!(run.status(NOW).waiting, None);
    }

    #[test]
    fn deadlock_open_at_the_start_fetches_nothing() {
        let run = Run::default();
        let mut env = FakeEnv::new(&run, &[A]);
        env.game_open = true;
        assert_eq!(start(&mut env, &[1]), RunEnd::GameOpen);
        assert!(env.fetched().is_empty());
        assert_eq!(run.status(NOW).queued, [1]);
        assert!(env.last_runs.is_empty());
    }

    #[test]
    fn last_run_is_written_once_when_the_run_ends() {
        let run = Run::default();
        let mut env = FakeEnv::new(&run, &[A]);
        env.script = Rc::new(Script { fails: HashSet::from([2]), ..Script::default() });
        assert_eq!(start(&mut env, &[1, 2, 3]), RunEnd::Done);
        assert_eq!(
            env.last_runs,
            [LastRun { ended_at: NOW, delivered: 2, left: 0, outcome: OwnRecoveryOutcome::Incomplete }]
        );
        assert!(env.saved.len() > 3, "the queue is saved after every match");
        assert!(!env.last_saved().active);
        assert_eq!(env.status.unwrap().outcome, Some(OwnRecoveryOutcome::Incomplete));
    }

    #[test]
    fn cancel_mid_run_clears_the_queue_and_records_the_run() {
        let run = Run::default();
        let mut env = FakeEnv::new(&run, &[A]);
        env.cancel_on_deliver = Some(1);
        assert_eq!(start(&mut env, &[1, 2, 3]), RunEnd::Cancelled);
        assert_eq!(env.fetched(), [1]);
        assert_eq!(env.last_runs.len(), 1);
        assert_eq!(env.last_runs[0].outcome, OwnRecoveryOutcome::Stopped);
        let status = run.status(NOW);
        assert!(status.queued.is_empty());
        assert_eq!(status.outcome, Some(OwnRecoveryOutcome::Stopped));
        assert_eq!(env.ledger[&A].remaining(NOW), FETCH_QUOTA_LIMIT - 1, "the cancelled fetch still counts");
    }

    #[test]
    fn a_new_start_after_the_end_is_a_fresh_run() {
        let run = Run::default();
        let mut env = FakeEnv::new(&run, &[A]);
        env.history(A, &[5], &[]);
        assert_eq!(start(&mut env, &[1]), RunEnd::Done);
        env.history(A, &[5, 6], &[5]);
        assert_eq!(start(&mut env, &[7]), RunEnd::Done);
        assert_eq!(env.fetched(), [1, 5, 7, 6]);
        let status = run.status(NOW);
        assert_eq!((status.done, status.total), (2, 2));
        assert_eq!(env.last_runs.len(), 2);
    }

    #[test]
    fn the_replay_step_takes_own_recent_matches_with_details_and_no_replay() {
        let run = Run::default();
        let mut env = FakeEnv::new(&run, &[A]);
        let rows = [(1, days_ago(2)), (2, days_ago(3)), (3, days_ago(4)), (4, days_ago(25)), (5, None)];
        env.timed_history(A, &rows, &[1, 3, 4, 5], &[3]);
        assert_eq!(start(&mut env, &[]), RunEnd::Done);
        assert_eq!(env.fetched(), [2, 1]);
    }

    #[test]
    fn the_replay_window_closes_21_days_after_the_start() {
        let at = |secs: i64| u32::try_from(NOW - secs).ok();
        let window = REPLAY_WINDOW_SECS;
        let rows = [(1, at(window - 1)), (2, at(window)), (3, at(window + 1))];
        let history = History {
            matches: rows.iter().map(|&(match_id, start_time)| HistoryMatch { match_id, start_time }).collect(),
            with_details: HashSet::from([1, 2, 3]),
            with_replay: HashSet::new(),
        };
        assert_eq!(replay_gaps(&history, NOW), [1]);
        assert_eq!(window, 21 * 24 * 60 * 60);
    }

    #[test]
    fn given_replay_ids_go_after_every_details_match() {
        let run = Run::default();
        let mut env = FakeEnv::new(&run, &[A]);
        env.started_mid_run = Some((2, vec![4], false));
        env.started_mid_run_replays = vec![8];
        assert_eq!(start_replays(&mut env, &[1, 2], &[9], false), RunEnd::Done);
        assert_eq!(env.fetched(), [1, 4, 2, 9, 8]);
    }

    #[test]
    fn a_later_accounts_missing_details_come_before_an_earlier_accounts_replays() {
        let run = Run::default();
        let mut env = FakeEnv::new(&run, &[A, B]);
        env.timed_history(A, &[(1, days_ago(1))], &[1], &[]);
        env.timed_history(B, &[(2, days_ago(1))], &[], &[]);
        assert_eq!(start(&mut env, &[]), RunEnd::Done);
        assert_eq!(env.fetched(), [2, 1]);
    }

    #[test]
    fn a_replay_steam_keeps_leaving_out_is_given_up_on() {
        let run = Run::default();
        let mut env = FakeEnv::new(&run, &[A]);
        let mut attempts = SaltAttempts::default();
        for _ in 0..dp_gc::ledger::MAX_SALT_ATTEMPTS {
            attempts.record(1);
        }
        env.attempts = attempts;
        env.timed_history(A, &[(1, days_ago(1)), (2, days_ago(1))], &[1, 2], &[]);
        assert_eq!(start(&mut env, &[]), RunEnd::Done);
        assert_eq!(env.fetched(), [2]);
    }

    #[test]
    fn steps_list_each_kind_of_fetch_in_order_and_skip_empty_ones() {
        let run = Run::default();
        let mut env = FakeEnv::new(&run, &[A]);
        assert!(run.start(&[1, 2], &[], false, &mut env));
        let details = StepProgress { step: RecoveryStep::Details, done: 0, total: 2 };
        assert_eq!(run.status(NOW).steps, [details]);

        run.start(&[], &[7], false, &mut env);
        let replays = StepProgress { step: RecoveryStep::Replays, done: 0, total: 1 };
        assert_eq!(run.status(NOW).steps, [details, replays]);

        assert_eq!(super::super::block_on(drive(&run, &mut env)), RunEnd::Done);
        assert_eq!(run.status(NOW).steps, [StepProgress { done: 2, ..details }, StepProgress { done: 1, ..replays }]);
        assert!(Run::default().status(NOW).steps.is_empty());
    }

    #[test]
    fn missing_skips_known_and_given_up_matches() {
        let mut attempts = SaltAttempts::default();
        for _ in 0..dp_gc::ledger::MAX_SALT_ATTEMPTS {
            attempts.record(4);
        }
        let got = missing_matches(&[1, 2, 3, 4, 5], &HashSet::from([2]), &attempts);
        assert_eq!(got, vec![1, 3, 5]);
    }

    #[test]
    fn a_saved_run_round_trips() {
        let mut saved = SavedRun { active: true, ..SavedRun::default() };
        saved.queue.enqueue_front(&[1, 2]);
        saved.queue.track_accounts(&[A]);
        saved.histories_read.insert(A);
        let back: SavedRun = serde_json::from_value(serde_json::to_value(&saved).unwrap()).unwrap();
        assert!(back.active);
        assert_eq!(back.queue.ids().collect::<Vec<_>>(), [1, 2]);
        assert_eq!(back.histories_read, BTreeSet::from([A]));
        assert_eq!(back.queue.account_use(NOW).len(), 1);
    }

    #[test]
    fn recovery_serializes_with_camel_case_keys() {
        let own = OwnRecovery {
            waiting: Some(RecoveryWait::GameOpen),
            queued: vec![7, 3],
            accounts: vec![AccountProgress { account_id: 1, delivered: 2, used_today: 3, rate_limited: true }],
            ..Default::default()
        };
        let got = serde_json::to_value(own).unwrap();
        let mut keys: Vec<&str> = got.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort_unstable();
        let mut want = [
            "running",
            "paused",
            "waiting",
            "done",
            "total",
            "delivered",
            "failed",
            "queued",
            "etaSecs",
            "accounts",
            "outcome",
            "error",
            "steps",
        ];
        want.sort_unstable();
        assert_eq!(keys, want);
        assert_eq!(got["queued"], serde_json::json!([7, 3]));
        assert_eq!(
            got["accounts"][0],
            serde_json::json!({"accountId": 1, "delivered": 2, "usedToday": 3, "rateLimited": true})
        );
    }

    #[test]
    fn waiting_is_tagged_by_a_snake_case_reason() {
        assert_eq!(serde_json::to_value(RecoveryWait::GameOpen).unwrap(), serde_json::json!({"reason": "game_open"}));
        assert_eq!(
            serde_json::to_value(RecoveryWait::DailyLimit { until: 1_700_000_000 }).unwrap(),
            serde_json::json!({"reason": "daily_limit", "until": 1_700_000_000})
        );
        assert_eq!(serde_json::to_value(OwnRecovery::default()).unwrap()["waiting"], serde_json::Value::Null);
    }

    #[test]
    fn last_run_round_trips_with_camel_case_keys() {
        let run = LastRun { ended_at: 5, delivered: 140, left: 60, outcome: OwnRecoveryOutcome::RateLimited };
        let got = serde_json::to_value(run).unwrap();
        assert_eq!(got, serde_json::json!({"endedAt": 5, "delivered": 140, "left": 60, "outcome": "rate_limited"}));
        assert_eq!(serde_json::from_value::<LastRun>(got).unwrap(), run);
    }

    #[test]
    fn coverage_serializes_with_camel_case_keys() {
        let got = serde_json::to_value(DetailCoverage { with_details: vec![1], with_replay: vec![2] }).unwrap();
        assert_eq!(got, serde_json::json!({"withDetails": [1], "withReplay": [2]}));
    }

    #[test]
    fn step_progress_serializes_with_a_lowercase_step() {
        let got = serde_json::to_value(StepProgress { step: RecoveryStep::Replays, done: 1, total: 4 }).unwrap();
        assert_eq!(got, serde_json::json!({"step": "replays", "done": 1, "total": 4}));
        assert_eq!(serde_json::to_value(RecoveryStep::Details).unwrap(), "details");
    }

    #[test]
    fn account_progress_maps_from_account_use() {
        let u =
            AccountUse { account_id: 9, delivered_today: 4, used_today: 6, rate_limited: true, reopens_at: Some(1) };
        assert_eq!(
            AccountProgress::from(u),
            AccountProgress { account_id: 9, delivered: 4, used_today: 6, rate_limited: true }
        );
    }

    #[test]
    fn outcome_serializes_in_snake_case() {
        assert_eq!(serde_json::to_value(OwnRecoveryOutcome::RateLimited).unwrap(), "rate_limited");
    }
}
