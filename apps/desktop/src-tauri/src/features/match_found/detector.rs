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

/// The first Hideout tick of a possible cancel.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct QueueDip {
    pub since: Instant,
    /// Whether the game was in front then. A queue the user stopped in the game needs no alert.
    pub focused: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum State {
    #[default]
    Idle,
    /// The party is queueing.
    Armed { dip: Option<QueueDip> },
    /// The pop was announced; waits for the Hideout before it can arm again.
    Fired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Event {
    /// A queued party's match started loading.
    Found,
    /// The queue stopped without a match while the game was not in front.
    Cancelled,
}

/// Turns polled game facts into one edge per queue pop or cancel.
#[derive(Debug, Default)]
pub struct Detector {
    state: State,
}

impl Detector {
    #[cfg(test)]
    pub fn state(&self) -> State {
        self.state
    }

    /// `focused` is whether the game window is in front on this tick.
    pub fn observe(&mut self, seen: Seen, focused: bool, now: Instant) -> Option<Event> {
        let facts = match seen {
            Seen::GameClosed => {
                self.state = State::Idle;
                return None;
            }
            Seen::NoFacts => return None,
            Seen::Facts(facts) => facts,
        };
        let queueing = facts.party.map(|party| party.queueing);
        match (self.state, facts.context) {
            (_, Context::Hideout) if queueing == Some(true) => {
                self.state = State::Armed { dip: None };
            }
            (State::Idle | State::Fired, Context::Hideout) => self.state = State::Idle,
            (State::Armed { dip }, Context::Hideout) if queueing == Some(false) => {
                let dip = dip.unwrap_or(QueueDip { since: now, focused });
                if now.saturating_duration_since(dip.since) < CANCEL_AFTER {
                    self.state = State::Armed { dip: Some(dip) };
                } else {
                    self.state = State::Idle;
                    return (!dip.focused).then_some(Event::Cancelled);
                }
            }
            (State::Armed { .. }, Context::Match)
                if matches!(facts.phase, Some(Phase::MatchIntro | Phase::Loading | Phase::PreGame)) =>
            {
                self.state = State::Fired;
                return Some(Event::Found);
            }
            _ => {}
        }
        None
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
        focused: bool,
    }

    impl Clock {
        fn new() -> Self {
            Self { t0: Instant::now(), d: Detector::default(), focused: false }
        }

        fn step(&mut self, secs: u64, seen: Seen) -> Option<Event> {
            self.d.observe(seen, self.focused, self.t0 + Duration::from_secs(secs))
        }

        fn at(&mut self, secs: u64, seen: Seen) -> bool {
            self.step(secs, seen) == Some(Event::Found)
        }

        fn events(&mut self, secs: std::ops::RangeInclusive<u64>, seen: Seen) -> Vec<Event> {
            secs.filter_map(|s| self.step(s, seen)).collect()
        }
    }

    #[test]
    fn a_ten_second_cancel_reports_cancelled_once() {
        let mut c = Clock::new();
        assert_eq!(c.step(0, hideout(true)), None);
        assert_eq!(c.events(1..=10, hideout(false)), [], "9 s is not a cancel yet");
        assert_eq!(c.step(11, hideout(false)), Some(Event::Cancelled));
        assert_eq!(c.d.state(), State::Idle);
        assert_eq!(c.events(12..=60, hideout(false)), []);
    }

    #[test]
    fn a_short_dip_or_pop_never_reports_cancelled() {
        let mut c = Clock::new();
        let mut events = Vec::new();
        events.extend(c.step(0, hideout(true)));
        events.extend(c.events(1..=9, hideout(false)));
        events.extend(c.step(10, hideout(true)));
        events.extend(c.events(11..=13, hideout(false)));
        events.extend(c.events(14..=20, in_match(Some(Phase::MatchIntro))));
        events.extend(c.events(21..=1800, in_match(Some(Phase::InProgress))));
        events.extend(c.events(1801..=1860, hideout(false)));
        assert_eq!(events, [Event::Found]);
    }

    #[test]
    fn closing_the_game_while_queued_is_not_a_cancel() {
        let mut c = Clock::new();
        c.step(0, hideout(true));
        c.step(1, hideout(false));
        assert_eq!(c.events(2..=30, Seen::GameClosed), []);
        assert_eq!(c.events(31..=60, hideout(false)), [], "the next launch starts idle");
    }

    #[test]
    fn a_cancel_made_while_focused_is_not_announced() {
        let mut c = Clock::new();
        c.step(0, hideout(true));
        c.focused = true;
        c.step(1, hideout(false));
        c.focused = false;
        assert_eq!(c.events(2..=30, hideout(false)), [], "tabbing out after stopping the queue changes nothing");
        assert_eq!(c.d.state(), State::Idle);
    }

    #[test]
    fn the_focus_at_the_first_tick_of_the_last_dip_decides() {
        let mut c = Clock::new();
        c.step(0, hideout(true));
        c.step(1, hideout(false));
        c.focused = true;
        assert_eq!(c.events(2..=20, hideout(false)), [Event::Cancelled], "tabbed out when it stopped");

        let mut c = Clock::new();
        c.focused = true;
        c.step(0, hideout(true));
        c.step(1, hideout(false));
        c.step(2, hideout(true));
        c.focused = false;
        assert_eq!(c.events(3..=20, hideout(false)), [Event::Cancelled], "a requeue forgets the earlier dip");
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
