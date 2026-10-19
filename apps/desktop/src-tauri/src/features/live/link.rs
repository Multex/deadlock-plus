use std::sync::{Arc, Mutex};
use std::time::Duration;

use dp_live::{GameLink, Latest, Slot, Snapshot, TICK_INTERVAL};
use dp_postgame::{Done, Worker};
use dp_sync::LockExt;
use tauri::{AppHandle, Emitter, Manager};

use super::board::LiveMatch;
use super::state::{derive, LivePhase, LiveService, LiveState};
use crate::features::admin_access::{game_access_flipped, CHANGED_EVENT};
use crate::features::network::recording::MatchPingService;

const EXIT_WAIT: Duration = Duration::from_secs(3);

/// What the live page shows for one published snapshot.
pub fn view(latest: &Latest<Snapshot>) -> (LiveState, LiveMatch) {
    match latest.value.as_deref() {
        None => (LiveState::of(LivePhase::GameClosed), LiveMatch::default()),
        Some(None) => (derive(None), LiveMatch::default()),
        Some(Some(read)) => (derive(Some(&read.facts)), LiveMatch::from_read(&read.facts, &read.board)),
    }
}

#[derive(Default)]
pub struct GameLinkService {
    link: Mutex<Option<Arc<GameLink>>>,
    ticker: Mutex<Option<Worker>>,
}

impl GameLinkService {
    /// Idempotent. The link attaches by itself once Deadlock is running and stays attached until `stop`.
    pub fn start(&self, app: &AppHandle) {
        let mut link = self.link.lock_or_recover();
        if link.is_some() {
            return;
        }
        let started = match GameLink::spawn() {
            Ok(started) => Arc::new(started),
            Err(e) => {
                log::warn!("game link could not start: {e}");
                return;
            }
        };
        let handle = app.clone();
        let source = Arc::clone(&started);
        match Worker::spawn("live-report", None, move |stop| {
            let mut access_denied = false;
            while !stop.is_stopped() {
                if game_access_flipped(&mut access_denied, dp_live::game_access_denied()) {
                    if let Err(e) = handle.emit(CHANGED_EVENT, ()) {
                        log::warn!("could not emit {CHANGED_EVENT}: {e}");
                    }
                }
                let latest = source.snapshot();
                let (state, board) = view(&latest);
                let service = handle.state::<LiveService>();
                service.report(&handle, state);
                service.report_match(&handle, board);
                let facts = latest.value.as_deref().and_then(|read| read.as_ref()).map(|read| &read.facts);
                handle.state::<MatchPingService>().tick(&handle, state.phase, facts, || source.engine_ping());
                stop.sleep(TICK_INTERVAL);
            }
        }) {
            Ok(worker) => *self.ticker.lock_or_recover() = Some(worker),
            Err(e) => log::warn!("live reporting could not start: {e}"),
        }
        *link = Some(started);
        log::info!("game link started");
    }

    pub fn slot(&self) -> Option<Slot<Snapshot>> {
        self.link.lock_or_recover().as_ref().map(|link| link.slot())
    }

    /// A handle that outlives borrows of the app state, such as a capture thread's reader source.
    pub fn handle(&self) -> Option<Arc<GameLink>> {
        self.link.lock_or_recover().clone()
    }

    pub fn stop(&self) {
        let done: Option<Done> = self.ticker.lock_or_recover().take().map(|worker| worker.stop());
        if let Some(link) = self.link.lock_or_recover().take() {
            link.stop();
        }
        if let Some(done) = done {
            done.wait(EXIT_WAIT);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dp_live::{Board, Context, LiveFacts, LiveRead, Phase};

    fn latest(value: Option<Snapshot>) -> Latest<Snapshot> {
        Latest { value: value.map(Arc::new), generation: 1 }
    }

    fn read(context: Context, phase: Option<Phase>) -> Snapshot {
        Some(LiveRead { facts: LiveFacts { context, phase, ..Default::default() }, board: Board::default() })
    }

    #[test]
    fn no_attached_game_is_game_closed_with_an_empty_board() {
        let (state, board) = view(&latest(None));
        assert_eq!(state, LiveState::of(LivePhase::GameClosed));
        assert_eq!(board, LiveMatch::default());
    }

    #[test]
    fn an_attached_game_with_nothing_loaded_is_menus() {
        let (state, board) = view(&latest(Some(None)));
        assert_eq!(state, LiveState::of(LivePhase::Menus));
        assert_eq!(board, LiveMatch::default());
    }

    #[test]
    fn a_loaded_match_is_derived_with_its_board_and_without_any_grace() {
        let snapshot = read(Context::Match, Some(Phase::InProgress));
        let (state, board) = view(&latest(Some(snapshot.clone())));
        let read = snapshot.unwrap();
        assert_eq!(state, LiveState::of(LivePhase::InMatch));
        assert_eq!(board, LiveMatch::from_read(&read.facts, &read.board));
    }
}
