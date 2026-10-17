#![cfg_attr(not(any(windows, target_os = "linux")), allow(dead_code))]

use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum GameFocus {
    #[default]
    Closed,
    Background,
    Focused,
}

/// Physical screen pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ScreenRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct FocusState {
    pub focus: GameFocus,
    /// Client area of the game's main window, so Window mode excludes the title bar. `None` while the game has no
    /// visible window; empty while it is minimized.
    pub game_rect: Option<ScreenRect>,
    /// Monitor of the foreground window, whichever process owns it. `None` while the game is closed.
    pub monitor_rect: Option<ScreenRect>,
}

/// What one refresh reads from the desktop.
pub(crate) trait FocusSource {
    /// 0 when the game is not running.
    fn game_pid(&mut self) -> u32;
    /// Whether the foreground window belongs to the game. Deadlock+'s own windows do not.
    fn game_in_front(&mut self, game_pid: u32) -> bool;
    fn game_rect(&mut self, game_pid: u32) -> Option<ScreenRect>;
    fn foreground_monitor(&mut self) -> Option<ScreenRect>;
}

pub(crate) type Shared = Arc<Mutex<FocusState>>;
pub(crate) type OnChange = Box<dyn Fn(FocusState) + Send>;

pub(crate) struct Tracker<S> {
    source: S,
    shared: Shared,
    on_change: OnChange,
}

impl<S: FocusSource> Tracker<S> {
    pub(crate) fn new(source: S, shared: Shared, on_change: OnChange) -> Self {
        Self { source, shared, on_change }
    }

    #[cfg(target_os = "linux")]
    pub(crate) fn source_mut(&mut self) -> &mut S {
        &mut self.source
    }

    pub(crate) fn refresh(&mut self) {
        let game_pid = self.source.game_pid();
        let next = if game_pid == 0 {
            FocusState::default()
        } else {
            let focus = if self.source.game_in_front(game_pid) { GameFocus::Focused } else { GameFocus::Background };
            FocusState {
                focus,
                game_rect: self.source.game_rect(game_pid),
                monitor_rect: self.source.foreground_monitor(),
            }
        };
        let mut current = self.shared.lock().unwrap_or_else(|e| e.into_inner());
        if *current == next {
            return;
        }
        *current = next;
        drop(current);
        (self.on_change)(next);
    }
}

