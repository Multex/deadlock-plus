#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use crate::focus_state::ScreenRect;

/// Proton names every game window after the Steam app, so this still matches when the game runs in a pid namespace
/// (Flatpak Steam) and its `_NET_WM_PID` means nothing outside it.
const STEAM_APP_CLASS: &str = "steam_app_1422450";

/// One managed top-level X11 window.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct WindowInfo {
    /// `_NET_WM_PID`, 0 when unset.
    pub pid: u32,
    /// Both `WM_CLASS` strings.
    pub class: [String; 2],
    /// Has `WM_TRANSIENT_FOR`, the X11 counterpart of an owned window.
    pub transient: bool,
    /// Mapped and not minimized.
    pub viewable: bool,
    /// Client area in root coordinates.
    pub rect: ScreenRect,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Monitor {
    pub rect: ScreenRect,
    pub primary: bool,
}

pub(crate) fn is_game_window(window: &WindowInfo, game_pid: u32) -> bool {
    (window.pid != 0 && window.pid == game_pid)
        || window
            .class
            .iter()
            .any(|name| crate::is_process(std::ffi::OsStr::new(name)) || name.eq_ignore_ascii_case(STEAM_APP_CLASS))
}

/// Largest client area among the game's unowned windows; empty while minimized, as on Windows.
pub(crate) fn game_rect(windows: &[WindowInfo], game_pid: u32) -> Option<ScreenRect> {
    let mut best: Option<(i64, ScreenRect)> = None;
    for window in windows.iter().filter(|w| !w.transient && is_game_window(w, game_pid)) {
        let rect = if window.viewable { window.rect } else { ScreenRect { width: 0, height: 0, ..window.rect } };
        let area = i64::from(rect.width) * i64::from(rect.height);
        if best.is_none_or(|(most, _)| area > most) {
            best = Some((area, rect));
        }
    }
    best.map(|(_, rect)| rect)
}

/// The monitor a window is on, by largest overlap, then by distance; the primary monitor without a window.
pub(crate) fn monitor_for(window: Option<ScreenRect>, monitors: &[Monitor]) -> Option<ScreenRect> {
    let Some(window) = window else {
        return monitors.iter().find(|m| m.primary).or(monitors.first()).map(|m| m.rect);
    };
    monitors.iter().min_by_key(|m| (std::cmp::Reverse(overlap(window, m.rect)), gap(window, m.rect))).map(|m| m.rect)
}

fn span(a: ScreenRect) -> (i64, i64, i64, i64) {
    let (x, y) = (i64::from(a.x), i64::from(a.y));
    (x, y, x + i64::from(a.width), y + i64::from(a.height))
}

fn overlap(a: ScreenRect, b: ScreenRect) -> i64 {
    let ((al, at, ar, ab), (bl, bt, br, bb)) = (span(a), span(b));
    (ar.min(br) - al.max(bl)).max(0) * (ab.min(bb) - at.max(bt)).max(0)
}

/// Squared distance between the closest edges; 0 when the rects touch or overlap.
fn gap(a: ScreenRect, b: ScreenRect) -> i64 {
    let ((al, at, ar, ab), (bl, bt, br, bb)) = (span(a), span(b));
    let dx = (bl - ar).max(al - br).max(0);
    let dy = (bt - ab).max(at - bb).max(0);
    dx * dx + dy * dy
}

#[cfg(test)]
mod tests {
    use super::*;

    const GAME: u32 = 4242;
    const LEFT: ScreenRect = ScreenRect { x: 0, y: 0, width: 1920, height: 1080 };
    const RIGHT: ScreenRect = ScreenRect { x: 1920, y: 0, width: 2560, height: 1440 };

    fn window(pid: u32, rect: ScreenRect) -> WindowInfo {
        WindowInfo { pid, viewable: true, rect, ..WindowInfo::default() }
    }

