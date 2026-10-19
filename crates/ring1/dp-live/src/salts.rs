use std::panic::{catch_unwind, AssertUnwindSafe};

use deadlock_reader::Reader;
use deadlock_walker::{Error as WalkerError, GcSession, ResidentSalts};

use crate::link::PlatformReader;
use crate::{Context, LiveFacts, Phase};

/// A `GetMatchMetaData` reply resident in the client.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MemoryReply {
    pub metadata_salt: u32,
    pub replay_salt: Option<u32>,
    pub cluster: u32,
    pub valid_through: u32,
    pub processing_through: Option<u32>,
}

/// A match the client knows the start of: a history row or opened match metadata.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MemoryMatch {
    pub match_id: u64,
    pub start: u32,
    pub duration: u32,
    /// Account ids of the players, when the source lists them.
    pub players: Option<Vec<u32>>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Resident {
    pub replies: Vec<MemoryReply>,
    pub matches: Vec<MemoryMatch>,
}

/// Reads the match salts resident in the attached game. Holds its own Game Coordinator session, rebuilt when the game
/// restarts or the account changes.
#[derive(Debug, Default)]
pub struct MemorySalts {
    session: Option<GcSession>,
    missing: Option<String>,
}

impl MemorySalts {
    pub fn read(&mut self, reader: &PlatformReader, account: u32) -> Result<Resident, String> {
        // The walker reads foreign process memory; a bug in that walk must not take the app down.
        catch_unwind(AssertUnwindSafe(|| self.read_session(reader, account))).unwrap_or_else(|_| {
            self.session = None;
            Err("match salts read panicked".to_string())
        })
    }

    fn read_session(&mut self, reader: &Reader, account: u32) -> Result<Resident, String> {
        let read = match self.session(reader, account)?.match_salts(reader.memory()) {
            Err(WalkerError::WrongProcess) => {
                self.session = None;
                self.session(reader, account)?.match_salts(reader.memory())
            }
            read => read,
        };
        settle(&mut self.missing, read)
    }

    fn session(&mut self, reader: &Reader, account: u32) -> Result<&mut GcSession, String> {
        let session = match self.session.take() {
            Some(session) if session.account_id() == account => session,
            _ => GcSession::new(reader.memory(), account).map_err(|e| format!("match salts session not built: {e}"))?,
        };
        Ok(self.session.insert(session))
    }
}

/// Whether a memory read may run now. A walk of the heap during a match could cost frames, so only the Hideout, other
/// maps and the post-game screen read; anything the reader is unsure of reads as in a match.
pub fn may_read(facts: Option<&LiveFacts>) -> bool {
    let Some(facts) = facts.filter(|facts| !facts.drift) else { return false };
    match facts.context {
        Context::Hideout | Context::Other => true,
        Context::Match => facts.phase == Some(Phase::PostGame),
    }
}

/// A class or layout the client lacks after a game update reads as nothing, logged once until a read succeeds.
fn settle(missing: &mut Option<String>, read: Result<ResidentSalts, WalkerError>) -> Result<Resident, String> {
    match read {
        Ok(salts) => {
            *missing = None;
            Ok(from_resident(&salts))
        }
        Err(e @ (WalkerError::ClassNotFound(_) | WalkerError::NoLayout(_))) => {
            let reason = e.to_string();
            if missing.as_ref() != Some(&reason) {
                log::warn!("match salts unavailable: {reason}");
                *missing = Some(reason);
            }
            Ok(Resident::default())
        }
        Err(e) => Err(format!("match salts not readable: {e}")),
    }
}

fn from_resident(salts: &ResidentSalts) -> Resident {
    let replies = salts.replies.iter().map(|r| MemoryReply {
        metadata_salt: r.metadata_salt(),
        replay_salt: nonzero(r.replay_salt()),
        cluster: r.replay_group_id(),
        valid_through: r.replay_valid_through(),
        processing_through: nonzero(r.replay_processing_through()),
    });
    let rows = salts.rows.iter().map(|r| MemoryMatch {
        match_id: r.match_id(),
        start: r.start_time(),
        duration: r.match_duration_s(),
        players: None,
    });
    let metadata = salts.metadata.iter().filter_map(|m| {
        let info = m.match_info.as_ref()?;
        let players: Vec<u32> = info.players.iter().filter_map(|p| p.account_id).collect();
        Some(MemoryMatch {
            match_id: info.match_id?,
            start: info.start_time.filter(|&start| start > 0)?,
            duration: info.duration_s(),
            players: (!players.is_empty()).then_some(players),
        })
    });
    Resident { replies: replies.collect(), matches: rows.chain(metadata).collect() }
}

