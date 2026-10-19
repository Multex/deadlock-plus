use std::cmp::Reverse;
use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::salts::Salts;

pub const CAP: usize = 10_000;
pub const VERSION: u32 = 1;

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    Steam,
    Deadlock,
    Login,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub struct Entry {
    pub match_id: u64,
    pub cluster_id: Option<u32>,
    pub metadata_salt: Option<u32>,
    pub replay_salt: Option<u32>,
    pub details_at: Option<i64>,
    pub replay_at: Option<i64>,
    pub source: Source,
    pub at: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
struct Held {
    match_id: u64,
    cluster_id: Option<u32>,
    replay_salt: u32,
    at: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "Stored", into = "Stored")]
pub struct SaltRecord {
    entries: HashMap<u64, Entry>,
    held: HashMap<u64, Held>,
}

#[derive(Serialize, Deserialize)]
struct Stored {
    version: u32,
    entries: Vec<Entry>,
    #[serde(default)]
    held: Vec<Held>,
}

impl TryFrom<Stored> for SaltRecord {
    type Error = String;

    fn try_from(stored: Stored) -> Result<Self, Self::Error> {
        if stored.version != VERSION {
            return Err(format!("unsupported salt record version {}", stored.version));
        }
        let mut record = Self {
            entries: stored.entries.into_iter().map(|e| (e.match_id, e)).collect(),
            held: stored.held.into_iter().map(|h| (h.match_id, h)).collect(),
        };
        record.trim();
        Ok(record)
    }
}

impl From<SaltRecord> for Stored {
    fn from(record: SaltRecord) -> Self {
        let mut held: Vec<Held> = record.held.values().copied().collect();
        held.sort_unstable_by_key(|h| Reverse((h.at, h.match_id)));
        Self { version: VERSION, entries: record.recent(usize::MAX), held }
    }
}

impl SaltRecord {
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// A salts carrying a metadata salt also picks up the replay salt held for its match.
    pub fn unsent(&self, salts: &Salts) -> Option<Salts> {
        let held =
            self.held.get(&salts.match_id).filter(|_| salts.metadata_salt.is_some() && salts.replay_salt.is_none());
        let salts = &Salts {
            replay_salt: salts.replay_salt.or(held.map(|h| h.replay_salt)),
            cluster_id: salts.cluster_id.or(held.and_then(|h| h.cluster_id)),
            ..*salts
        };
        let entry = self.entries.get(&salts.match_id);
        let metadata_salt = salts.metadata_salt.filter(|_| entry.is_none_or(|e| e.details_at.is_none()));
        let replay_salt = salts.replay_salt.filter(|_| entry.is_none_or(|e| e.replay_at.is_none()));
        if metadata_salt.is_none() && replay_salt.is_none() {
            return None;
        }
        Some(Salts { metadata_salt, replay_salt, ..*salts })
    }

    /// Gives a replay salt that lacks one the metadata salt (and cluster) already sent for its match,
    /// since the API never serves a replay stored without its metadata salt.
    pub fn join(&self, salts: &mut Salts) -> bool {
        if salts.metadata_salt.is_some() || salts.replay_salt.is_none() {
            return false;
        }
        let Some(entry) = self.entries.get(&salts.match_id) else { return false };
        let Some(metadata_salt) = entry.metadata_salt else { return false };
        salts.metadata_salt = Some(metadata_salt);
        salts.cluster_id = salts.cluster_id.or(entry.cluster_id);
        true
    }

    /// Records a successful send. `source` and `at` follow the latest send that added a salt;
    /// a resend of known salts changes nothing and returns `false`.
    pub fn mark(&mut self, salts: &Salts, source: Source, now: i64) -> bool {
        if salts.metadata_salt.is_none() && salts.replay_salt.is_none() {
            return false;
        }
        let entry = self.entries.entry(salts.match_id).or_insert(Entry {
            match_id: salts.match_id,
            cluster_id: None,
            metadata_salt: None,
            replay_salt: None,
            details_at: None,
            replay_at: None,
            source,
            at: now,
        });
        let mut changed = false;
        if salts.metadata_salt.is_some() && entry.details_at.is_none() {
            entry.metadata_salt = salts.metadata_salt;
            entry.details_at = Some(now);
            changed = true;
        }
        if salts.replay_salt.is_some() && entry.replay_at.is_none() {
            entry.replay_salt = salts.replay_salt;
            entry.replay_at = Some(now);
            self.held.remove(&salts.match_id);
            changed = true;
        }
        if changed {
            entry.cluster_id = entry.cluster_id.or(salts.cluster_id);
            entry.source = source;
            entry.at = now;
            self.trim();
        }
        changed
    }

