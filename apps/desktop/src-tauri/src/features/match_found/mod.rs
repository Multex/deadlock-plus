pub mod detector;

use std::sync::Mutex;
use std::time::{Duration, Instant};

use dp_game::focus::GameFocus;
use dp_live::{FactsFeed, GameMode, LiveFacts, MatchMode, Slot, Snapshot};
use dp_postgame::{Stop, Worker};
use dp_sync::LockExt;
use tauri::{AppHandle, Manager};

use super::game_focus::GameFocusService;
use super::i18n::{translate_in, I18nState};
use super::live::link::GameLinkService;
use super::notifications::{self, NotificationTopic};
use super::overlay::OverlayService;
use detector::{Detector, Seen};

const POLL: Duration = Duration::from_secs(1);
const EXIT_WAIT: Duration = Duration::from_secs(2);
const KEY: &str = "notifications.match_found";
const KEY_NO_MODE: &str = "notifications.match_found_unknown";

#[derive(Default)]
pub struct MatchFoundService {
    worker: Mutex<Option<Worker>>,
}

impl MatchFoundService {
    /// Idempotent. Start after the game link, whose snapshot it reads.
    pub fn start(&self, app: &AppHandle) {
        let mut worker = self.worker.lock_or_recover();
        if worker.is_some() {
            return;
        }
        let Some(slot) = app.state::<GameLinkService>().slot() else {
            log::warn!("match found alerts need the game link, which did not start");
            return;
        };
        let handle = app.clone();
        match Worker::spawn("match-found", None, move |stop| run(stop, &handle, &slot)) {
            Ok(started) => *worker = Some(started),
            Err(e) => log::warn!("match found alerts could not start: {e}"),
        }
    }

    pub fn stop(&self) {
        if let Some(worker) = self.worker.lock_or_recover().take() {
            worker.stop().wait(EXIT_WAIT);
        }
    }
}

fn run(stop: &Stop, app: &AppHandle, slot: &Slot<Snapshot>) {
    let mut feed: Option<FactsFeed> = None;
    let mut detector = Detector::default();
    while !stop.is_stopped() {
        let seen = if dp_game::is_running() {
            match feed.get_or_insert_with(|| FactsFeed::new(slot.clone())).poll() {
                Some(facts) => Seen::Facts(facts),
                None => Seen::NoFacts,
            }
        } else {
            feed = None;
            Seen::GameClosed
        };
        if detector.observe(seen, Instant::now()) {
            if let Seen::Facts(facts) = seen {
                announce(app, &facts);
            }
        }
        stop.sleep(POLL);
    }
}

fn announce(app: &AppHandle, facts: &LiveFacts) {
    let enabled = app.state::<OverlayService>().settings().match_found;
    if !wanted(enabled, app.state::<GameFocusService>().state().focus) {
        return;
    }
    let (key, params) = message(facts, &app.state::<I18nState>().locale());
    notifications::push(app, NotificationTopic::MatchFound, key, &params, None);
}

/// The game shows its own pop while it is in front; this alert is for players who tabbed out.
fn wanted(enabled: bool, focus: GameFocus) -> bool {
    enabled && focus != GameFocus::Focused
}

/// Street Brawl is a game mode, not a match mode, so it wins over whatever match mode it reports.
fn mode_key(facts: &LiveFacts) -> Option<&'static str> {
    if facts.game_mode == Some(GameMode::StreetBrawl) {
        return Some("match_history.detail.mode.streetBrawl");
    }
    match facts.match_mode? {
        MatchMode::Ranked => Some("match_history.detail.mode.ranked"),
        MatchMode::Unranked => Some("match_history.detail.mode.unranked"),
        MatchMode::CoopBot => Some("match_history.detail.mode.bot"),
        MatchMode::PrivateLobby | MatchMode::Tutorial | MatchMode::Other => None,
    }
}

/// The notification key and its params. A mode the copy has no name for uses the key without `{mode}`.
fn message(facts: &LiveFacts, locale: &str) -> (&'static str, Vec<(&'static str, String)>) {
    match mode_key(facts) {
        Some(mode) => (KEY, vec![("mode", translate_in(locale, mode, &[]))]),
        None => (KEY_NO_MODE, Vec::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dp_live::{Context, Phase};

    fn found(match_mode: Option<MatchMode>, game_mode: Option<GameMode>) -> LiveFacts {
        LiveFacts {
            context: Context::Match,
            phase: Some(Phase::MatchIntro),
            match_mode,
            game_mode,
            ..Default::default()
        }
    }

    fn mode_param(facts: LiveFacts) -> Option<String> {
        let (key, params) = message(&facts, "en");
        match params.as_slice() {
            [("mode", name)] => {
                assert_eq!(key, KEY);
                Some(name.clone())
            }
            [] => {
                assert_eq!(key, KEY_NO_MODE);
                None
            }
            other => panic!("unexpected params {other:?}"),
        }
    }

    #[test]
    fn names_the_four_queued_modes() {
        let normal = Some(GameMode::Normal);
        assert_eq!(mode_param(found(Some(MatchMode::Ranked), normal)).as_deref(), Some("Ranked"));
        assert_eq!(mode_param(found(Some(MatchMode::Unranked), normal)).as_deref(), Some("Unranked"));
        assert_eq!(mode_param(found(Some(MatchMode::CoopBot), normal)).as_deref(), Some("Bots"));
        assert_eq!(
            mode_param(found(Some(MatchMode::Unranked), Some(GameMode::StreetBrawl))).as_deref(),
            Some("Street Brawl")
        );
    }

    #[test]
    fn a_mode_without_a_name_still_announces_without_one() {
        for mode in [None, Some(MatchMode::PrivateLobby), Some(MatchMode::Tutorial), Some(MatchMode::Other)] {
            assert_eq!(mode_param(found(mode, Some(GameMode::Normal))), None, "{mode:?}");
        }
    }

    #[test]
    fn announces_only_while_the_game_is_not_in_front() {
        assert!(!wanted(true, GameFocus::Focused), "the game shows its own pop");
        assert!(wanted(true, GameFocus::Background), "tabbed out");
        assert!(wanted(true, GameFocus::Closed), "focus watcher not running");
        assert!(!wanted(false, GameFocus::Background), "the user turned it off");
    }

    #[test]
    fn every_key_it_shows_is_in_the_english_catalog() {
        for key in [KEY, KEY_NO_MODE] {
            for part in ["title", "body"] {
                let full = format!("{key}.{part}");
                assert_ne!(translate_in("en", &full, &[]), full, "missing {full}");
            }
        }
    }
}
