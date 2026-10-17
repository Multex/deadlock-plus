use dp_game::focus::{FocusState, GameFocus, ScreenRect};

use super::{OverlaySettings, OverlayStatus, OverlayToast};
use crate::features::notifications::{NotificationKind, Placement};

pub const MIN_DURATION_SECS: u8 = 3;
pub const MAX_DURATION_SECS: u8 = 15;

impl OverlaySettings {
    pub fn sanitized(self) -> Self {
        Self { duration_secs: self.duration_secs.clamp(MIN_DURATION_SECS, MAX_DURATION_SECS), ..self }
    }
}

/// Whether an overlay toast can be seen right now. `platform_ready`: this desktop can float a click-through window
/// over the game. In exclusive fullscreen nothing composites over the game.
pub(super) fn available(
    platform_ready: bool,
    settings: OverlaySettings,
    focus: &FocusState,
    exclusive_fullscreen: bool,
) -> bool {
    platform_ready && settings.enabled && focus.game_rect.is_some() && !exclusive_fullscreen
}

/// Over the game while it is in front, so Window mode keeps cards inside its frame; otherwise over whatever
/// monitor the user is looking at.
pub(super) fn show_rect(focus: &FocusState) -> Option<ScreenRect> {
    match focus.game_rect {
        Some(game) if focus.focus == GameFocus::Focused && game.width > 0 && game.height > 0 => Some(game),
        _ => focus.monitor_rect,
    }
}

/// Where to move a window already showing toasts after focus changed: only when the new spot differs from where
/// it was last shown. The focus watcher re-sends the same state on its recheck, which must not re-show.
pub(super) fn follow_rect(shown: Option<ScreenRect>, focus: &FocusState, toasts_visible: bool) -> Option<ScreenRect> {
    let shown = shown.filter(|_| toasts_visible)?;
    show_rect(focus).filter(|rect| *rect != shown)
}

/// Whether to put a window already showing toasts back on top: a window manager raises the game when it takes
/// focus, which on X11 can cover the overlay. Moving or re-showing a mapped window does not restack it.
pub(super) fn raise_after_focus(previous: GameFocus, next: GameFocus, toasts_visible: bool) -> bool {
    toasts_visible && next == GameFocus::Focused && previous != GameFocus::Focused
}