    /// Keeps a replay salt whose metadata salt is not known yet, since the API never serves a replay stored
    /// without one. [`Self::unsent`] hands it back once that metadata salt turns up. Held salts are not sent, so
    /// [`Self::recent`] and [`Self::sent_at`] never show them.
    pub fn hold(&mut self, salts: &Salts, now: i64) -> bool {
        let Some(replay_salt) = salts.replay_salt.filter(|_| salts.metadata_salt.is_none()) else { return false };
        let known =
            self.entries.get(&salts.match_id).is_some_and(|e| e.metadata_salt.is_some() || e.replay_at.is_some());
        if known || self.held.contains_key(&salts.match_id) {
            return false;
        }
        self.held.insert(
            salts.match_id,
            Held { match_id: salts.match_id, cluster_id: salts.cluster_id, replay_salt, at: now },
        );
        self.trim();
        true
    }

    pub fn get(&self, match_id: u64) -> Option<&Entry> {
        self.entries.get(&match_id)
    }

    pub fn is_held(&self, match_id: u64) -> bool {
        self.held.contains_key(&match_id)
    }

    pub fn recent(&self, n: usize) -> Vec<Entry> {
        let mut entries: Vec<Entry> = self.entries.values().copied().collect();
        entries.sort_unstable_by_key(|e| Reverse((e.at, e.match_id)));
        entries.truncate(n);
        entries
    }

    pub fn sent_at(&self, match_id: u64) -> Option<i64> {
        self.entries.get(&match_id).map(|e| e.at)
    }

    fn trim(&mut self) {
        trim_oldest(&mut self.entries, |e| e.at);
        trim_oldest(&mut self.held, |h| h.at);
    }
}

