use crate::salts::Salts;

const REPLAY_VALID_FOR: u32 = 21 * 24 * 60 * 60;
/// The GC stamps `processing_through` 20 minutes after the match ends.
const PROCESSED_AFTER_END: u32 = 20 * 60;
const DURATION_TOLERANCE: u32 = 5;

/// A `CMsgClientToGCGetMatchMetaDataResponse` as read from memory. Zero means unset.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Reply {
    pub metadata_salt: u32,
    pub replay_salt: u32,
    pub cluster_id: u32,
    pub valid_through: u32,
    pub processing_through: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnownMatch {
    pub match_id: u64,
    pub start: u32,
    pub duration: u32,
    pub players: Option<Vec<u32>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pairing {
    /// Start and duration both agree with the reply.
    Exact,
    /// The reply carries no `processing_through`, so only the start could be compared.
    StartOnly,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Paired {
    pub salts: Salts,
    pub pairing: Pairing,
    pub players: Option<Vec<u32>>,
}

/// Pairs each reply to the one known match that starts in the second it implies. A reply whose
/// second holds more than one match id is dropped rather than guessed.
pub fn pair(replies: &[Reply], known: &[KnownMatch]) -> Vec<Paired> {
    replies.iter().filter_map(|reply| pair_one(reply, known)).collect()
}

fn pair_one(reply: &Reply, known: &[KnownMatch]) -> Option<Paired> {
    if reply.metadata_salt == 0 {
        return None;
    }
    let start = reply.valid_through.checked_sub(REPLAY_VALID_FOR)?;
    let mut same = known.iter().filter(|k| k.start == start);
    let first = same.next()?;
    let same: Vec<&KnownMatch> = std::iter::once(first).chain(same).collect();
    if same.iter().any(|k| k.match_id != first.match_id) {
        return None;
    }

    let pairing = if reply.processing_through == 0 {
        Pairing::StartOnly
    } else {
        let duration = reply.processing_through.checked_sub(PROCESSED_AFTER_END)?.checked_sub(start)?;
        if !same.iter().any(|k| k.duration.abs_diff(duration) <= DURATION_TOLERANCE) {
            return None;
        }
        Pairing::Exact
    };

    Some(Paired {
        salts: Salts {
            match_id: first.match_id,
            cluster_id: Some(reply.cluster_id),
            metadata_salt: Some(reply.metadata_salt),
            replay_salt: (reply.replay_salt != 0).then_some(reply.replay_salt),
            username: None,
        },
        pairing,
        players: same.iter().find_map(|k| k.players.clone()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const S2_MATCH: u64 = 119_698_824;
    const S2_START: u32 = 1_792_344_591;
    const S2_DURATION: u32 = 2487;

    fn s2_reply() -> Reply {
        Reply {
            metadata_salt: 188_785_897,
            replay_salt: 1_703_251_564,
            cluster_id: 429,
            valid_through: 1_794_158_991,
            processing_through: 1_792_348_278,
        }
    }

    fn known(match_id: u64, start: u32, duration: u32) -> KnownMatch {
        KnownMatch { match_id, start, duration, players: None }
    }

    #[test]
    fn upstream_fixture_pairs_exactly() {
        let reply = Reply {
            metadata_salt: 1_285_305_573,
            replay_salt: 1_330_069_048,
            cluster_id: 118,
            valid_through: 1_793_964_876,
            processing_through: 1_792_153_272,
        };
        let known = [known(117_930_000, 1_792_140_000, 1800), known(117_936_520, 1_792_150_476, 1596)];
        let paired = pair(&[reply], &known);
        assert_eq!(paired.len(), 1);
        assert_eq!(paired[0].pairing, Pairing::Exact);
        assert_eq!(
            paired[0].salts,
            Salts {
                match_id: 117_936_520,
                cluster_id: Some(118),
                metadata_salt: Some(1_285_305_573),
                replay_salt: Some(1_330_069_048),
                username: None,
            }
        );
    }

    #[test]
    fn live_s2_reply_pairs_exactly_and_carries_players() {
        let mut row = known(S2_MATCH, S2_START, S2_DURATION);
        let info = KnownMatch { players: Some(vec![1, 2, 3]), ..row.clone() };
        row.players = None;
        let paired = pair(&[s2_reply()], &[row, info]);
        assert_eq!(paired.len(), 1);
        assert_eq!(paired[0].pairing, Pairing::Exact);
        assert_eq!(paired[0].salts.match_id, S2_MATCH);
        assert_eq!(paired[0].salts.cluster_id, Some(429));
        assert_eq!(paired[0].salts.metadata_salt, Some(188_785_897));
        assert_eq!(paired[0].salts.replay_salt, Some(1_703_251_564));
        assert_eq!(paired[0].players, Some(vec![1, 2, 3]));
    }

    #[test]
    fn duration_tolerance_is_five_seconds() {
        for off in [5, -5] {
            let paired = pair(&[s2_reply()], &[known(S2_MATCH, S2_START, S2_DURATION.saturating_add_signed(off))]);
            assert_eq!(paired.len(), 1, "off by {off}s");
        }
        for off in [6, -6] {
            let paired = pair(&[s2_reply()], &[known(S2_MATCH, S2_START, S2_DURATION.saturating_add_signed(off))]);
            assert!(paired.is_empty(), "off by {off}s");
        }
    }

    #[test]
    fn two_matches_starting_in_the_same_second_are_dropped() {
        let known = [known(S2_MATCH, S2_START, S2_DURATION), known(S2_MATCH + 1, S2_START, S2_DURATION)];
        assert!(pair(&[s2_reply()], &known).is_empty());
    }

    #[test]
    fn several_sources_for_one_match_are_not_ambiguous() {
        let known = [known(S2_MATCH, S2_START, S2_DURATION), known(S2_MATCH, S2_START, S2_DURATION)];
        assert_eq!(pair(&[s2_reply()], &known).len(), 1);
    }

    #[test]
    fn no_match_at_that_second_pairs_nothing() {
        assert!(pair(&[s2_reply()], &[known(S2_MATCH, S2_START + 1, S2_DURATION)]).is_empty());
    }

    #[test]
    fn old_reply_without_processing_time_pairs_on_start_only() {
        let reply = Reply {
            metadata_salt: 509_425_845,
            replay_salt: 0,
            cluster_id: 390,
            valid_through: 1_789_986_459,
            processing_through: 0,
        };
        let paired = pair(&[reply], &[known(102_823_834, 1_788_172_059, 1483)]);
        assert_eq!(paired.len(), 1);
        assert_eq!(paired[0].pairing, Pairing::StartOnly);
        assert_eq!(paired[0].salts.match_id, 102_823_834);
        assert_eq!(paired[0].salts.metadata_salt, Some(509_425_845));
        assert_eq!(paired[0].salts.replay_salt, None);
    }

    #[test]
    fn zero_replay_salt_is_none() {
        let reply = Reply { replay_salt: 0, ..s2_reply() };
        let paired = pair(&[reply], &[known(S2_MATCH, S2_START, S2_DURATION)]);
        assert_eq!(paired.len(), 1);
        assert_eq!(paired[0].salts.replay_salt, None);
    }

    #[test]
    fn zero_metadata_salt_pairs_nothing() {
        let reply = Reply { metadata_salt: 0, ..s2_reply() };
        assert!(pair(&[reply], &[known(S2_MATCH, S2_START, S2_DURATION)]).is_empty());
    }

    #[test]
    fn timestamps_too_small_to_imply_a_start_pair_nothing() {
        let reply = Reply { valid_through: 100, processing_through: 50, ..s2_reply() };
        assert!(pair(&[reply], &[known(S2_MATCH, 0, 0)]).is_empty());
    }
}
