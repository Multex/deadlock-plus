use std::sync::Mutex;
use std::time::{Duration, Instant};

use dp_live::{Context, LiveFacts, Phase};
use dp_sync::LockExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use ts_rs::TS;

use super::board::LiveMatch;
use crate::features::app_window::MAIN_WINDOW;

const EVENT: &str = "live-snapshot";
const MATCH_EVENT: &str = "live-match";
const MATCH_MIN_INTERVAL: Duration = Duration::from_secs(1);

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum LivePhase {
    GameClosed,
    Menus,
    Queuing,
    Pregame,
    InMatch,
    PostMatch,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct LiveState {
    pub phase: LivePhase,
    /// A match exists to show: pregame, in progress or finished.
    pub match_present: bool,
}

impl LivePhase {
    /// A privilege prompt would cover the game or distract from it.
    pub fn blocks_prompts(self) -> bool {
        matches!(self, LivePhase::Pregame | LivePhase::InMatch)
    }
}

impl LiveState {
    pub fn of(phase: LivePhase) -> Self {
        let match_present = matches!(phase, LivePhase::Pregame | LivePhase::InMatch | LivePhase::PostMatch);
        Self { phase, match_present }
    }
}

/// `None` means the game is running but no match or hideout is loaded.
pub fn derive(facts: Option<&LiveFacts>) -> LiveState {
    let Some(facts) = facts else { return LiveState::of(LivePhase::Menus) };
    let phase = match facts.context {
        Context::Match => match facts.phase {
            Some(Phase::InProgress) => LivePhase::InMatch,
            Some(Phase::PostGame) => LivePhase::PostMatch,
            _ => LivePhase::Pregame,
        },
        // The loading screen and hero selection run before the reader sees a match.
        Context::Other if matches!(facts.phase, Some(Phase::MatchIntro | Phase::Loading | Phase::PreGame)) => {
            LivePhase::Pregame
        }
        _ if facts.party.is_some_and(|p| p.queueing) => LivePhase::Queuing,
        _ => LivePhase::Menus,
    };
    LiveState::of(phase)
}

#[derive(Default)]
struct Inner {
    state: Option<LiveState>,
    board: BoardSlot,
}

/// A change that arrives inside the minimum interval is not lost: `latest` keeps it and the next report past the
/// interval sends it.
struct BoardSlot {
    latest: LiveMatch,
    emitted: Option<LiveMatch>,
    emitted_at: Option<Instant>,
}

impl Default for BoardSlot {
    fn default() -> Self {
        Self { latest: LiveMatch::default(), emitted: Some(LiveMatch::default()), emitted_at: None }
    }
}

pub struct LiveService {
    inner: Mutex<Inner>,
}

impl Default for LiveService {
    fn default() -> Self {
        Self { inner: Mutex::new(Inner::default()) }
    }
}

impl LiveService {
    pub fn current(&self) -> LiveState {
        current(&self.inner.lock_or_recover())
    }

    pub fn current_match(&self) -> LiveMatch {
        self.inner.lock_or_recover().board.latest.clone()
    }

    pub fn report(&self, app: &AppHandle, state: LiveState) {
        let changed = report(&mut self.inner.lock_or_recover(), state);
        emit(app, changed);
    }

    pub fn report_match(&self, app: &AppHandle, live_match: LiveMatch) {
        let changed = report_match(&mut self.inner.lock_or_recover().board, live_match, Instant::now());
        if let Some(live_match) = changed {
            // Only the main window shows the scoreboard; the overlay does not listen.
            if let Err(e) = app.emit_to(MAIN_WINDOW, MATCH_EVENT, live_match) {
                log::warn!("could not emit {MATCH_EVENT}: {e}");
            }
        }
    }
}

fn report_match(slot: &mut BoardSlot, live_match: LiveMatch, now: Instant) -> Option<LiveMatch> {
    slot.latest = live_match;
    if slot.emitted.as_ref() == Some(&slot.latest) {
        return None;
    }
    if slot.emitted_at.is_some_and(|at| now.saturating_duration_since(at) < MATCH_MIN_INTERVAL) {
        return None;
    }
    slot.emitted = Some(slot.latest.clone());
    slot.emitted_at = Some(now);
    Some(slot.latest.clone())
}

fn idle() -> LiveState {
    LiveState::of(LivePhase::GameClosed)
}

fn current(inner: &Inner) -> LiveState {
    inner.state.unwrap_or_else(idle)
}

fn report(inner: &mut Inner, state: LiveState) -> Option<LiveState> {
    if inner.state == Some(state) {
        return None;
    }
    inner.state = Some(state);
    Some(state)
}

fn emit(app: &AppHandle, state: Option<LiveState>) {
    if let Some(state) = state {
        if let Err(e) = app.emit(EVENT, state) {
            log::warn!("could not emit {EVENT}: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dp_live::PartyFacts;

    #[test]
    fn only_pregame_and_in_match_block_prompts() {
        for phase in [
            LivePhase::GameClosed,
            LivePhase::Menus,
            LivePhase::Queuing,
            LivePhase::Pregame,
            LivePhase::InMatch,
            LivePhase::PostMatch,
        ] {
            let expected = matches!(phase, LivePhase::Pregame | LivePhase::InMatch);
            assert_eq!(phase.blocks_prompts(), expected, "{phase:?}");
        }
    }

    fn facts(context: Context, phase: Option<Phase>) -> LiveFacts {
        LiveFacts { context, phase, ..Default::default() }
    }

    fn queueing() -> Option<PartyFacts> {
        Some(PartyFacts { size: 1, queueing: true, queued_secs: Some(5), ..Default::default() })
    }

    fn phase_of(f: &LiveFacts) -> LivePhase {
        derive(Some(f)).phase
    }

    #[test]
    fn no_snapshot_means_menus() {
        assert_eq!(derive(None), LiveState { phase: LivePhase::Menus, match_present: false });
    }

    #[test]
    fn hideout_is_menus_and_queueing_party_is_queuing() {
        let mut f = facts(Context::Hideout, None);
        assert_eq!(phase_of(&f), LivePhase::Menus);
        f.party = Some(PartyFacts { size: 2, queueing: false, ..Default::default() });
        assert_eq!(phase_of(&f), LivePhase::Menus);
        f.party = queueing();
        assert_eq!(derive(Some(&f)), LiveState { phase: LivePhase::Queuing, match_present: false });
        assert_eq!(phase_of(&facts(Context::Other, None)), LivePhase::Menus);
    }

    #[test]
    fn match_phases_map_and_flag_a_match() {
        for (phase, want) in [
            (Some(Phase::MatchIntro), LivePhase::Pregame),
            (Some(Phase::Loading), LivePhase::Pregame),
            (Some(Phase::PreGame), LivePhase::Pregame),
            (None, LivePhase::Pregame),
            (Some(Phase::InProgress), LivePhase::InMatch),
            (Some(Phase::PostGame), LivePhase::PostMatch),
        ] {
            assert_eq!(derive(Some(&facts(Context::Match, phase))), LiveState { phase: want, match_present: true });
        }
    }

    #[test]
    fn a_match_wins_over_a_stale_queue_flag() {
        let mut f = facts(Context::Match, Some(Phase::InProgress));
        f.party = queueing();
        assert_eq!(phase_of(&f), LivePhase::InMatch);
    }

    #[test]
    fn loading_into_a_match_from_other_context_is_pregame_but_other_phases_are_menus() {
        assert_eq!(phase_of(&facts(Context::Other, Some(Phase::Loading))), LivePhase::Pregame);
        assert_eq!(phase_of(&facts(Context::Other, Some(Phase::InProgress))), LivePhase::Menus);
        assert_eq!(phase_of(&facts(Context::Hideout, Some(Phase::Loading))), LivePhase::Menus);
    }

    #[test]
    fn match_present_only_for_match_phases() {
        for p in [LivePhase::GameClosed, LivePhase::Menus, LivePhase::Queuing] {
            assert!(!LiveState::of(p).match_present, "{p:?}");
        }
        for p in [LivePhase::Pregame, LivePhase::InMatch, LivePhase::PostMatch] {
            assert!(LiveState::of(p).match_present, "{p:?}");
        }
    }

    #[test]
    fn reports_emit_only_on_change() {
        let mut i = Inner::default();
        let menus = LiveState::of(LivePhase::Menus);
        assert_eq!(report(&mut i, menus), Some(menus));
        assert_eq!(report(&mut i, menus), None);
        let q = LiveState::of(LivePhase::Queuing);
        assert_eq!(report(&mut i, q), Some(q));
    }

    #[test]
    fn a_fresh_service_state_is_game_closed() {
        assert_eq!(LiveService::default().current().phase, LivePhase::GameClosed);
    }

    #[test]
    fn match_reports_emit_only_on_change() {
        let mut slot = BoardSlot::default();
        let t0 = Instant::now();
        let a = LiveMatch { clock_secs: Some(10), ..Default::default() };
        assert_eq!(report_match(&mut slot, a.clone(), t0), Some(a.clone()));
        assert_eq!(report_match(&mut slot, a, t0 + Duration::from_secs(5)), None);
    }

    #[test]
    fn match_reports_are_throttled_and_the_held_change_goes_out_later() {
        let mut slot = BoardSlot::default();
        let t0 = Instant::now();
        let at = |s: u32| LiveMatch { clock_secs: Some(s), ..Default::default() };
        assert!(report_match(&mut slot, at(1), t0).is_some());
        assert_eq!(report_match(&mut slot, at(2), t0 + Duration::from_millis(400)), None);
        assert_eq!(slot.latest, at(2));
        assert_eq!(report_match(&mut slot, at(3), t0 + Duration::from_millis(1000)), Some(at(3)));
    }

    #[test]
    fn a_change_back_to_the_emitted_value_inside_the_interval_sends_nothing() {
        let mut slot = BoardSlot::default();
        let t0 = Instant::now();
        let at = |s: u32| LiveMatch { clock_secs: Some(s), ..Default::default() };
        report_match(&mut slot, at(1), t0);
        assert_eq!(report_match(&mut slot, at(2), t0 + Duration::from_millis(300)), None);
        assert_eq!(report_match(&mut slot, at(1), t0 + Duration::from_millis(600)), None);
    }

    #[test]
    fn current_match_is_the_latest_even_when_held_back() {
        let service = LiveService::default();
        assert_eq!(service.current_match(), LiveMatch::default());
        let held = LiveMatch { clock_secs: Some(9), ..Default::default() };
        service.inner.lock_or_recover().board.latest = held.clone();
        assert_eq!(service.current_match(), held);
    }
}