    fn classed(instance: &str, class: &str) -> WindowInfo {
        WindowInfo { class: [instance.into(), class.into()], ..window(99, LEFT) }
    }

    fn monitors() -> [Monitor; 2] {
        [Monitor { rect: LEFT, primary: false }, Monitor { rect: RIGHT, primary: true }]
    }

    #[test]
    fn a_window_of_the_game_pid_is_the_game() {
        assert!(is_game_window(&window(GAME, LEFT), GAME));
        assert!(!is_game_window(&window(GAME + 1, LEFT), GAME));
        assert!(!is_game_window(&window(0, LEFT), 0), "a window without _NET_WM_PID is not the game");
    }

    #[test]
    fn a_proton_or_wine_class_is_the_game_under_any_pid() {
        assert!(is_game_window(&classed("steam_app_1422450", "steam_app_1422450"), GAME));
        assert!(is_game_window(&classed("deadlock.exe", "Wine"), GAME));
        assert!(is_game_window(&classed("Deadlock.EXE", "deadlock.exe"), GAME));
        assert!(!is_game_window(&classed("steam_app_1422451", "steam_app_14224500"), GAME));
        assert!(!is_game_window(&classed("deadlock-plus", "Deadlock-plus"), GAME));
    }

    #[test]
    fn the_largest_unowned_game_window_wins() {
        let small = ScreenRect { x: 10, y: 10, width: 640, height: 480 };
        let dialog = WindowInfo { transient: true, ..window(GAME, RIGHT) };
        let windows = [window(GAME, small), dialog, window(7, RIGHT), window(GAME, LEFT), window(GAME, small)];
        assert_eq!(game_rect(&windows, GAME), Some(LEFT));
        assert_eq!(game_rect(&windows[..2], GAME), Some(small));
    }

    #[test]
    fn a_minimized_game_window_reads_empty() {
        let hidden = WindowInfo { viewable: false, ..window(GAME, RIGHT) };
        let rect = game_rect(&[hidden], GAME).unwrap();
        assert_eq!((rect.width, rect.height), (0, 0));
        let hidden = WindowInfo { viewable: false, ..window(GAME, RIGHT) };
        assert_eq!(game_rect(&[hidden, window(GAME, LEFT)], GAME), Some(LEFT));
    }

    #[test]
    fn no_game_window_reads_none() {
        assert_eq!(game_rect(&[], GAME), None);
        assert_eq!(game_rect(&[window(7, LEFT), WindowInfo { transient: true, ..window(GAME, LEFT) }], GAME), None);
    }

    #[test]
    fn the_monitor_with_the_most_overlap_wins() {
        let straddling = ScreenRect { x: 1500, y: 100, width: 1000, height: 600 };
        assert_eq!(monitor_for(Some(straddling), &monitors()), Some(RIGHT));
        let mostly_left = ScreenRect { x: 1000, y: 100, width: 1000, height: 600 };
        assert_eq!(monitor_for(Some(mostly_left), &monitors()), Some(LEFT));
    }

    #[test]
    fn a_window_off_every_monitor_takes_the_nearest() {
        let below_right = ScreenRect { x: 3000, y: 2000, width: 100, height: 100 };
        assert_eq!(monitor_for(Some(below_right), &monitors()), Some(RIGHT));
        let left_of_all = ScreenRect { x: -500, y: 0, width: 100, height: 100 };
        assert_eq!(monitor_for(Some(left_of_all), &monitors()), Some(LEFT));
    }

    #[test]
    fn no_window_reads_the_primary_monitor_then_the_first() {
        assert_eq!(monitor_for(None, &monitors()), Some(RIGHT));
        let no_primary = monitors().map(|m| Monitor { primary: false, ..m });
        assert_eq!(monitor_for(None, &no_primary), Some(LEFT));
        assert_eq!(monitor_for(None, &[]), None);
        assert_eq!(monitor_for(Some(LEFT), &[]), None);
    }
}