fn nonzero(value: u32) -> Option<u32> {
    (value != 0).then_some(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn facts(context: Context, phase: Option<Phase>) -> LiveFacts {
        LiveFacts { context, phase, ..LiveFacts::default() }
    }

    #[test]
    fn may_read_only_outside_a_running_match() {
        let cases = [
            (facts(Context::Match, Some(Phase::MatchIntro)), false),
            (facts(Context::Match, Some(Phase::Loading)), false),
            (facts(Context::Match, Some(Phase::PreGame)), false),
            (facts(Context::Match, Some(Phase::InProgress)), false),
            (facts(Context::Match, None), false),
            (facts(Context::Match, Some(Phase::PostGame)), true),
            (facts(Context::Hideout, None), true),
            (facts(Context::Other, None), true),
        ];
        for (facts, expected) in cases {
            assert_eq!(may_read(Some(&facts)), expected, "{:?} {:?}", facts.context, facts.phase);
        }
    }

    #[test]
    fn drift_or_no_facts_never_reads() {
        assert!(!may_read(None));
        for context in [Context::Hideout, Context::Other, Context::Match] {
            let facts = LiveFacts { drift: true, ..facts(context, Some(Phase::PostGame)) };
            assert!(!may_read(Some(&facts)), "{context:?}");
        }
    }

    fn with_reply(salts: &mut ResidentSalts, metadata: u32, replay: u32, cluster: u32, valid: u32, processing: u32) {
        salts.replies.push(Default::default());
        let r = salts.replies.last_mut().unwrap();
        r.result = Some(1);
        r.metadata_salt = Some(metadata);
        r.replay_salt = Some(replay);
        r.replay_group_id = Some(cluster);
        r.replay_valid_through = Some(valid);
        r.replay_processing_through = Some(processing);
    }

    fn with_row(salts: &mut ResidentSalts, match_id: u64, start: u32, duration: u32) {
        salts.rows.push(Default::default());
        let r = salts.rows.last_mut().unwrap();
        r.match_id = Some(match_id);
        r.start_time = Some(start);
        r.match_duration_s = Some(duration);
        r.hero_id = Some(7);
    }

    fn with_metadata(salts: &mut ResidentSalts, match_id: u64, start: u32, duration: u32, players: &[Option<u32>]) {
        salts.metadata.push(Default::default());
        let info = salts.metadata.last_mut().unwrap().match_info.insert(Default::default());
        info.match_id = Some(match_id);
        info.start_time = Some(start);
        info.duration_s = Some(duration);
        for &account_id in players {
            info.players.push(Default::default());
            info.players.last_mut().unwrap().account_id = account_id;
        }
    }

    #[test]
    fn replies_map_field_for_field() {
        let mut salts = ResidentSalts::default();
        with_reply(&mut salts, 188_785_897, 1_703_251_564, 429, 1_794_158_991, 1_792_348_278);
        assert_eq!(
            from_resident(&salts).replies,
            [MemoryReply {
                metadata_salt: 188_785_897,
                replay_salt: Some(1_703_251_564),
                cluster: 429,
                valid_through: 1_794_158_991,
                processing_through: Some(1_792_348_278),
            }]
        );
    }

    #[test]
    fn zero_replay_salt_and_processing_time_are_none() {
        let mut salts = ResidentSalts::default();
        with_reply(&mut salts, 509_425_845, 0, 390, 1_789_986_459, 0);
        let reply = from_resident(&salts).replies[0];
        assert_eq!(reply.replay_salt, None);
        assert_eq!(reply.processing_through, None);
        assert_eq!(reply.metadata_salt, 509_425_845);
    }

    #[test]
    fn unset_replay_salt_and_processing_time_are_none() {
        let mut salts = ResidentSalts::default();
        with_reply(&mut salts, 1, 1, 1, 1, 1);
        salts.replies[0].replay_salt = None;
        salts.replies[0].replay_processing_through = None;
        let reply = from_resident(&salts).replies[0];
        assert_eq!((reply.replay_salt, reply.processing_through), (None, None));
    }

    #[test]
    fn history_rows_are_matches_without_players() {
        let mut salts = ResidentSalts::default();
        with_row(&mut salts, 119_698_824, 1_792_344_591, 2487);
        assert_eq!(
            from_resident(&salts).matches,
            [MemoryMatch { match_id: 119_698_824, start: 1_792_344_591, duration: 2487, players: None }]
        );
    }

    #[test]
    fn metadata_carries_the_players_account_ids() {
        let mut salts = ResidentSalts::default();
        with_row(&mut salts, 1, 100, 10);
        with_metadata(&mut salts, 2, 200, 20, &[Some(11), None, Some(12)]);
        with_metadata(&mut salts, 3, 300, 30, &[None]);
        assert_eq!(
            from_resident(&salts).matches,
            [
                MemoryMatch { match_id: 1, start: 100, duration: 10, players: None },
                MemoryMatch { match_id: 2, start: 200, duration: 20, players: Some(vec![11, 12]) },
                MemoryMatch { match_id: 3, start: 300, duration: 30, players: None },
            ]
        );
    }

    #[test]
    fn metadata_without_a_start_is_left_out() {
        let mut salts = ResidentSalts::default();
        with_metadata(&mut salts, 2, 200, 20, &[Some(11)]);
        salts.metadata[0].match_info.as_mut().unwrap().start_time = None;
        salts.metadata.push(Default::default());
        assert!(from_resident(&salts).matches.is_empty());
    }

    #[test]
    fn a_missing_class_reads_as_nothing_and_is_noted_once() {
        let mut missing = None;
        let gone = || Err(WalkerError::ClassNotFound("CMsgClientToGCGetMatchMetaDataResponse".to_string()));
        assert_eq!(settle(&mut missing, gone()), Ok(Resident::default()));
        let noted = missing.clone();
        assert!(noted.is_some());
        assert_eq!(settle(&mut missing, gone()), Ok(Resident::default()));
        assert_eq!(missing, noted);

        let mut salts = ResidentSalts::default();
        with_row(&mut salts, 1, 100, 10);
        assert_eq!(settle(&mut missing, Ok(salts)).map(|r| r.matches.len()), Ok(1));
        assert_eq!(missing, None);
    }

    #[test]
    fn other_walker_errors_are_errors() {
        let mut missing = None;
        assert!(settle(&mut missing, Err(WalkerError::WrongProcess)).is_err());
        assert_eq!(missing, None);
    }
}
