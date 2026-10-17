use std::time::{Duration, Instant};

use dp_live::{Context, LiveFacts, Phase};

/// How long the Hideout must show no queue before the queue counts as cancelled. Covers a probe that reads
/// `queueing == false` for a moment while the pop's map load starts.
pub const CANCEL_AFTER: Duration = Duration::from_secs(10);

/// What one poll of the game saw.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Seen {
    GameClosed,
    /// The game runs but there are no facts to read (`FactsFeed::poll` gave `None`).
    NoFacts,
    Facts(LiveFacts),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum State {
    #[default]
    Idle,
    /// The party is queueing. `not_queueing_since` is the first Hideout tick of a possible cancel.
    Armed { not_queueing_since: Option<Instant> },
    /// The pop was announced; waits for the Hideout before it can arm again.
    Fired,
}

/// Turns polled game facts into one "match found" edge per queue pop.
#[derive(Debug, Default)]
pub struct Detector {
    state: State,
}

impl Detector {
    #[cfg(test)]
    pub fn state(&self) -> State {
        self.state
    }

    /// True exactly on the tick a queued party's match starts loading.
    pub fn observe(&mut self, seen: Seen, now: Instant) -> bool {
        let facts = match seen {
            Seen::GameClosed => {
                self.state = State::Idle;
                return false;
            }
            Seen::NoFacts => return false,
            Seen::Facts(facts) => facts,
        };
        let queueing = facts.party.map(|party| party.queueing);
        match (self.state, facts.context) {
            (_, Context::Hideout) if queueing == Some(true) => {
                self.state = State::Armed { not_queueing_since: None };
            }
            (State::Idle | State::Fired, Context::Hideout) => self.state = State::Idle,
            (State::Armed { not_queueing_since }, Context::Hideout) if queueing == Some(false) => {
                let since = not_queueing_since.unwrap_or(now);
                self.state = if now.saturating_duration_since(since) >= CANCEL_AFTER {
                    State::Idle
                } else {
                    State::Armed { not_queueing_since: Some(since) }
                };
            }
            (State::Armed { .. }, Context::Match)
                if matches!(facts.phase, Some(Phase::MatchIntro | Phase::Loading | Phase::PreGame)) =>
            {
                self.state = State::Fired;
                return true;
            }
            _ => {}
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dp_live::{MatchMode, PartyFacts, Perspective};

    fn hideout(queueing: bool) -> Seen {
        Seen::Facts(LiveFacts {
            context: Context::Hideout,
            party: Some(PartyFacts { size: 1, queueing, ..Default::default() }),
            ..Default::default()
        })
    }

    fn in_match(phase: Option<Phase>) -> Seen {
        Seen::Facts(LiveFacts {
            context: Context::Match,
            phase,
            match_mode: Some(MatchMode::Unranked),
            party: Some(PartyFacts { size: 1, ..Default::default() }),
            ..Default::default()
        })
    }

    struct Clock {
        t0: Instant,
        d: Detector,
    }

    impl Clock {
        fn new() -> Self {
            Self { t0: Instant::now(), d: Detector::default() }
        }

        fn at(&mut self, secs: u64, seen: Seen) -> bool {
            self.d.observe(seen, self.t0 + Duration::from_secs(secs))
        }
    }

    #[test]
    fn a_queue_pop_fires_once_through_the_load_grace_replay() {
        let mut c = Clock::new();
        assert!(!c.at(0, hideout(true)));
        assert!(matches!(c.d.state(), State::Armed { .. }));
        assert!(!c.at(1, hideout(true)), "the load grace replays the last Hideout facts during the map load");
        assert!(!c.at(2, hideout(true)));
        assert!(c.at(4, in_match(Some(Phase::MatchIntro))));
        assert_eq!(c.d.state(), State::Fired);
        assert!(!c.at(5, in_match(Some(Phase::MatchIntro))));
        assert!(!c.at(9, in_match(Some(Phase::Loading))));
        assert!(!c.at(10, in_match(Some(Phase::PreGame))));
        assert!(!c.at(40, in_match(Some(Phase::InProgress))));
    }

    #[test]
    fn a_party_queue_arms_and_fires() {
        let party_queue = |queued_secs| {
            Seen::Facts(LiveFacts {
                context: Context::Hideout,
                party: Some(PartyFacts {
                    size: 2,
                    queueing: true,
                    queued_secs: Some(queued_secs),
                    ..Default::default()
                }),
                ..Default::default()
            })
        };
        let mut c = Clock::new();
        assert!(!c.at(0, party_queue(40)));
        assert!(matches!(c.d.state(), State::Armed { .. }));
        assert!(!c.at(1, party_queue(41)));
        assert!(c.at(3, in_match(Some(Phase::MatchIntro))));
    }

    #[test]
    fn loading_and_pregame_also_fire_when_the_intro_was_missed() {
        for phase in [Phase::Loading, Phase::PreGame] {
            let mut c = Clock::new();
            c.at(0, hideout(true));
            assert!(c.at(3, in_match(Some(phase))), "{phase:?}");
        }
    }

    #[test]
    fn a_match_already_in_progress_or_over_does_not_fire() {
        for phase in [Some(Phase::InProgress), Some(Phase::PostGame), None] {
            let mut c = Clock::new();
            c.at(0, hideout(true));
            assert!(!c.at(3, in_match(phase)), "{phase:?}");
        }
    }

    #[test]
    fn a_match_without_a_queue_never_fires() {
        let mut c = Clock::new();
        assert!(!c.at(0, in_match(Some(Phase::MatchIntro))), "reconnect or spectate");
        assert!(!c.at(1, hideout(false)));
        assert!(!c.at(2, in_match(Some(Phase::PreGame))));
        assert_eq!(c.d.state(), State::Idle);
    }

    #[test]
    fn a_cancel_lasting_ten_seconds_disarms() {
        let mut c = Clock::new();
        c.at(0, hideout(true));
        c.at(1, hideout(false));
        c.at(10, hideout(false));
        assert!(matches!(c.d.state(), State::Armed { .. }), "9 s is not a cancel yet");
        c.at(11, hideout(false));
        assert_eq!(c.d.state(), State::Idle);
        assert!(!c.at(12, in_match(Some(Phase::MatchIntro))));
    }

    #[test]
    fn a_short_queue_dip_keeps_the_arm() {
        let mut c = Clock::new();
        c.at(0, hideout(true));
        c.at(1, hideout(false));
        c.at(5, hideout(true));
        c.at(12, hideout(false));
        assert!(matches!(c.d.state(), State::Armed { .. }), "requeueing restarts the cancel clock");
        assert!(c.at(14, in_match(Some(Phase::MatchIntro))));
    }

    #[test]
    fn a_pop_right_after_a_queue_dip_still_fires() {
        let mut c = Clock::new();
        c.at(0, hideout(true));
        c.at(1, hideout(false));
        assert!(c.at(3, in_match(Some(Phase::MatchIntro))));
    }

    #[test]
    fn no_facts_neither_arm_nor_disarm() {
        let mut c = Clock::new();
        c.at(0, Seen::NoFacts);
        assert_eq!(c.d.state(), State::Idle);
        c.at(1, hideout(true));
        c.at(2, Seen::NoFacts);
        c.at(40, Seen::NoFacts);
        assert!(matches!(c.d.state(), State::Armed { .. }));
        assert!(c.at(41, in_match(Some(Phase::MatchIntro))));
    }

    #[test]
    fn closing_the_game_disarms() {
        let mut c = Clock::new();
        c.at(0, hideout(true));
        c.at(1, Seen::GameClosed);
        assert_eq!(c.d.state(), State::Idle);
        assert!(!c.at(30, in_match(Some(Phase::MatchIntro))));
    }

    #[test]
    fn an_offline_map_never_fires_and_keeps_the_arm() {
        let mut c = Clock::new();
        let sandbox =
            Seen::Facts(LiveFacts { context: Context::Other, phase: Some(Phase::MatchIntro), ..Default::default() });
        assert!(!c.at(0, sandbox));
        assert_eq!(c.d.state(), State::Idle);
        c.at(1, hideout(true));
        assert!(!c.at(2, sandbox));
        assert!(matches!(c.d.state(), State::Armed { .. }));
    }

    #[test]
    fn an_unreadable_party_in_the_hideout_does_not_arm_or_cancel() {
        let unknown = Seen::Facts(LiveFacts { context: Context::Hideout, party: None, ..Default::default() });
        let mut c = Clock::new();
        c.at(0, unknown);
        assert_eq!(c.d.state(), State::Idle);
        c.at(1, hideout(true));
        c.at(2, unknown);
        c.at(20, unknown);
        assert!(matches!(c.d.state(), State::Armed { .. }));
    }

    #[test]
    fn the_hideout_after_a_match_rearms_on_the_next_queue() {
        let mut c = Clock::new();
        c.at(0, hideout(true));
        assert!(c.at(4, in_match(Some(Phase::MatchIntro))));
        c.at(1800, in_match(Some(Phase::PostGame)));
        c.at(1810, hideout(false));
        assert_eq!(c.d.state(), State::Idle);
        c.at(1820, hideout(true));
        assert!(c.at(1824, in_match(Some(Phase::MatchIntro))));
    }

    #[test]
    fn a_spectated_match_after_a_finished_game_does_not_fire() {
        let mut c = Clock::new();
        c.at(0, hideout(true));
        assert!(c.at(4, in_match(Some(Phase::MatchIntro))));
        let spectating = Seen::Facts(LiveFacts {
            context: Context::Match,
            phase: Some(Phase::MatchIntro),
            perspective: Perspective::Spectating,
            ..Default::default()
        });
        c.at(1800, hideout(false));
        assert!(!c.at(1810, spectating));
    }
}
