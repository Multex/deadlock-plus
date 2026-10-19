use std::collections::{BTreeMap, BTreeSet, VecDeque};

use serde::{Deserialize, Serialize};

use crate::quota::{SaltQuota, FETCH_QUOTA_LIMIT, FETCH_QUOTA_WINDOW_SECS};

/// The time one match takes, Steam's pacing included.
pub const RECOVERY_SECS_PER_MATCH: u64 = 20;

/// How one fetch of a queued match ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Attempt {
    Delivered,
    /// Steam answered, so the account's daily limit was spent, but the match could not be sent on.
    NotSent,
    /// Steam gave nothing for this match; the daily limit is not spent.
    Failed,
}

/// What a queued match is fetched for. Every details match comes before any replays match.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    Details,
    Replays,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct StepCount {
    pub done: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RecoveryProgress {
    pub done: u32,
    pub total: u32,
    pub delivered: u32,
    pub failed: u32,
    pub queued: u32,
    pub eta_secs: u64,
}

/// One account's share of the daily limit, over the last 24 hours.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AccountUse {
    pub account_id: u32,
    pub delivered_today: u32,
    pub used_today: u32,
    pub rate_limited: bool,
    /// When the account may fetch again, while it is exhausted.
    pub reopens_at: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct AccountState {
    quota: SaltQuota,
    delivered_at: Vec<i64>,
    rate_limited_until: Option<i64>,
}

impl AccountState {
    fn exhausted(&self, now: i64) -> bool {
        self.quota.remaining(now) == 0
    }

    fn reopens_at(&self, now: i64) -> Option<i64> {
        if !self.exhausted(now) {
            return None;
        }
        let cutoff = now - FETCH_QUOTA_WINDOW_SECS;
        self.quota.hits().iter().copied().filter(|&t| t > cutoff).min().map(|t| t + FETCH_QUOTA_WINDOW_SECS)
    }

    fn usage(&self, account_id: u32, now: i64) -> AccountUse {
        let cutoff = now - FETCH_QUOTA_WINDOW_SECS;
        AccountUse {
            account_id,
            delivered_today: count(self.delivered_at.iter().filter(|&&t| t > cutoff).count()),
            used_today: count(FETCH_QUOTA_LIMIT - self.quota.remaining(now)),
            rate_limited: self.rate_limited_until.is_some_and(|until| now < until),
            reopens_at: self.reopens_at(now),
        }
    }
}

fn count(n: usize) -> u32 {
    u32::try_from(n).unwrap_or(u32::MAX)
}

/// The matches a recovery run still has to fetch, next first, and each account's use of the daily
/// limit. Account use outlives a run so a new run cannot spend the same day twice.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RecoveryQueue {
    /// The details step.
    queued: VecDeque<u64>,
    #[serde(default)]
    replays: VecDeque<u64>,
    finished: BTreeSet<u64>,
    /// The details step's total.
    total: u32,
    #[serde(default)]
    replay_total: u32,
    delivered: u32,
    failed: u32,
    paused: bool,
    accounts: BTreeMap<u32, AccountState>,
}

fn take(queue: &mut VecDeque<u64>, id: u64) -> bool {
    queue.iter().position(|&q| q == id).and_then(|at| queue.remove(at)).is_some()
}

impl RecoveryQueue {
    /// Puts `ids` next, in order. An id already queued moves instead of doubling. On a finished
    /// queue this starts a new run.
    pub fn enqueue_front(&mut self, ids: &[u64]) {
        if self.is_done() {
            self.clear_run();
        }
        let mut front: Vec<u64> = Vec::with_capacity(ids.len());
        for &id in ids {
            if front.contains(&id) {
                continue;
            }
            if !take(&mut self.queued, id) {
                self.take_replay(id);
                self.total += 1;
            }
            front.push(id);
        }
        for id in front.into_iter().rev() {
            self.queued.push_front(id);
        }
    }

