use std::collections::hash_map::Entry;
use std::collections::HashMap;

use crate::salts::Salts;

/// One entry per match id, in first-seen order. Fields are unioned; on a conflict the first value
/// seen wins.
pub fn merge(salts: impl IntoIterator<Item = Salts>) -> Vec<Salts> {
    let mut merged: Vec<Salts> = Vec::new();
    let mut index: HashMap<u64, usize> = HashMap::new();
    for next in salts {
        match index.entry(next.match_id) {
            Entry::Vacant(slot) => {
                slot.insert(merged.len());
                merged.push(next);
            }
            Entry::Occupied(slot) => {
                let kept = &mut merged[*slot.get()];
                kept.cluster_id = kept.cluster_id.or(next.cluster_id);
                kept.metadata_salt = kept.metadata_salt.or(next.metadata_salt);
                kept.replay_salt = kept.replay_salt.or(next.replay_salt);
                kept.username = kept.username.or(next.username);
            }
        }
    }
    merged
}

#[cfg(test)]
mod tests {
    use super::*;

    fn salts(match_id: u64, metadata_salt: Option<u32>, replay_salt: Option<u32>) -> Salts {
        Salts { match_id, cluster_id: Some(429), metadata_salt, replay_salt, username: None }
    }

    #[test]
    fn url_replay_salt_and_reply_for_one_match_become_one_entry() {
        let url = Salts::from_url("http://replay429.valve.net/1422450/119698824_1703251564.dem.bz2", Some(7)).unwrap();
        let reply = salts(119_698_824, Some(188_785_897), None);
        assert_eq!(
            merge([url, reply]),
            vec![Salts {
                match_id: 119_698_824,
                cluster_id: Some(429),
                metadata_salt: Some(188_785_897),
                replay_salt: Some(1_703_251_564),
                username: Some(7),
            }]
        );
    }

    #[test]
    fn first_value_wins_on_conflict() {
        let first = Salts { cluster_id: Some(1), ..salts(5, Some(10), None) };
        let second = Salts { cluster_id: Some(2), username: Some(9), ..salts(5, Some(20), Some(30)) };
        assert_eq!(
            merge([first, second]),
            vec![Salts {
                match_id: 5,
                cluster_id: Some(1),
                metadata_salt: Some(10),
                replay_salt: Some(30),
                username: Some(9)
            }]
        );
    }

    #[test]
    fn distinct_matches_keep_first_seen_order() {
        let merged = merge([salts(3, Some(1), None), salts(1, Some(2), None), salts(3, None, Some(4))]);
        assert_eq!(merged.iter().map(|s| s.match_id).collect::<Vec<_>>(), [3, 1]);
        assert_eq!(merged[0].replay_salt, Some(4));
    }
}