pub(crate) fn read(shared: &Shared) -> FocusState {
    *shared.lock().unwrap_or_else(|e| e.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    const GAME: u32 = 4242;
    const EXPLORER: u32 = 77;
    const GAME_RECT: ScreenRect = ScreenRect { x: 0, y: 0, width: 2560, height: 1440 };
    const MONITOR: ScreenRect = ScreenRect { x: 0, y: 0, width: 2560, height: 1440 };

    #[derive(Clone, Default)]
    struct Desktop {
        game_pid: u32,
        foreground_pid: u32,
        game_rect: Option<ScreenRect>,
        monitor: Option<ScreenRect>,
    }

    #[derive(Clone, Default)]
    struct FakeSource {
        desktop: Arc<Mutex<Desktop>>,
        window_reads: Arc<Mutex<u32>>,
    }

    impl FakeSource {
        fn set(&self, change: impl FnOnce(&mut Desktop)) {
            change(&mut self.desktop.lock().unwrap());
        }
    }

    impl FocusSource for FakeSource {
        fn game_pid(&mut self) -> u32 {
            self.desktop.lock().unwrap().game_pid
        }
        fn game_in_front(&mut self, game_pid: u32) -> bool {
            *self.window_reads.lock().unwrap() += 1;
            self.desktop.lock().unwrap().foreground_pid == game_pid
        }
        fn game_rect(&mut self, game_pid: u32) -> Option<ScreenRect> {
            *self.window_reads.lock().unwrap() += 1;
            let desktop = self.desktop.lock().unwrap();
            desktop.game_rect.filter(|_| game_pid == desktop.game_pid)
        }
        fn foreground_monitor(&mut self) -> Option<ScreenRect> {
            *self.window_reads.lock().unwrap() += 1;
            self.desktop.lock().unwrap().monitor
        }
    }

    fn tracker(source: &FakeSource) -> (Tracker<FakeSource>, Shared, mpsc::Receiver<FocusState>) {
        let shared = Shared::default();
        let (tx, rx) = mpsc::channel();
        let on_change: OnChange = Box::new(move |state| tx.send(state).unwrap());
        (Tracker::new(source.clone(), shared.clone(), on_change), shared, rx)
    }

    fn game_open(d: &mut Desktop) {
        d.game_pid = GAME;
        d.game_rect = Some(GAME_RECT);
        d.monitor = Some(MONITOR);
    }

    #[test]
    fn launch_focus_tab_out_and_exit_walk_closed_focused_background_closed() {
        let source = FakeSource::default();
        source.set(|d| d.foreground_pid = EXPLORER);
        let (mut tracker, shared, changes) = tracker(&source);

        tracker.refresh();
        assert_eq!(read(&shared), FocusState::default());
        assert!(changes.try_recv().is_err(), "an unchanged state must not notify");

        source.set(|d| {
            game_open(d);
            d.foreground_pid = GAME;
        });
        tracker.refresh();
        let focused = FocusState { focus: GameFocus::Focused, game_rect: Some(GAME_RECT), monitor_rect: Some(MONITOR) };
        assert_eq!(read(&shared), focused);
        assert_eq!(changes.try_recv(), Ok(focused));

        source.set(|d| d.foreground_pid = EXPLORER);
        tracker.refresh();
        let background = FocusState { focus: GameFocus::Background, ..focused };
        assert_eq!(read(&shared), background);
        assert_eq!(changes.try_recv(), Ok(background));

        source.set(|d| *d = Desktop { foreground_pid: EXPLORER, ..Desktop::default() });
        tracker.refresh();
        assert_eq!(read(&shared), FocusState::default());
        assert_eq!(changes.try_recv(), Ok(FocusState::default()));
        assert!(changes.try_recv().is_err());
    }

    #[test]
    fn deadlock_plus_in_front_reads_background() {
        let source = FakeSource::default();
        source.set(|d| {
            game_open(d);
            d.foreground_pid = GAME;
        });
        let (mut tracker, shared, _changes) = tracker(&source);
        tracker.refresh();
        assert_eq!(read(&shared).focus, GameFocus::Focused);

        source.set(|d| d.foreground_pid = std::process::id());
        tracker.refresh();
        assert_eq!(read(&shared).focus, GameFocus::Background);
    }

    #[test]
    fn game_exit_while_focused_reads_closed() {
        let source = FakeSource::default();
        source.set(|d| {
            game_open(d);
            d.foreground_pid = GAME;
        });
        let (mut tracker, shared, changes) = tracker(&source);
        tracker.refresh();
        assert_eq!(read(&shared).focus, GameFocus::Focused);

        // The dead game's pid can still own the foreground for a moment after the process list drops it.
        source.set(|d| d.game_pid = 0);
        tracker.refresh();
        assert_eq!(read(&shared), FocusState::default());
        assert_eq!(changes.try_iter().last(), Some(FocusState::default()));
    }

    #[test]
    fn a_moved_game_window_notifies_with_the_new_rect() {
        let source = FakeSource::default();
        source.set(|d| {
            game_open(d);
            d.foreground_pid = GAME;
        });
        let (mut tracker, shared, changes) = tracker(&source);
        tracker.refresh();
        let moved = ScreenRect { x: 100, y: 50, width: 1280, height: 720 };
        source.set(|d| d.game_rect = Some(moved));
        tracker.refresh();
        assert_eq!(read(&shared).game_rect, Some(moved));
        assert_eq!(changes.try_iter().last().and_then(|s| s.game_rect), Some(moved));
    }

    #[test]
    fn a_closed_game_reads_no_windows() {
        let source = FakeSource::default();
        source.set(|d| d.foreground_pid = EXPLORER);
        let (mut tracker, _shared, _changes) = tracker(&source);
        tracker.refresh();
        tracker.refresh();
        assert_eq!(*source.window_reads.lock().unwrap(), 0);
    }
}