    /// Adds `ids` last among the details matches, skipping any already queued for details or
    /// finished this run.
    pub fn enqueue_back(&mut self, ids: &[u64]) {
        for &id in ids {
            if self.finished.contains(&id) || self.queued.contains(&id) {
                continue;
            }
            self.take_replay(id);
            self.queued.push_back(id);
            self.total += 1;
        }
    }

    /// Adds `ids` for their replays, after every details match. An id queued for details or
    /// finished this run is skipped: a details fetch brings the replay with it.
    pub fn enqueue_replays(&mut self, ids: &[u64]) {
        for &id in ids {
            if self.finished.contains(&id) || self.contains(id) {
                continue;
            }
            self.replays.push_back(id);
            self.replay_total += 1;
        }
    }

    fn take_replay(&mut self, id: u64) {
        if take(&mut self.replays, id) {
            self.replay_total -= 1;
        }
    }

    /// The step a queued match waits in.
    pub fn step_of(&self, match_id: u64) -> Option<Step> {
        if self.queued.contains(&match_id) {
            Some(Step::Details)
        } else if self.replays.contains(&match_id) {
            Some(Step::Replays)
        } else {
            None
        }
    }

    pub fn step_count(&self, step: Step) -> StepCount {
        let (queue, total) = match step {
            Step::Details => (&self.queued, self.total),
            Step::Replays => (&self.replays, self.replay_total),
        };
        StepCount { done: total.saturating_sub(count(queue.len())), total }
    }

    /// The next match to fetch, or None while paused or done.
    pub fn next_id(&self) -> Option<u64> {
        if self.paused {
            return None;
        }
        self.ids().next()
    }

    pub fn contains(&self, match_id: u64) -> bool {
        self.step_of(match_id).is_some()
    }

