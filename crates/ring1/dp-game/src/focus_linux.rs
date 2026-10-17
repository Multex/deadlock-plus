use std::io;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use crate::focus_pick;
use crate::focus_state::{read, FocusSource, Shared, Tracker};
pub use crate::focus_state::{FocusState, GameFocus, ScreenRect};
use crate::x11::X11;

/// How often queued X events are checked for a focus change.
const TICK: Duration = Duration::from_millis(100);
const RECHECK: Duration = Duration::from_secs(1);

/// Tracks whether Deadlock's window is in front, where it is, and which monitor the foreground window is on,
/// through X11 (Proton runs the game under XWayland). Deadlock+'s own windows count as "not the game". Without an
/// X display the state stays [`GameFocus::Closed`].
pub struct FocusWatcher {
    shared: Shared,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl FocusWatcher {
    /// Spawns the watcher thread. `on_change` runs on that thread after every state change, including a moved or
    /// resized game window.
    pub fn start(on_change: impl Fn(FocusState) + Send + 'static) -> io::Result<Self> {
        let shared = Shared::default();
        let stop = Arc::new(AtomicBool::new(false));
        let (thread_shared, thread_stop) = (shared.clone(), stop.clone());
        let thread = thread::Builder::new().name("game-focus-watcher".into()).spawn(move || {
            let source = X11Source::new(|| crate::find_pid(crate::is_process), || X11::open(None));
            run(Tracker::new(source, thread_shared, Box::new(on_change)), &thread_stop);
        })?;
        Ok(Self { shared, stop, thread: Some(thread) })
    }

    pub fn state(&self) -> FocusState {
        read(&self.shared)
    }

    pub fn stop(mut self) {
        self.shutdown();
    }

    fn shutdown(&mut self) {
        let Some(thread) = self.thread.take() else { return };
        self.stop.store(true, Ordering::Release);
        thread.thread().unpark();
        let _ = thread.join();
    }
}

impl Drop for FocusWatcher {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn run(mut tracker: Tracker<X11Source>, stop: &AtomicBool) {
    tracker.refresh();
    let mut last = Instant::now();
    while !stop.load(Ordering::Acquire) {
        thread::park_timeout(TICK);
        let changed = tracker.source_mut().x11.as_ref().is_some_and(X11::active_window_changed);
        // The recheck catches the game starting, exiting or moving, none of which changes the active window.
        if changed || last.elapsed() >= RECHECK {
            tracker.refresh();
            last = Instant::now();
        }
    }
}

/// Holds an X connection only while the game runs, so an on-demand XWayland is not kept alive for nothing.
struct X11Source {
    find_game: fn() -> u32,
    open: fn() -> Option<X11>,
    x11: Option<X11>,
}

impl X11Source {
    fn new(find_game: fn() -> u32, open: fn() -> Option<X11>) -> Self {
        Self { find_game, open, x11: None }
    }
}

impl FocusSource for X11Source {
    fn game_pid(&mut self) -> u32 {
        let pid = (self.find_game)();
        if pid == 0 {
            self.x11 = None;
        } else if self.x11.is_none() {
            self.x11 = (self.open)();
        }
        // Without X the foreground is unknown; Closed keeps callers from treating the game as tabbed out.
        if self.x11.is_some() {
            pid
        } else {
            0
        }
    }

    fn game_in_front(&mut self, game_pid: u32) -> bool {
        self.x11.as_ref().and_then(X11::active_window).is_some_and(|w| focus_pick::is_game_window(&w, game_pid))
    }

    fn game_rect(&mut self, game_pid: u32) -> Option<ScreenRect> {
        focus_pick::game_rect(&self.x11.as_ref()?.client_windows(), game_pid)
    }

    fn foreground_monitor(&mut self) -> Option<ScreenRect> {
        let x11 = self.x11.as_ref()?;
        focus_pick::monitor_for(x11.active_window().map(|w| w.rect), &x11.monitors())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_running_game_without_an_x_display_reads_closed() {
        let (tx, changes) = std::sync::mpsc::channel();
        let shared = Shared::default();
        let source = X11Source::new(|| 4242, || None);
        let mut tracker = Tracker::new(source, shared.clone(), Box::new(move |state| tx.send(state).unwrap()));
        tracker.refresh();
        assert_eq!(read(&shared), FocusState::default());
        assert!(changes.try_recv().is_err());
    }

    #[test]
    fn stop_ends_the_watcher_thread() {
        let watcher = FocusWatcher::start(|_| {}).unwrap();
        let _ = watcher.state();
        let started = Instant::now();
        watcher.stop();
        assert!(started.elapsed() < Duration::from_secs(1));
    }
}
