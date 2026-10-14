use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

/// Salt fetches per match before it is given up on for good. Valve sometimes cannot serve a
/// match's metadata, so deadlock-api keeps listing it however often its salts are sent.
pub const MAX_SALT_ATTEMPTS: u32 = 3;

/// Per match, how often its salts were fetched without deadlock-api getting its metadata.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct SaltAttempts(HashMap<u64, u32>);

impl SaltAttempts {
    /// Counts a GC failure on the match or salts deadlock-api accepted. Rate limits and failed
    /// posts must not be counted: they say nothing about the match.
    pub fn record(&mut self, match_id: u64) {
        *self.0.entry(match_id).or_default() += 1;
    }

    pub fn given_up(&self, match_id: u64) -> bool {
        self.0.get(&match_id).is_some_and(|&n| n >= MAX_SALT_ATTEMPTS)
    }

    /// Drops the counts of matches deadlock-api now has metadata for. Returns whether any went.
    pub fn forget(&mut self, known: &HashSet<u64>) -> bool {
        let before = self.0.len();
        self.0.retain(|id, _| !known.contains(id));
        self.0.len() != before
    }
}

/// Per friend account id, the time before which their history is not looked up again. Shared by
/// every account, so a friend of several accounts is looked up once.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct FriendCooldowns(HashMap<u32, i64>);

impl FriendCooldowns {
    pub fn is_due(&self, account_id: u32, now: i64) -> bool {
        self.0.get(&account_id).is_none_or(|&until| until <= now)
    }

    /// Records a cooldown and drops the ones that already ran out.
    pub fn set(&mut self, account_id: u32, until: i64, now: i64) {
        self.0.retain(|_, &mut t| t > now);
        self.0.insert(account_id, until);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_match_is_given_up_after_the_last_attempt() {
        let mut a = SaltAttempts::default();
        for _ in 1..MAX_SALT_ATTEMPTS {
            a.record(5);
        }
        assert!(!a.given_up(5));
        a.record(5);
        assert!(a.given_up(5));
        assert!(!a.given_up(6));
    }

    #[test]
    fn known_matches_are_forgotten() {
        let mut a = SaltAttempts::default();
        a.record(5);
        a.record(6);
        assert!(!a.forget(&HashSet::from([7])));
        assert!(a.forget(&HashSet::from([5])));
        assert_eq!(a, {
            let mut b = SaltAttempts::default();
            b.record(6);
            b
        });
    }

    #[test]
    fn cooldowns_expire_and_are_pruned() {
        let mut c = FriendCooldowns::default();
        assert!(c.is_due(1, 100));
        c.set(1, 200, 100);
        assert!(!c.is_due(1, 199));
        assert!(c.is_due(1, 200));
        c.set(2, 400, 300);
        assert_eq!(serde_json::to_value(&c).unwrap(), serde_json::json!({ "2": 400 }));
    }

    #[test]
    fn attempts_round_trip_through_json() {
        let mut a = SaltAttempts::default();
        a.record(12_345_678_901);
        let back: SaltAttempts = serde_json::from_value(serde_json::to_value(&a).unwrap()).unwrap();
        assert_eq!(back, a);
    }
}