    /// Every queued match in fetch order.
    pub fn ids(&self) -> impl Iterator<Item = u64> + '_ {
        self.queued.iter().chain(&self.replays).copied()
    }

    pub fn record(&mut self, match_id: u64, account_id: u32, attempt: Attempt, now: i64) {
        if !take(&mut self.queued, match_id) {
            take(&mut self.replays, match_id);
        }
        self.finished.insert(match_id);
        let account = self.accounts.entry(account_id).or_default();
        match attempt {
            Attempt::Delivered => {
                account.quota.try_consume(now);
                account.delivered_at.retain(|&t| t > now - FETCH_QUOTA_WINDOW_SECS);
                account.delivered_at.push(now);
                self.delivered += 1;
            }
            Attempt::NotSent => {
                account.quota.try_consume(now);
                self.failed += 1;
            }
            Attempt::Failed => self.failed += 1,
        }
    }

    /// Steam refused the account: it is exhausted for a full day from `now`. The match it was
    /// fetching stays queued.
    pub fn rate_limited(&mut self, account_id: u32, now: i64) {
        let account = self.accounts.entry(account_id).or_default();
        account.quota.exhaust(now);
        account.rate_limited_until = Some(now + FETCH_QUOTA_WINDOW_SECS);
    }

    /// Makes sure each account is counted, keeping what is known of the others.
    pub fn track_accounts(&mut self, account_ids: &[u32]) {
        for &id in account_ids {
            self.accounts.entry(id).or_default();
        }
    }

    /// The account's daily limit as this queue counts it, to hand back to the store it shares.
    pub fn quota(&self, account_id: u32) -> Option<&SaltQuota> {
        self.accounts.get(&account_id).map(|a| &a.quota)
    }

    /// Takes over the daily limit the background pass keeps for the account, so both spend the
    /// same 40 a day.
    pub fn set_quota(&mut self, account_id: u32, quota: SaltQuota) {
        self.accounts.entry(account_id).or_default().quota = quota;
    }

    /// The first tracked account with daily limit left.
    pub fn next_account(&self, now: i64) -> Option<u32> {
        self.accounts.iter().find(|(_, a)| !a.exhausted(now)).map(|(&id, _)| id)
    }

    pub fn account_use(&self, now: i64) -> Vec<AccountUse> {
        self.accounts.iter().map(|(&id, a)| a.usage(id, now)).collect()
    }

    /// When every tracked account is exhausted, the earliest time one of them reopens.
    pub fn resume_after(&self, now: i64) -> Option<i64> {
        if self.next_account(now).is_some() {
            return None;
        }
        self.accounts.values().filter_map(|a| a.reopens_at(now)).min()
    }

    pub fn progress(&self) -> RecoveryProgress {
        let queued = count(self.queued.len() + self.replays.len());
        let total = self.total + self.replay_total;
        RecoveryProgress {
            done: total.saturating_sub(queued),
            total,
            delivered: self.delivered,
            failed: self.failed,
            queued,
            eta_secs: u64::from(queued) * RECOVERY_SECS_PER_MATCH,
        }
    }

    pub fn pause(&mut self) {
        self.paused = true;
    }

    pub fn resume(&mut self) {
        self.paused = false;
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }

    /// Drops the run: queue, progress and pause. Account use stays.
    pub fn cancel(&mut self) {
        self.clear_run();
    }

    pub fn is_done(&self) -> bool {
        self.queued.is_empty() && self.replays.is_empty()
    }

    fn clear_run(&mut self) {
        *self = Self { accounts: std::mem::take(&mut self.accounts), ..Self::default() };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_000_000;
    const A: u32 = 11;
    const B: u32 = 22;

    fn queue(ids: &[u64]) -> RecoveryQueue {
        let mut q = RecoveryQueue::default();
        q.enqueue_front(ids);
        q
    }

    fn round_trip(q: &RecoveryQueue) -> RecoveryQueue {
        serde_json::from_str(&serde_json::to_string(q).unwrap()).unwrap()
    }

    fn use_up(q: &mut RecoveryQueue, account: u32, now: i64) {
        let start = 10_000 * u64::from(account);
        let ids: Vec<u64> = (start..start + FETCH_QUOTA_LIMIT as u64).collect();
        q.enqueue_back(&ids);
        for id in ids {
            q.record(id, account, Attempt::Delivered, now);
        }
    }

    #[test]
    fn front_ids_come_next_in_the_given_order() {
        let mut q = queue(&[3, 4]);
        q.enqueue_front(&[1, 2]);
        assert_eq!(q.ids().collect::<Vec<_>>(), [1, 2, 3, 4]);
        assert_eq!(q.next_id(), Some(1));
        assert_eq!(q.progress().total, 4);
    }

    #[test]
    fn front_moves_an_already_queued_id_without_doubling_it() {
        let mut q = queue(&[1, 2, 3]);
        q.enqueue_front(&[3, 3]);
        assert_eq!(q.ids().collect::<Vec<_>>(), [3, 1, 2]);
        assert_eq!(q.progress().total, 3);
    }

    #[test]
    fn back_appends_new_ids_and_grows_the_total() {
        let mut q = queue(&[1, 2]);
        q.enqueue_back(&[2, 5, 6, 5]);
        assert_eq!(q.ids().collect::<Vec<_>>(), [1, 2, 5, 6]);
        assert_eq!(q.progress().total, 4);
        assert!(q.contains(5));
    }

    #[test]
    fn back_skips_ids_already_finished_this_run() {
        let mut q = queue(&[1, 2]);
        q.record(1, A, Attempt::Delivered, NOW);
        q.record(2, A, Attempt::Failed, NOW);
        q.enqueue_back(&[1, 2, 3]);
        assert_eq!(q.ids().collect::<Vec<_>>(), [3]);
        assert_eq!(q.progress().total, 3);
    }

    #[test]
    fn front_on_a_finished_queue_starts_a_new_run() {
        let mut q = queue(&[1]);
        q.record(1, A, Attempt::Delivered, NOW);
        assert!(q.is_done());
        q.enqueue_front(&[1, 2]);
        let p = q.progress();
        assert_eq!((p.done, p.total, p.delivered, p.failed), (0, 2, 0, 0));
        assert_eq!(q.next_id(), Some(1));
    }

    #[test]
    fn progress_counts_done_delivered_failed_and_eta() {
        let mut q = queue(&[1, 2, 3, 4, 5]);
        q.record(1, A, Attempt::Delivered, NOW);
        q.record(2, A, Attempt::NotSent, NOW);
        q.record(3, A, Attempt::Failed, NOW);
        assert_eq!(
            q.progress(),
            RecoveryProgress { done: 3, total: 5, delivered: 1, failed: 2, queued: 2, eta_secs: 40 }
        );
        assert!(!q.contains(1));
        assert_eq!(q.next_id(), Some(4));
    }

    #[test]
    fn eta_is_twenty_seconds_per_queued_match() {
        assert_eq!(queue(&[1, 2, 3]).progress().eta_secs, 3 * RECOVERY_SECS_PER_MATCH);
    }

    #[test]
    fn a_paused_queue_yields_nothing_until_resumed() {
        let mut q = queue(&[1, 2]);
        q.pause();
        assert!(q.is_paused());
        assert_eq!(q.next_id(), None);
        q.resume();
        assert_eq!(q.next_id(), Some(1));
    }

    #[test]
    fn pause_and_progress_survive_a_round_trip() {
        let mut q = queue(&[1, 2, 3]);
        q.record(1, A, Attempt::Delivered, NOW);
        q.pause();
        let back = round_trip(&q);
        assert!(back.is_paused());
        assert_eq!(back.next_id(), None);
        assert_eq!(back.progress(), q.progress());
        assert_eq!(back.ids().collect::<Vec<_>>(), [2, 3]);
        assert_eq!(back.account_use(NOW), q.account_use(NOW));
    }

    #[test]
    fn cancel_clears_the_run() {
        let mut q = queue(&[1, 2, 3]);
        q.record(1, A, Attempt::Delivered, NOW);
        q.pause();
        q.cancel();
        assert!(q.is_done());
        assert!(!q.is_paused());
        assert_eq!(q.progress(), RecoveryProgress::default());
        q.enqueue_back(&[1]);
        assert_eq!(q.next_id(), Some(1));
    }

    #[test]
    fn cancel_keeps_the_daily_limit() {
        let mut q = RecoveryQueue::default();
        use_up(&mut q, A, NOW);
        q.cancel();
        assert_eq!(q.account_use(NOW)[0].used_today, FETCH_QUOTA_LIMIT as u32);
        assert_eq!(q.next_account(NOW), None);
    }

    #[test]
    fn done_when_empty() {
        let mut q = queue(&[1]);
        assert!(!q.is_done());
        q.record(1, A, Attempt::Failed, NOW);
        assert!(q.is_done());
        assert!(RecoveryQueue::default().is_done());
    }

    #[test]
    fn accounts_count_delivered_and_used_today() {
        let mut q = queue(&[1, 2, 3, 4]);
        q.track_accounts(&[A, B]);
        q.record(1, A, Attempt::Delivered, NOW);
        q.record(2, A, Attempt::NotSent, NOW);
        q.record(3, A, Attempt::Failed, NOW);
        q.record(4, B, Attempt::Delivered, NOW);
        let used = q.account_use(NOW);
        assert_eq!(
            used,
            [
                AccountUse { account_id: A, delivered_today: 1, used_today: 2, rate_limited: false, reopens_at: None },
                AccountUse { account_id: B, delivered_today: 1, used_today: 1, rate_limited: false, reopens_at: None },
            ]
        );
        let tomorrow = NOW + FETCH_QUOTA_WINDOW_SECS + 1;
        assert_eq!(q.account_use(tomorrow)[0].used_today, 0);
        assert_eq!(q.account_use(tomorrow)[0].delivered_today, 0);
    }

    #[test]
    fn an_account_at_forty_is_exhausted_until_its_quota_reopens() {
        let mut q = RecoveryQueue::default();
        q.track_accounts(&[A, B]);
        use_up(&mut q, A, NOW);
        assert_eq!(q.next_account(NOW), Some(B));
        let a = q.account_use(NOW)[0];
        assert_eq!(a.used_today, FETCH_QUOTA_LIMIT as u32);
        assert_eq!(a.reopens_at, Some(NOW + FETCH_QUOTA_WINDOW_SECS));
        assert!(!a.rate_limited);
        assert_eq!(q.next_account(NOW + FETCH_QUOTA_WINDOW_SECS), Some(A));
    }

    #[test]
    fn a_rate_limited_account_is_exhausted_and_keeps_the_match_queued() {
        let mut q = queue(&[1]);
        q.track_accounts(&[A, B]);
        q.rate_limited(A, NOW);
        assert_eq!(q.next_id(), Some(1));
        assert_eq!(q.next_account(NOW), Some(B));
        let a = q.account_use(NOW)[0];
        assert!(a.rate_limited);
        assert_eq!(a.reopens_at, Some(NOW + FETCH_QUOTA_WINDOW_SECS));
        assert!(!q.account_use(NOW + FETCH_QUOTA_WINDOW_SECS)[0].rate_limited);
    }

    #[test]
    fn resume_after_is_the_earliest_reopening_once_all_are_exhausted() {
        let mut q = RecoveryQueue::default();
        q.track_accounts(&[A, B]);
        q.rate_limited(A, NOW + 500);
        assert_eq!(q.resume_after(NOW + 500), None);
        use_up(&mut q, B, NOW);
        assert_eq!(q.resume_after(NOW + 500), Some(NOW + FETCH_QUOTA_WINDOW_SECS));
        assert_eq!(q.resume_after(NOW + FETCH_QUOTA_WINDOW_SECS), None);
    }

    #[test]
    fn resume_after_is_none_without_accounts() {
        assert_eq!(RecoveryQueue::default().resume_after(NOW), None);
    }

    #[test]
    fn a_quota_set_from_the_background_pass_is_the_one_spent() {
        let mut q = queue(&[1, 2]);
        q.track_accounts(&[A, B]);
        q.set_quota(A, SaltQuota::from_hits(vec![NOW; FETCH_QUOTA_LIMIT - 1]));
        assert_eq!(q.account_use(NOW)[0].used_today, FETCH_QUOTA_LIMIT as u32 - 1);
        assert_eq!(q.next_account(NOW), Some(A));
        q.record(1, A, Attempt::Delivered, NOW);
        assert_eq!(q.next_account(NOW), Some(B));
        assert_eq!(q.quota(A).map(|quota| quota.remaining(NOW)), Some(0));
        assert_eq!(q.quota(B).map(|quota| quota.remaining(NOW)), Some(FETCH_QUOTA_LIMIT));
        assert!(q.quota(99).is_none());
    }

    #[test]
    fn set_quota_keeps_what_the_run_delivered() {
        let mut q = queue(&[1]);
        q.record(1, A, Attempt::Delivered, NOW);
        q.set_quota(A, SaltQuota::default());
        assert_eq!(q.account_use(NOW)[0].delivered_today, 1);
        assert_eq!(q.account_use(NOW)[0].used_today, 0);
    }

    fn counts(q: &RecoveryQueue) -> (StepCount, StepCount) {
        (q.step_count(Step::Details), q.step_count(Step::Replays))
    }

    #[test]
    fn replay_ids_queue_after_every_details_id() {
        let mut q = queue(&[1]);
        q.enqueue_replays(&[9, 8]);
        q.enqueue_back(&[2]);
        q.enqueue_front(&[0]);
        assert_eq!(q.ids().collect::<Vec<_>>(), [0, 1, 2, 9, 8]);
        assert_eq!(q.step_of(2), Some(Step::Details));
        assert_eq!(q.step_of(9), Some(Step::Replays));
        assert_eq!(q.step_of(7), None);
        for id in [0, 1, 2] {
            q.record(id, A, Attempt::Delivered, NOW);
        }
        assert_eq!(q.next_id(), Some(9));
        assert_eq!(q.progress().total, 5);
    }

    #[test]
    fn a_replay_id_already_queued_for_details_is_not_added_twice() {
        let mut q = queue(&[1, 2]);
        q.enqueue_replays(&[2, 3, 3]);
        assert_eq!(q.ids().collect::<Vec<_>>(), [1, 2, 3]);
        assert_eq!(q.step_of(2), Some(Step::Details));
        assert_eq!(counts(&q), (StepCount { done: 0, total: 2 }, StepCount { done: 0, total: 1 }));
        assert_eq!(q.progress().total, 3);
    }

    #[test]
    fn a_details_entry_takes_over_a_queued_replay() {
        let mut q = queue(&[1]);
        q.enqueue_replays(&[5, 6]);
        q.enqueue_front(&[5]);
        q.enqueue_back(&[6]);
        assert_eq!(q.ids().collect::<Vec<_>>(), [5, 1, 6]);
        assert_eq!(q.step_of(5), Some(Step::Details));
        assert_eq!(q.step_of(6), Some(Step::Details));
        assert_eq!(counts(&q), (StepCount { done: 0, total: 3 }, StepCount::default()));
        assert_eq!(q.progress().total, 3);
    }

    #[test]
    fn replays_skip_ids_finished_this_run() {
        let mut q = queue(&[1, 2]);
        q.record(1, A, Attempt::Delivered, NOW);
        q.enqueue_replays(&[1, 4]);
        assert_eq!(q.ids().collect::<Vec<_>>(), [2, 4]);
        q.record(4, A, Attempt::Delivered, NOW);
        q.enqueue_replays(&[4]);
        assert_eq!(q.ids().collect::<Vec<_>>(), [2]);
    }

    #[test]
    fn step_counts_track_done_and_total_per_step() {
        let mut q = queue(&[1, 2]);
        q.enqueue_replays(&[3, 4, 5]);
        q.record(1, A, Attempt::Delivered, NOW);
        q.record(2, A, Attempt::Failed, NOW);
        q.record(3, A, Attempt::NotSent, NOW);
        assert_eq!(counts(&q), (StepCount { done: 2, total: 2 }, StepCount { done: 1, total: 3 }));
        let p = q.progress();
        assert_eq!((p.done, p.total, p.delivered, p.failed, p.queued), (3, 5, 1, 2, 2));
        assert_eq!(p.eta_secs, 2 * RECOVERY_SECS_PER_MATCH);
    }

    #[test]
    fn a_paused_queue_holds_its_replays_too() {
        let mut q = RecoveryQueue::default();
        q.enqueue_replays(&[7]);
        q.pause();
        assert_eq!(q.next_id(), None);
        q.resume();
        assert_eq!(q.next_id(), Some(7));
        assert!(!q.is_done());
        assert!(q.contains(7));
    }

    #[test]
    fn steps_survive_a_round_trip_and_cancel_clears_them() {
        let mut q = queue(&[1]);
        q.enqueue_replays(&[2, 3]);
        q.record(2, A, Attempt::Delivered, NOW);
        let mut back = round_trip(&q);
        assert_eq!(back.ids().collect::<Vec<_>>(), [1, 3]);
        assert_eq!(back.step_of(3), Some(Step::Replays));
        assert_eq!(counts(&back), counts(&q));
        back.cancel();
        assert!(back.is_done());
        assert_eq!(counts(&back), (StepCount::default(), StepCount::default()));
    }

    #[test]
    fn a_queue_saved_before_steps_loads_as_details() {
        let saved = r#"{"queued":[4,5],"finished":[3],"total":3,"delivered":1,"failed":0,"paused":true,"accounts":{}}"#;
        let q: RecoveryQueue = serde_json::from_str(saved).unwrap();
        assert_eq!(q.ids().collect::<Vec<_>>(), [4, 5]);
        assert_eq!(q.step_of(4), Some(Step::Details));
        assert_eq!(counts(&q), (StepCount { done: 1, total: 3 }, StepCount::default()));
        assert!(q.is_paused());
    }

    #[test]
    fn track_accounts_keeps_existing_use() {
        let mut q = RecoveryQueue::default();
        q.rate_limited(A, NOW);
        q.track_accounts(&[A, B]);
        assert_eq!(q.account_use(NOW).iter().map(|a| a.account_id).collect::<Vec<_>>(), [A, B]);
        assert!(q.account_use(NOW)[0].rate_limited);
    }
}