fn trim_oldest<T>(map: &mut HashMap<u64, T>, at: impl Fn(&T) -> i64) {
    let excess = map.len().saturating_sub(CAP);
    if excess == 0 {
        return;
    }
    let mut order: Vec<(i64, u64)> = map.iter().map(|(id, v)| (at(v), *id)).collect();
    order.select_nth_unstable(excess - 1);
    for (_, match_id) in &order[..excess] {
        map.remove(match_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn full(id: u64) -> Salts {
        Salts { match_id: id, cluster_id: Some(7), metadata_salt: Some(11), replay_salt: Some(22), username: None }
    }

    fn meta_only(id: u64) -> Salts {
        Salts { replay_salt: None, ..full(id) }
    }

    fn replay_only(id: u64) -> Salts {
        Salts { cluster_id: None, metadata_salt: None, ..full(id) }
    }

    #[test]
    fn sources_share_one_entry_per_match() {
        let mut record = SaltRecord::default();
        assert!(record.mark(&meta_only(5), Source::Steam, 100));
        assert!(record.mark(&full(5), Source::Login, 200));

        assert_eq!(record.len(), 1);
        let entry = record.recent(10)[0];
        assert_eq!(entry.details_at, Some(100));
        assert_eq!(entry.replay_at, Some(200));
        assert_eq!(entry.source, Source::Login);
        assert_eq!(entry.at, 200);
        assert_eq!(record.sent_at(5), Some(200));
    }

    #[test]
    fn a_resend_from_another_source_changes_nothing() {
        let mut record = SaltRecord::default();
        record.mark(&full(5), Source::Steam, 100);
        assert!(!record.mark(&full(5), Source::Login, 200));

        let entry = record.recent(1)[0];
        assert_eq!(
            (entry.source, entry.at, entry.details_at, entry.replay_at),
            (Source::Steam, 100, Some(100), Some(100))
        );
    }

    #[test]
    fn unsent_returns_only_the_missing_part() {
        let mut record = SaltRecord::default();
        record.mark(&meta_only(5), Source::Steam, 100);

        let missing = record.unsent(&full(5)).unwrap();
        assert_eq!(missing.metadata_salt, None);
        assert_eq!(missing.replay_salt, Some(22));
        assert_eq!(missing.cluster_id, Some(7));
        assert_eq!(record.unsent(&meta_only(5)), None);
    }

    #[test]
    fn unsent_passes_unknown_matches_through() {
        let record = SaltRecord::default();
        assert_eq!(record.unsent(&full(5)), Some(full(5)));
        assert_eq!(record.unsent(&Salts { metadata_salt: None, replay_salt: None, ..full(5) }), None);
    }

    #[test]
    fn a_second_identical_send_is_not_unsent() {
        let mut record = SaltRecord::default();
        let salts = record.unsent(&full(5)).unwrap();
        record.mark(&salts, Source::Deadlock, 100);
        assert_eq!(record.unsent(&full(5)), None);
    }

    #[test]
    fn join_fills_metadata_salt_and_cluster_from_the_record() {
        let mut record = SaltRecord::default();
        record.mark(&meta_only(5), Source::Steam, 100);

        let mut salts = replay_only(5);
        assert!(record.join(&mut salts));
        assert_eq!(salts, full(5));
    }

    #[test]
    fn join_without_a_known_metadata_salt_changes_nothing() {
        let mut record = SaltRecord::default();
        let mut salts = replay_only(5);
        assert!(!record.join(&mut salts));
        assert_eq!(salts, replay_only(5));

        record.mark(&replay_only(5), Source::Steam, 100);
        assert!(!record.join(&mut salts));
        assert_eq!(salts, replay_only(5));
    }

    #[test]
    fn join_leaves_salts_that_carry_a_metadata_salt_alone() {
        let mut record = SaltRecord::default();
        record.mark(&Salts { metadata_salt: Some(99), cluster_id: Some(1), ..meta_only(5) }, Source::Steam, 100);
        let mut salts = full(5);
        assert!(!record.join(&mut salts));
        assert_eq!(salts, full(5));
    }

    #[test]
    fn recent_is_newest_first() {
        let mut record = SaltRecord::default();
        record.mark(&full(1), Source::Steam, 300);
        record.mark(&full(2), Source::Steam, 100);
        record.mark(&full(3), Source::Steam, 200);
        let ids: Vec<u64> = record.recent(2).iter().map(|e| e.match_id).collect();
        assert_eq!(ids, [1, 3]);
        assert_eq!(record.sent_at(4), None);
    }

    #[test]
    fn cap_evicts_the_oldest_entries() {
        let mut record = SaltRecord::default();
        for id in 0..CAP as u64 {
            record.mark(&full(id + 1), Source::Steam, 1_000 + id as i64);
        }
        record.mark(&full(CAP as u64 + 1), Source::Login, 50_000);

        assert_eq!(record.len(), CAP);
        assert_eq!(record.sent_at(1), None);
        assert_eq!(record.sent_at(2), Some(1_001));
        assert_eq!(record.sent_at(CAP as u64 + 1), Some(50_000));
    }

    #[test]
    fn serde_roundtrip_keeps_every_entry() {
        let mut record = SaltRecord::default();
        record.mark(&meta_only(5), Source::Steam, 100);
        record.mark(&full(6), Source::Deadlock, 200);
        record.mark(&replay_only(7), Source::Login, 300);

        let json = serde_json::to_value(&record).unwrap();
        assert_eq!(json["version"], 1);
        assert_eq!(json["entries"][0]["source"], "login");
        let back: SaltRecord = serde_json::from_value(json).unwrap();
        assert_eq!(back, record);
    }

    #[test]
    fn a_future_version_is_rejected() {
        let json = serde_json::json!({ "version": 2, "entries": [] });
        let err = serde_json::from_value::<SaltRecord>(json).unwrap_err();
        assert!(err.to_string().contains("version 2"), "{err}");
    }

    #[test]
    fn loading_an_oversized_file_keeps_the_newest() {
        let entries: Vec<Entry> = (0..CAP as u64 + 2)
            .map(|id| Entry {
                match_id: id + 1,
                cluster_id: None,
                metadata_salt: Some(1),
                replay_salt: None,
                details_at: Some(id as i64),
                replay_at: None,
                source: Source::Steam,
                at: id as i64,
            })
            .collect();
        let json = serde_json::json!({ "version": 1, "entries": entries });
        let record: SaltRecord = serde_json::from_value(json).unwrap();
        assert_eq!(record.len(), CAP);
        assert_eq!(record.sent_at(1), None);
        assert_eq!(record.sent_at(3), Some(2));
    }
    #[test]
    fn a_held_replay_salt_goes_out_with_the_metadata_salt_once() {
        let mut record = SaltRecord::default();
        assert!(record.hold(&replay_only(5), 100));
        assert!(record.recent(10).is_empty());
        assert_eq!(record.sent_at(5), None);

        let batch = record.unsent(&meta_only(5)).unwrap();
        assert_eq!(batch, full(5));
        assert!(record.mark(&batch, Source::Deadlock, 200));

        let entry = record.recent(10)[0];
        assert_eq!((entry.details_at, entry.replay_at, entry.source), (Some(200), Some(200), Source::Deadlock));
        assert_eq!(record.unsent(&meta_only(5)), None);
        assert_eq!(record.unsent(&full(5)), None);
        assert!(!record.hold(&replay_only(5), 300));
    }

    #[test]
    fn a_held_replay_salt_brings_its_cluster() {
        let mut record = SaltRecord::default();
        record.hold(&Salts { cluster_id: Some(9), ..replay_only(5) }, 100);
        let batch = record.unsent(&Salts { cluster_id: None, ..meta_only(5) }).unwrap();
        assert_eq!(batch.cluster_id, Some(9));
        assert_eq!(batch.replay_salt, Some(22));
    }

    #[test]
    fn a_replay_salt_is_not_held_once_its_metadata_salt_is_known() {
        let mut record = SaltRecord::default();
        record.mark(&meta_only(5), Source::Steam, 100);
        assert!(!record.hold(&replay_only(5), 200));
        assert_eq!(record.unsent(&meta_only(5)), None);
    }

    #[test]
    fn only_a_lone_replay_salt_is_held() {
        let mut record = SaltRecord::default();
        assert!(!record.hold(&meta_only(5), 100));
        assert!(!record.hold(&full(5), 100));
        assert!(!record.hold(&Salts { replay_salt: None, ..replay_only(5) }, 100));
        assert_eq!(record.unsent(&meta_only(5)), Some(meta_only(5)));
    }

    #[test]
    fn holding_again_keeps_the_first_salt() {
        let mut record = SaltRecord::default();
        assert!(record.hold(&replay_only(5), 100));
        assert!(!record.hold(&Salts { replay_salt: Some(33), ..replay_only(5) }, 200));
        assert_eq!(record.unsent(&meta_only(5)).unwrap().replay_salt, Some(22));
    }

    #[test]
    fn a_held_salt_is_not_sent_by_a_metadata_only_mark_without_it() {
        let mut record = SaltRecord::default();
        record.hold(&replay_only(5), 100);
        record.mark(&meta_only(5), Source::Steam, 200);
        let entry = record.recent(1)[0];
        assert_eq!(entry.replay_at, None);
        assert_eq!(record.unsent(&meta_only(5)).unwrap(), Salts { metadata_salt: None, ..full(5) });
    }

    #[test]
    fn held_salts_survive_a_serde_roundtrip() {
        let mut record = SaltRecord::default();
        record.hold(&replay_only(5), 100);
        record.mark(&full(6), Source::Steam, 200);
        let back: SaltRecord = serde_json::from_value(serde_json::to_value(&record).unwrap()).unwrap();
        assert_eq!(back, record);
        assert_eq!(back.unsent(&meta_only(5)), Some(full(5)));
    }

    #[test]
    fn get_returns_a_sent_match_and_never_a_held_one() {
        let mut record = SaltRecord::default();
        record.mark(&meta_only(5), Source::Login, 100);
        record.hold(&replay_only(6), 100);

        let entry = record.get(5).unwrap();
        assert_eq!((entry.match_id, entry.metadata_salt, entry.cluster_id), (5, Some(11), Some(7)));
        assert_eq!(record.get(6), None);
        assert_eq!(record.get(7), None);
    }

    #[test]
    fn a_held_match_reads_as_held_until_its_replay_salt_is_sent() {
        let mut record = SaltRecord::default();
        assert!(!record.is_held(5));
        record.hold(&replay_only(5), 100);
        assert!(record.is_held(5));
        assert!(!record.is_held(6));

        record.mark(&full(5), Source::Steam, 200);
        assert!(!record.is_held(5));
    }

    #[test]
    fn a_file_without_held_salts_still_loads() {
        let json = serde_json::json!({ "version": 1, "entries": [] });
        let record: SaltRecord = serde_json::from_value(json).unwrap();
        assert!(record.is_empty());
    }
}
