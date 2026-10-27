use std::time::{Duration, Instant};

use deadlock_walker::QueueRequest;

use crate::{GameMode, MatchMode, PartyFacts};

/// Building the probe copies the whole client image (tens of MB), so a failed build waits this long before the
/// next one, doubling after each further failure, and stops after `MAX_BUILDS` until the game is attached again.
/// A build that fails that often will keep failing on this game build.
const BUILD_RETRY: Duration = Duration::from_secs(10);
const MAX_BUILDS: u32 = 6;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProbeError {
    WrongProcess,
    Failed,
}

/// What the client says about the local player's search.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct QueueState {
    pub queueing: bool,
    /// The request that started the search. Only known while `queueing`; the client clears it when the search ends.
    pub match_mode: Option<MatchMode>,
    pub game_mode: Option<GameMode>,
    pub bot_difficulty: Option<u32>,
    /// When the party's search started, in unix seconds. A party search never sets the solo flag above. `None` or 0
    /// while the party is not searching.
    pub party_start: Option<u64>,
    /// What the party's search asked for, as the raw numbers the client holds. Only set while the party is searching
    /// and at least one of its modes is known.
    pub party_request: Option<QueueRequest>,
}

impl QueueState {
    pub fn searching() -> Self {
        QueueState { queueing: true, ..QueueState::default() }
    }
}

/// Reads the client's queue state. `Mem` is whatever the probe needs to read the game.
pub trait QueueProbe {
    type Mem: ?Sized;

    /// `None` means unknown.
    fn poll(&mut self, mem: &Self::Mem) -> Result<Option<QueueState>, ProbeError>;
}

/// How long the client has continuously said "searching", by our own clock.
#[derive(Debug, Default)]
pub struct QueueClock {
    since: Option<Instant>,
}

impl QueueClock {
    /// Whole seconds in the current queue, or `None` once it is over.
    pub fn observe(&mut self, now: Instant, queueing: bool) -> Option<u64> {
        if !queueing {
            self.since = None;
            return None;
        }
        let since = *self.since.get_or_insert(now);
        Some(now.saturating_duration_since(since).as_secs())
    }

    pub fn reset(&mut self) {
        self.since = None;
    }
}

/// Owns the lazily built probe. Building copies the client image, so this belongs on a background thread.
pub struct QueuePoller<P> {
    probe: Option<P>,
    build_failed_at: Option<Instant>,
    build_failures: u32,
}

impl<P> Default for QueuePoller<P> {
    fn default() -> Self {
        QueuePoller { probe: None, build_failed_at: None, build_failures: 0 }
    }
}

impl<P: QueueProbe> QueuePoller<P> {
    pub fn poll(&mut self, now: Instant, mem: &P::Mem, build: impl FnOnce(&P::Mem) -> Option<P>) -> Option<QueueState> {
        if self.probe.is_none() {
            if self.build_failures >= MAX_BUILDS {
                return None;
            }
            let wait = BUILD_RETRY * 2u32.saturating_pow(self.build_failures.saturating_sub(1));
            if self.build_failed_at.is_some_and(|at| now.saturating_duration_since(at) < wait) {
                return None;
            }
            self.probe = build(mem);
            if self.probe.is_none() {
                self.build_failed_at = Some(now);
                self.build_failures += 1;
                return None;
            }
            self.build_failures = 0;
        }
        match self.probe.as_mut()?.poll(mem) {
            Ok(state) => state,
            Err(ProbeError::WrongProcess) => {
                self.probe = None;
                None
            }
            Err(ProbeError::Failed) => None,
        }
    }
}

/// Merges the client's queue state into the party read and keeps our own queue clock.
#[derive(Debug, Default)]
pub struct QueueMerge {
    clock: QueueClock,
}