/// `exclusive_now` only counts while the game is focused: once tabbed out the system reads "busy", not
/// fullscreen, so the last focused reading is the one that describes the game's display mode.
pub(super) fn next_status(current: OverlayStatus, focus: GameFocus, exclusive_now: bool) -> OverlayStatus {
    match focus {
        GameFocus::Closed => OverlayStatus::default(),
        GameFocus::Background => OverlayStatus { game_open: true, ..current },
        GameFocus::Focused => OverlayStatus { game_open: true, exclusive_fullscreen: exclusive_now },
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Lifecycle {
    Create,
    Close,
}

/// The window lives while the game runs, so WebView2 is warm before the first toast.
pub(super) fn lifecycle(previous: GameFocus, next: GameFocus) -> Option<Lifecycle> {
    match (previous == GameFocus::Closed, next == GameFocus::Closed) {
        (true, false) => Some(Lifecycle::Create),
        (false, true) => Some(Lifecycle::Close),
        _ => None,
    }
}

pub(super) fn toast(
    id: String,
    kind: NotificationKind,
    (title, body): (String, String),
    placement: Placement,
    settings: OverlaySettings,
) -> OverlayToast {
    OverlayToast {
        id,
        kind,
        title,
        body,
        placement,
        position: settings.position,
        duration_ms: u32::from(settings.duration_secs) * 1000,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::overlay::OverlayPosition;

    const GAME: ScreenRect = ScreenRect { x: 100, y: 50, width: 1920, height: 1080 };
    const MONITOR: ScreenRect = ScreenRect { x: 0, y: 0, width: 2560, height: 1440 };

    fn state(focus: GameFocus, game_rect: Option<ScreenRect>) -> FocusState {
        FocusState { focus, game_rect, monitor_rect: Some(MONITOR) }
    }

    #[test]
    fn duration_is_clamped_to_3_to_15_seconds() {
        let with = |duration_secs| OverlaySettings { duration_secs, ..OverlaySettings::default() }.sanitized();
        assert_eq!(with(0).duration_secs, MIN_DURATION_SECS);
        assert_eq!(with(2).duration_secs, 3);
        assert_eq!(with(9).duration_secs, 9);
        assert_eq!(with(16).duration_secs, MAX_DURATION_SECS);
        assert_eq!(with(255).duration_secs, 15);
        let custom =
            OverlaySettings { enabled: false, position: OverlayPosition::Left, duration_secs: 4, match_found: false };
        assert_eq!(custom.sanitized(), custom);
    }

    #[test]
    fn available_needs_a_ready_platform_the_setting_a_game_window_and_no_exclusive_fullscreen() {
        let on = OverlaySettings::default();
        let off = OverlaySettings { enabled: false, ..on };
        let focused = state(GameFocus::Focused, Some(GAME));
        assert!(available(true, on, &focused, false));
        assert!(!available(false, on, &focused, false), "Linux without a usable X11 overlay");
        assert!(!available(true, off, &focused, false), "the user turned it off");
        assert!(!available(true, on, &state(GameFocus::Background, None), false), "the game has no window");
        assert!(!available(true, on, &state(GameFocus::Closed, None), false));
        assert!(!available(true, on, &focused, true), "exclusive fullscreen covers it");
        assert!(available(true, on, &state(GameFocus::Background, Some(GAME)), false), "tabbed out still shows");
    }

    #[test]
    fn the_rect_follows_the_game_while_it_is_focused() {
        assert_eq!(show_rect(&state(GameFocus::Focused, Some(GAME))), Some(GAME));
    }

    #[test]
    fn the_rect_is_the_foreground_monitor_otherwise() {
        assert_eq!(show_rect(&state(GameFocus::Background, Some(GAME))), Some(MONITOR));
        let minimized = ScreenRect { x: -32000, y: -32000, width: 0, height: 0 };
        assert_eq!(
            show_rect(&state(GameFocus::Focused, Some(minimized))),
            Some(MONITOR),
            "an empty rect shows nothing"
        );
        assert_eq!(show_rect(&state(GameFocus::Focused, None)), Some(MONITOR));
        assert_eq!(show_rect(&FocusState::default()), None);
    }

    #[test]
    fn a_visible_toast_follows_focus_to_a_new_rect() {
        let other = ScreenRect { x: 2560, y: 0, width: 1920, height: 1080 };
        let other_monitor =
            FocusState { focus: GameFocus::Background, game_rect: Some(GAME), monitor_rect: Some(other) };
        let on_game = state(GameFocus::Focused, Some(GAME));
        assert_eq!(follow_rect(Some(other), &on_game, true), Some(GAME), "clicked into the game");
        assert_eq!(follow_rect(Some(GAME), &other_monitor, true), Some(other), "tabbed out to another monitor");
        assert_eq!(follow_rect(Some(GAME), &on_game, true), None, "unchanged rect");
        assert_eq!(follow_rect(Some(other), &on_game, false), None, "no toast on screen");
        assert_eq!(follow_rect(None, &on_game, true), None, "window not shown yet");
        assert_eq!(follow_rect(Some(GAME), &FocusState::default(), true), None, "no monitor known");
    }

    #[test]
    fn a_visible_toast_is_raised_when_the_game_takes_focus() {
        use GameFocus::*;
        assert!(raise_after_focus(Background, Focused, true));
        assert!(raise_after_focus(Closed, Focused, true));
        assert!(!raise_after_focus(Focused, Focused, true), "the recheck re-sends the same state");
        assert!(!raise_after_focus(Focused, Background, true), "tabbing out raises another window");
        assert!(!raise_after_focus(Background, Focused, false), "no toast on screen");
    }

    #[test]
    fn x11_rects_place_the_window_like_win32_ones() {
        let left = ScreenRect { x: 0, y: 0, width: 1920, height: 1080 };
        let right = ScreenRect { x: 1920, y: 0, width: 2560, height: 1440 };
        let fullscreen_on_right =
            FocusState { focus: GameFocus::Focused, game_rect: Some(right), monitor_rect: Some(right) };
        assert_eq!(show_rect(&fullscreen_on_right), Some(right));
        let browser_on_left =
            FocusState { focus: GameFocus::Background, monitor_rect: Some(left), ..fullscreen_on_right };
        assert_eq!(show_rect(&browser_on_left), Some(left));
        assert_eq!(follow_rect(Some(right), &browser_on_left, true), Some(left));
    }

    #[test]
    fn exclusive_fullscreen_is_latched_while_focused_and_kept_when_tabbed_out() {
        let none = OverlayStatus::default();
        let open = next_status(none, GameFocus::Background, false);
        assert_eq!(open, OverlayStatus { game_open: true, exclusive_fullscreen: false });
        let full = next_status(open, GameFocus::Focused, true);
        assert_eq!(full, OverlayStatus { game_open: true, exclusive_fullscreen: true });
        assert_eq!(next_status(full, GameFocus::Background, false), full, "tabbed out reads busy, not fullscreen");
        assert_eq!(next_status(full, GameFocus::Focused, false), open, "switched to borderless");
        assert_eq!(next_status(full, GameFocus::Closed, true), none, "reset when the game closes");
    }

    #[test]
    fn the_window_opens_with_the_game_and_closes_with_it() {
        use GameFocus::*;
        assert_eq!(lifecycle(Closed, Background), Some(Lifecycle::Create));
        assert_eq!(lifecycle(Closed, Focused), Some(Lifecycle::Create));
        assert_eq!(lifecycle(Focused, Background), None);
        assert_eq!(lifecycle(Background, Focused), None);
        assert_eq!(lifecycle(Focused, Closed), Some(Lifecycle::Close));
        assert_eq!(lifecycle(Background, Closed), Some(Lifecycle::Close));
        assert_eq!(lifecycle(Closed, Closed), None);
    }

    #[test]
    fn a_toast_takes_the_settings_position_and_duration() {
        let settings = OverlaySettings {
            enabled: true,
            position: OverlayPosition::BottomLeft,
            duration_secs: 9,
            match_found: true,
        };
        let t = toast("x".into(), NotificationKind::Alert, ("T".into(), "B".into()), Placement::Center, settings);
        assert_eq!(
            t,
            OverlayToast {
                id: "x".into(),
                kind: NotificationKind::Alert,
                title: "T".into(),
                body: "B".into(),
                placement: Placement::Center,
                position: OverlayPosition::BottomLeft,
                duration_ms: 9000,
            }
        );
    }
}