impl QueueMerge {
    /// The party for this tick with the client's queue state merged in. A match ends the queue. An unknown or negative
    /// flag never turns off a queue the party object reports, and never invents a party. The party's own modes win over
    /// the client's request.
    pub fn merge(
        &mut self,
        now: Instant,
        in_match: bool,
        party: Option<PartyFacts>,
        ui: Option<QueueState>,
    ) -> Option<PartyFacts> {
        if in_match {
            self.clock.reset();
            return party;
        }
        let Some(ui) = ui.filter(|ui| ui.queueing) else {
            self.clock.observe(now, false);
            return party;
        };
        let secs = self.clock.observe(now, true);
        let request = PartyFacts {
            match_mode: ui.match_mode,
            game_mode: ui.game_mode,
            bot_difficulty: ui.bot_difficulty,
            ..PartyFacts::default()
        };
        Some(match party {
            Some(p) => PartyFacts {
                queueing: true,
                queued_secs: p.queued_secs.filter(|_| p.queueing).or(secs),
                match_mode: p.match_mode.or(request.match_mode),
                game_mode: p.game_mode.or(request.game_mode),
                bot_difficulty: p.bot_difficulty.or(request.bot_difficulty),
                ..p
            },
            None => PartyFacts { size: 1, queueing: true, queued_secs: secs, ..request },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn on() -> Option<QueueState> {
        Some(QueueState::searching())
    }

    fn off() -> Option<QueueState> {
        Some(QueueState::default())
    }

    fn at(t0: Instant, secs: u64) -> Instant {
        t0 + Duration::from_secs(secs)
    }

    #[test]
    fn the_clock_starts_on_the_first_true_and_keeps_counting() {
        let t0 = Instant::now();
        let mut c = QueueClock::default();
        assert_eq!(c.observe(at(t0, 5), true), Some(0));
        assert_eq!(c.observe(at(t0, 12), true), Some(7));
        assert_eq!(c.observe(at(t0, 65), true), Some(60));
    }

    #[test]
    fn the_clock_is_idle_while_not_queueing() {
        let mut c = QueueClock::default();
        assert_eq!(c.observe(Instant::now(), false), None);
    }

    #[test]
    fn the_clock_restarts_after_false() {
        let t0 = Instant::now();
        let mut c = QueueClock::default();
        c.observe(at(t0, 0), true);
        assert_eq!(c.observe(at(t0, 10), false), None);
        assert_eq!(c.observe(at(t0, 20), true), Some(0));
    }

    #[test]
    fn the_clock_restarts_after_reset() {
        let t0 = Instant::now();
        let mut c = QueueClock::default();
        c.observe(at(t0, 0), true);
        c.reset();
        assert_eq!(c.observe(at(t0, 30), true), Some(0));
    }

    struct Fake {
        answers: Vec<Result<Option<QueueState>, ProbeError>>,
    }

    impl QueueProbe for Fake {
        type Mem = ();

        fn poll(&mut self, _: &()) -> Result<Option<QueueState>, ProbeError> {
            self.answers.remove(0)
        }
    }

    fn poller(answers: Vec<Result<Option<QueueState>, ProbeError>>) -> QueuePoller<Fake> {
        QueuePoller { probe: Some(Fake { answers }), ..QueuePoller::default() }
    }

    fn never_built(_: &()) -> Option<Fake> {
        panic!("probe is already built")
    }

    #[test]
    fn a_solo_queue_gets_a_party_with_our_clock() {
        let t0 = Instant::now();
        let mut m = QueueMerge::default();
        let first = m.merge(at(t0, 0), false, None, on()).unwrap();
        assert_eq!(first, PartyFacts { size: 1, queueing: true, queued_secs: Some(0), ..PartyFacts::default() });
        let later = m.merge(at(t0, 9), false, None, on()).unwrap();
        assert_eq!(later.queued_secs, Some(9));
    }

    #[test]
    fn the_partys_start_time_wins() {
        let party = PartyFacts { size: 3, queueing: true, queued_secs: Some(42), ..PartyFacts::default() };
        let merged = QueueMerge::default().merge(Instant::now(), false, Some(party), on()).unwrap();
        assert_eq!(merged, party);
    }

    #[test]
    fn a_party_without_a_start_time_takes_our_clock() {
        let party = PartyFacts { size: 2, ..PartyFacts::default() };
        let merged = QueueMerge::default().merge(Instant::now(), false, Some(party), on()).unwrap();
        assert_eq!(merged, PartyFacts { size: 2, queueing: true, queued_secs: Some(0), ..PartyFacts::default() });
    }

    #[test]
    fn a_false_flag_keeps_a_queue_the_party_reports() {
        let party = PartyFacts { size: 2, queueing: true, queued_secs: Some(8), ..PartyFacts::default() };
        let mut m = QueueMerge::default();
        for ui in [off(), None] {
            assert_eq!(m.merge(Instant::now(), false, Some(party), ui), Some(party));
        }
    }

    #[test]
    fn an_unknown_flag_invents_no_party() {
        let mut m = QueueMerge::default();
        assert_eq!(m.merge(Instant::now(), false, None, off()), None);
        assert_eq!(m.merge(Instant::now(), false, None, None), None);
    }

    #[test]
    fn a_match_ends_the_queue() {
        let t0 = Instant::now();
        let mut m = QueueMerge::default();
        m.merge(at(t0, 0), false, None, on());
        assert_eq!(m.merge(at(t0, 5), true, None, on()), None);
        let again = m.merge(at(t0, 30), false, None, on()).unwrap();
        assert_eq!(again.queued_secs, Some(0));
    }

    #[test]
    fn the_queue_clock_resets_when_the_flag_drops() {
        let t0 = Instant::now();
        let mut m = QueueMerge::default();
        m.merge(at(t0, 0), false, None, on());
        m.merge(at(t0, 4), false, None, off());
        assert_eq!(m.merge(at(t0, 10), false, None, on()).unwrap().queued_secs, Some(0));
    }

    fn solo(match_mode: MatchMode, game_mode: GameMode, bot_difficulty: Option<u32>) -> Option<QueueState> {
        Some(QueueState {
            queueing: true,
            match_mode: Some(match_mode),
            game_mode: Some(game_mode),
            bot_difficulty,
            ..QueueState::default()
        })
    }

    #[test]
    fn a_solo_queue_carries_the_requested_mode() {
        let ui = solo(MatchMode::Unranked, GameMode::StreetBrawl, Some(0));
        let p = QueueMerge::default().merge(Instant::now(), false, None, ui).unwrap();
        assert_eq!(p.match_mode, Some(MatchMode::Unranked));
        assert_eq!(p.game_mode, Some(GameMode::StreetBrawl));
        assert_eq!(p.bot_difficulty, Some(0));
    }

    fn ranked_party() -> PartyFacts {
        PartyFacts {
            size: 2,
            queueing: true,
            queued_secs: Some(3),
            match_mode: Some(MatchMode::Ranked),
            game_mode: Some(GameMode::Normal),
            ..PartyFacts::default()
        }
    }

    #[test]
    fn the_partys_own_modes_win_over_the_clients_request() {
        let ui = solo(MatchMode::Unranked, GameMode::StreetBrawl, None);
        let merged = QueueMerge::default().merge(Instant::now(), false, Some(ranked_party()), ui).unwrap();
        assert_eq!((merged.match_mode, merged.game_mode), (Some(MatchMode::Ranked), Some(GameMode::Normal)));
    }

    #[test]
    fn a_request_without_modes_keeps_the_partys_modes() {
        let merged = QueueMerge::default().merge(Instant::now(), false, Some(ranked_party()), on()).unwrap();
        assert_eq!((merged.match_mode, merged.game_mode), (Some(MatchMode::Ranked), Some(GameMode::Normal)));
    }

    #[test]
    fn the_partys_modes_survive_a_false_or_unknown_flag() {
        let mut m = QueueMerge::default();
        for ui in [off(), None] {
            assert_eq!(m.merge(Instant::now(), false, Some(ranked_party()), ui), Some(ranked_party()));
        }
    }

    #[test]
    fn a_party_without_modes_takes_the_clients_request() {
        let party = PartyFacts { size: 2, ..PartyFacts::default() };
        let ui = solo(MatchMode::Ranked, GameMode::Normal, None);
        let merged = QueueMerge::default().merge(Instant::now(), false, Some(party), ui).unwrap();
        assert_eq!(merged.size, 2);
        assert_eq!(merged.match_mode, Some(MatchMode::Ranked));
    }

    #[test]
    fn no_request_is_reported_once_the_flag_drops() {
        let mut m = QueueMerge::default();
        m.merge(Instant::now(), false, None, solo(MatchMode::Ranked, GameMode::Normal, None));
        let stale = Some(QueueState { match_mode: Some(MatchMode::Ranked), ..QueueState::default() });
        assert_eq!(m.merge(Instant::now(), false, None, stale), None);
    }

    #[test]
    fn a_match_drops_the_request_with_the_queue() {
        let mut m = QueueMerge::default();
        m.merge(Instant::now(), false, None, solo(MatchMode::Ranked, GameMode::Normal, None));
        assert_eq!(m.merge(Instant::now(), true, None, solo(MatchMode::Ranked, GameMode::Normal, None)), None);
    }

    #[test]
    fn the_poller_reports_each_answer() {
        let mut p = poller(vec![Ok(on()), Ok(off()), Ok(None), Err(ProbeError::Failed)]);
        let seen: Vec<_> = (0..4).map(|_| p.poll(Instant::now(), &(), never_built)).collect();
        assert_eq!(seen, [on(), off(), None, None]);
    }

    #[test]
    fn a_wrong_process_drops_the_probe_and_a_failed_build_waits() {
        let t0 = Instant::now();
        let mut p = poller(vec![Err(ProbeError::WrongProcess)]);
        p.poll(at(t0, 0), &(), never_built);
        assert!(p.probe.is_none());
        let mut builds = 0;
        let mut build = |_: &()| {
            builds += 1;
            None
        };
        p.poll(at(t0, 1), &(), &mut build);
        p.poll(at(t0, 5), &(), &mut build);
        p.poll(at(t0, 12), &(), &mut build);
        assert_eq!(builds, 2);
    }

    fn build_times(p: &mut QueuePoller<Fake>, t0: Instant, until_secs: u64) -> Vec<u64> {
        let mut built = Vec::new();
        for s in 0..=until_secs {
            p.poll(at(t0, s), &(), |_| {
                built.push(s);
                None
            });
        }
        built
    }

    #[test]
    fn failed_builds_back_off_and_then_stop_for_this_game() {
        let t0 = Instant::now();
        let mut p = QueuePoller::<Fake>::default();
        assert_eq!(build_times(&mut p, t0, 2_000), [0, 10, 30, 70, 150, 310]);
    }

    #[test]
    fn a_build_that_works_resets_the_backoff() {
        let t0 = Instant::now();
        let mut p = QueuePoller::<Fake>::default();
        build_times(&mut p, t0, 30);
        p.poll(at(t0, 70), &(), |_| Some(Fake { answers: vec![Err(ProbeError::WrongProcess)] }));
        assert!(p.probe.is_none());
        assert_eq!(build_times(&mut p, at(t0, 71), 10), [0, 10]);
    }
}
