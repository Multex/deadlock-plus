use std::cell::RefCell;
use std::os::windows::process::CommandExt;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use ferrisetw::provider::Provider;
use ferrisetw::trace::{TraceTrait, UserTrace};
use ferrisetw::EventRecord;
use windows::Win32::Foundation::{HMODULE, HWND, LPARAM, WPARAM};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, GetForegroundWindow, GetMessageW, GetWindowThreadProcessId, KillTimer, PeekMessageW,
    PostThreadMessageW, SetTimer, EVENT_SYSTEM_FOREGROUND, MSG, PM_NOREMOVE, WINEVENT_OUTOFCONTEXT,
    WINEVENT_SKIPOWNPROCESS, WM_QUIT, WM_TIMER, WM_USER,
};

pub use crate::status::{CaptureError, CaptureState, CaptureStatus};
use crate::{recent_frametimes_ms, split_focused, FrameStats};
use dp_sync::LockExt;

const DXGI_PROVIDER: &str = "CA11C036-0102-4A2D-A6AD-F03CFED5D3C9";
const DXGI_KEYWORD: u64 = 0x8000_0000_0000_0002;
const PRESENT_START: u16 = 0x2a;
const SESSION: &str = "DeadlockPlusFrames";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// Event timestamps arrive as 100 ns FILETIME because the trace is not opened in raw-timestamp mode.
const TICKS_PER_SECOND: u64 = 10_000_000;
const MAX_FRAMES: usize = 1_000_000;
const LIVE_WINDOW: usize = 300;
const FOCUS_RECHECK_MS: u32 = 1000;
/// Frames this close to a focus change are dropped too: the game hitches as it resumes.
const FOCUS_PAD_TICKS: u64 = 2_500_000;
const UNIX_TO_FILETIME_TICKS: u64 = 116_444_736_000_000_000;

/// One present as a trace source reports it. `pid: None` means the source already kept only the game's.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Present {
    Frame { pid: Option<u32>, ticks: u64 },
    Others(u32),
}

pub type PresentSink = Arc<dyn Fn(Present) + Send + Sync>;
pub type OnTraceError = Box<dyn FnOnce(CaptureError) + Send>;
/// Starts delivering presents to the sink; sending on (or dropping) the returned channel stops it.
pub type PresentSource = fn(PresentSink, OnTraceError) -> Sender<()>;

struct Shared {
    timestamps: Mutex<Vec<u64>>,
    max_frames: usize,
    game_pid: AtomicU32,
    other_events: AtomicU64,
    truncated: AtomicBool,
    game_focused: AtomicBool,
    focus_thread: AtomicU32,
    unfocused: Mutex<Vec<(u64, u64)>>,
    stop: AtomicBool,
    error: Mutex<Option<CaptureError>>,
    started: Instant,
}

impl Shared {
    fn new(max_frames: usize) -> Self {
        Self {
            timestamps: Mutex::new(Vec::with_capacity(60 * 60 * 10)),
            max_frames,
            game_pid: AtomicU32::new(0),
            other_events: AtomicU64::new(0),
            truncated: AtomicBool::new(false),
            game_focused: AtomicBool::new(true),
            focus_thread: AtomicU32::new(0),
            unfocused: Mutex::new(Vec::new()),
            stop: AtomicBool::new(false),
            error: Mutex::new(None),
            started: Instant::now(),
        }
    }

    fn record(&self, present: Present) {
        match present {
            Present::Others(count) => {
                self.other_events.fetch_add(count as u64, Ordering::Relaxed);
            }
            Present::Frame { pid: Some(pid), .. } if pid != self.game_pid.load(Ordering::Relaxed) => {
                self.other_events.fetch_add(1, Ordering::Relaxed);
            }
            Present::Frame { ticks, .. } => {
                let mut ts = self.timestamps.lock_or_recover();
                if ts.len() < self.max_frames {
                    ts.push(ticks);
                } else {
                    self.truncated.store(true, Ordering::Relaxed);
                }
            }
        }
    }
}

struct Running {
    shared: Arc<Shared>,
    stop_trace: Sender<()>,
}

#[derive(Default)]
pub struct FrameCapture {
    running: Mutex<Option<Running>>,
}

impl FrameCapture {
    pub fn start(&self, find_game_pid: fn() -> u32) {
        self.start_with(find_game_pid, start_present_trace);
    }

    pub fn start_with(&self, find_game_pid: fn() -> u32, source: PresentSource) {
        let mut guard = self.running.lock_or_recover();
        if guard.is_some() {
            return;
        }
        let shared = Arc::new(Shared::new(MAX_FRAMES));
        log::info!("frame capture starting");
        let sink_shared = shared.clone();
        let error_shared = shared.clone();
        let stop_trace = source(
            Arc::new(move |present| sink_shared.record(present)),
            Box::new(move |error| *error_shared.error.lock_or_recover() = Some(error)),
        );
        spawn_pid_poller(shared.clone(), find_game_pid);
        spawn_focus_watcher(shared.clone());
        *guard = Some(Running { shared, stop_trace });
    }

    /// Unused here: the capture watches the foreground itself, from the same thread that hooks it.
    pub fn set_game_focused(&self, _focused: bool) {}

    pub fn status(&self) -> CaptureStatus {
        let guard = self.running.lock_or_recover();
        let Some(r) = guard.as_ref() else {
            return CaptureStatus::default();
        };
        let s = &r.shared;
        let error = *s.error.lock_or_recover();
        let (frames, recent) = {
            let ts = s.timestamps.lock_or_recover();
            (ts.len(), recent_frametimes_ms(&ts, LIVE_WINDOW, TICKS_PER_SECOND))
        };
        let state = if error.is_some() {
            CaptureState::Failed
        } else if s.game_pid.load(Ordering::Relaxed) == 0 {
            CaptureState::WaitingForGame
        } else {
            CaptureState::Capturing
        };
        CaptureStatus {
            state,
            error,
            frames: frames as u32,
            elapsed_ms: s.started.elapsed().as_millis().min(u32::MAX as u128) as u32,
            other_process_events: s.other_events.load(Ordering::Relaxed).min(u32::MAX as u64) as u32,
            truncated: s.truncated.load(Ordering::Relaxed),
            game_focused: s.game_focused.load(Ordering::Relaxed),
            recent_frametimes_ms: recent,
        }
    }

    /// Ends the session and returns the statistics for what it recorded.
    pub fn stop(&self) -> FrameStats {
        let Some(r) = self.running.lock_or_recover().take() else {
            return FrameStats::default();
        };
        log::info!("frame capture stopping");
        r.shared.stop.store(true, Ordering::SeqCst);
        let focus_thread = r.shared.focus_thread.load(Ordering::SeqCst);
        if focus_thread != 0 {
            // SAFETY: posting to a thread id has no preconditions; it fails harmlessly if the thread is gone.
            unsafe {
                let _ = PostThreadMessageW(focus_thread, WM_QUIT, WPARAM(0), LPARAM(0));
            }
        }
        let _ = r.stop_trace.send(());
        let timestamps = std::mem::take(&mut *r.shared.timestamps.lock_or_recover());
        let unfocused = std::mem::take(&mut *r.shared.unfocused.lock_or_recover());
        let padded: Vec<(u64, u64)> =
            unfocused.iter().map(|&(a, b)| (a.saturating_sub(FOCUS_PAD_TICKS), b + FOCUS_PAD_TICKS)).collect();
        let mut stats = FrameStats::from_segments(&split_focused(&timestamps, &padded), TICKS_PER_SECOND);
        stats.background_ms =
            unfocused.iter().map(|&(a, b)| b.saturating_sub(a)).sum::<u64>() as f64 * 1000.0 / TICKS_PER_SECOND as f64;
        log::info!(
            "frame capture result: {} frames over {:.1}s, median {:.2} ms, p99 {:.2} ms, max {:.2} ms, {} spikes",
            stats.frame_count,
            stats.duration_ms / 1000.0,
            stats.median_ms,
            stats.p99_ms,
            stats.max_ms,
            stats.spikes.len()
        );
        stats
    }
}

/// Runs system tools from the system directory, not `PATH` or the working directory, so a planted copy cannot
/// stand in for them.
fn system32_tool(system_root: Option<std::ffi::OsString>, name: &str) -> std::path::PathBuf {
    let root = system_root.filter(|r| !r.is_empty()).unwrap_or_else(|| r"C:\Windows".into());
    std::path::Path::new(&root).join("System32").join(name)
}

/// The DXGI present trace. Needs administrator or Performance Log Users.
pub fn start_present_trace(sink: PresentSink, on_error: OnTraceError) -> Sender<()> {
    let (tx, rx) = mpsc::channel::<()>();

    thread::Builder::new()
        .name("etw-frames-session".into())
        .spawn(move || {
            // ETW sessions outlive the process that created them, so clear one left by a crashed run.
            if let Err(e) = std::process::Command::new(system32_tool(std::env::var_os("SystemRoot"), "logman.exe"))
                .args(["stop", SESSION, "-ets"])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
            {
                log::debug!("could not run logman to clear a stale frame session: {e}");
            }

            let callback = move |record: &EventRecord, _locator: &ferrisetw::schema_locator::SchemaLocator| {
                if record.event_id() == PRESENT_START {
                    sink(Present::Frame { pid: Some(record.process_id()), ticks: record.raw_timestamp() as u64 });
                }
            };

            let provider = Provider::by_guid(DXGI_PROVIDER).any(DXGI_KEYWORD).add_callback(callback).build();
            match UserTrace::new().named(SESSION.to_string()).enable(provider).start() {
                Ok((trace, handle)) => {
                    log::info!("frame trace started");
                    thread::Builder::new()
                        .name("etw-frames-processor".into())
                        .spawn(move || {
                            if let Err(e) = UserTrace::process_from_handle(handle) {
                                log::warn!("frame trace processing ended with an error: {e:?}");
                            }
                        })
                        .expect("spawn thread");
                    let _ = rx.recv();
                    drop(trace);
                }
                Err(e) => {
                    log::error!("couldn't start the frame trace (needs administrator): {e:?}");
                    on_error(CaptureError::NeedsAdmin);
                }
            }
        })
        .expect("spawn thread");

    tx
}

fn spawn_pid_poller(shared: Arc<Shared>, find_game_pid: fn() -> u32) {
    thread::Builder::new()
        .name("frames-pid-poller".into())
        .spawn(move || {
            let mut ticks = 0u32;
            while !shared.stop.load(Ordering::SeqCst) {
                let pid = find_game_pid();
                shared.game_pid.store(pid, Ordering::Relaxed);
                ticks += 1;
                if ticks.is_multiple_of(5) {
                    log::debug!(
                        "frame capture: game pid {pid}, {} frames, {} present events from other processes",
                        shared.timestamps.lock_or_recover().len(),
                        shared.other_events.load(Ordering::Relaxed)
                    );
                }
                thread::sleep(Duration::from_secs(1));
            }
        })
        .expect("spawn thread");
}

fn filetime_now() -> u64 {
    let since_unix = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| (d.as_nanos() / 100) as u64).unwrap_or(0);
    since_unix + UNIX_TO_FILETIME_TICKS
}

fn foreground_pid() -> u32 {
    // SAFETY: both calls take no ownership; a null window yields pid 0.
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_invalid() {
            return 0;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        pid
    }
}

#[derive(Default)]
struct FocusTracker {
    open_since: Option<u64>,
}

impl FocusTracker {
    /// Returns the finished unfocused interval when focus comes back.
    fn update(&mut self, focused: bool, now: u64) -> Option<(u64, u64)> {
        match (focused, self.open_since) {
            (false, None) => {
                self.open_since = Some(now);
                None
            }
            (true, Some(start)) => {
                self.open_since = None;
                Some((start, now))
            }
            _ => None,
        }
    }

    fn finish(&mut self, now: u64) -> Option<(u64, u64)> {
        self.open_since.take().map(|start| (start, now))
    }
}

struct FocusState {
    shared: Arc<Shared>,
    tracker: FocusTracker,
}

impl FocusState {
    fn refresh(&mut self) {
        let game = self.shared.game_pid.load(Ordering::Relaxed);
        let focused = game == 0 || foreground_pid() == game;
        self.shared.game_focused.store(focused, Ordering::Relaxed);
        if let Some(interval) = self.tracker.update(focused, filetime_now()) {
            self.shared.unfocused.lock_or_recover().push(interval);
        }
    }
}

thread_local! {
    static FOCUS: RefCell<Option<FocusState>> = const { RefCell::new(None) };
}

fn refresh_focus() {
    FOCUS.with(|f| {
        if let Some(state) = f.borrow_mut().as_mut() {
            state.refresh();
        }
    });
}

unsafe extern "system" fn on_foreground_change(
    _hook: HWINEVENTHOOK,
    _event: u32,
    _hwnd: HWND,
    _object: i32,
    _child: i32,
    _thread: u32,
    _time: u32,
) {
    refresh_focus();
}

/// Records when the game window loses the foreground, so tab-outs (where the engine may cap or
/// suspend rendering) do not read as stutter. Foreground changes arrive as events on a message loop, so
/// the thread sleeps between them. The 1 s timer only catches the game process appearing while another
/// window already has focus.
fn spawn_focus_watcher(shared: Arc<Shared>) {
    thread::Builder::new()
        .name("frames-focus-watcher".into())
        .spawn(move || {
            // SAFETY: the hook, timer and message loop all live on this thread; the hook is removed before it
            // exits, and the callback only touches this thread's `FOCUS` slot.
            unsafe {
                let mut msg = MSG::default();
                // Forces the thread's message queue into existence so a quit posted from `stop` is not lost.
                let _ = PeekMessageW(&mut msg, None, WM_USER, WM_USER, PM_NOREMOVE);
                shared.focus_thread.store(GetCurrentThreadId(), Ordering::SeqCst);

                FOCUS.with(|f| {
                    let mut state = FocusState { shared: shared.clone(), tracker: FocusTracker::default() };
                    state.refresh();
                    *f.borrow_mut() = Some(state);
                });

                let hook = SetWinEventHook(
                    EVENT_SYSTEM_FOREGROUND,
                    EVENT_SYSTEM_FOREGROUND,
                    HMODULE::default(),
                    Some(on_foreground_change),
                    0,
                    0,
                    WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
                );
                if hook.is_invalid() {
                    log::warn!("could not hook foreground changes; focus is only checked once a second");
                }
                let timer = SetTimer(None, 0, FOCUS_RECHECK_MS, None);

                while !shared.stop.load(Ordering::SeqCst) && GetMessageW(&mut msg, None, 0, 0).0 > 0 {
                    if msg.message == WM_TIMER {
                        refresh_focus();
                    }
                    let _ = DispatchMessageW(&msg);
                }

                if timer != 0 {
                    let _ = KillTimer(None, timer);
                }
                if !hook.is_invalid() {
                    let _ = UnhookWinEvent(hook);
                }
            }
            let open = FOCUS.with(|f| f.borrow_mut().take()).and_then(|mut s| s.tracker.finish(filetime_now()));
            if let Some(interval) = open {
                shared.unfocused.lock_or_recover().push(interval);
            }
        })
        .expect("spawn thread");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn recorder(game_pid: u32, max_frames: usize) -> Shared {
        let shared = Shared::new(max_frames);
        shared.game_pid.store(game_pid, Ordering::Relaxed);
        shared
    }

    #[test]
    fn a_pidless_frame_counts_as_the_game_even_before_its_pid_is_known() {
        for game_pid in [0, 42] {
            let s = recorder(game_pid, 10);
            s.record(Present::Frame { pid: None, ticks: 7 });
            assert_eq!(*s.timestamps.lock_or_recover(), vec![7]);
            assert_eq!(s.other_events.load(Ordering::Relaxed), 0);
        }
    }

    #[test]
    fn frames_from_another_pid_count_as_other_events_only() {
        let s = recorder(42, 10);
        s.record(Present::Frame { pid: Some(42), ticks: 1 });
        s.record(Present::Frame { pid: Some(7), ticks: 2 });
        s.record(Present::Frame { pid: Some(0), ticks: 3 });
        assert_eq!(*s.timestamps.lock_or_recover(), vec![1]);
        assert_eq!(s.other_events.load(Ordering::Relaxed), 2);
    }

    #[test]
    fn a_frame_with_a_pid_before_the_game_is_found_is_another_process() {
        let s = recorder(0, 10);
        s.record(Present::Frame { pid: Some(9), ticks: 1 });
        assert!(s.timestamps.lock_or_recover().is_empty());
        assert_eq!(s.other_events.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn others_add_their_count() {
        let s = recorder(42, 10);
        s.record(Present::Others(5));
        s.record(Present::Others(u32::MAX));
        assert_eq!(s.other_events.load(Ordering::Relaxed), 5 + u32::MAX as u64);
        assert!(s.timestamps.lock_or_recover().is_empty());
    }

    #[test]
    fn frames_past_the_cap_are_dropped_and_flagged() {
        let s = recorder(42, 2);
        for ticks in 1..=3 {
            s.record(Present::Frame { pid: None, ticks });
        }
        assert_eq!(*s.timestamps.lock_or_recover(), vec![1, 2]);
        assert!(s.truncated.load(Ordering::Relaxed));
    }

    #[test]
    fn frames_under_the_cap_are_not_flagged() {
        let s = recorder(42, 2);
        s.record(Present::Frame { pid: None, ticks: 1 });
        s.record(Present::Frame { pid: None, ticks: 2 });
        assert_eq!(s.timestamps.lock_or_recover().len(), 2);
        assert!(!s.truncated.load(Ordering::Relaxed));
    }

    fn no_game() -> u32 {
        0
    }

    fn fake_source(sink: PresentSink, _on_error: OnTraceError) -> Sender<()> {
        sink(Present::Frame { pid: None, ticks: 10 });
        sink(Present::Frame { pid: None, ticks: 20 });
        sink(Present::Others(3));
        mpsc::channel().0
    }

    fn failing_source(_sink: PresentSink, on_error: OnTraceError) -> Sender<()> {
        on_error(CaptureError::NeedsAdmin);
        mpsc::channel().0
    }

    #[test]
    fn a_supplied_source_feeds_the_capture() {
        let capture = FrameCapture::default();
        capture.start_with(no_game, fake_source);
        let status = capture.status();
        assert_eq!((status.frames, status.other_process_events, status.error), (2, 3, None));
        assert_eq!(capture.stop().frame_count, 1);
    }

    #[test]
    fn a_source_error_fails_the_capture() {
        let capture = FrameCapture::default();
        capture.start_with(no_game, failing_source);
        let status = capture.status();
        assert_eq!((status.state, status.error), (CaptureState::Failed, Some(CaptureError::NeedsAdmin)));
        capture.stop();
    }

    #[test]
    fn logman_runs_from_the_system_directory() {
        let tool = |root: Option<&str>| system32_tool(root.map(std::ffi::OsString::from), "logman.exe");
        assert_eq!(tool(Some(r"D:\Win")), std::path::PathBuf::from(r"D:\Win\System32\logman.exe"));
        assert_eq!(tool(None), std::path::PathBuf::from(r"C:\Windows\System32\logman.exe"));
        assert_eq!(tool(Some("")), std::path::PathBuf::from(r"C:\Windows\System32\logman.exe"));
    }

    #[test]
    fn leaving_and_returning_yields_one_interval() {
        let mut t = FocusTracker::default();
        assert_eq!(t.update(true, 10), None);
        assert_eq!(t.update(false, 20), None);
        assert_eq!(t.update(false, 25), None);
        assert_eq!(t.update(true, 30), Some((20, 30)));
        assert_eq!(t.update(true, 40), None);
    }

    #[test]
    fn finishing_while_away_closes_the_open_interval_once() {
        let mut t = FocusTracker::default();
        t.update(false, 5);
        assert_eq!(t.finish(9), Some((5, 9)));
        assert_eq!(t.finish(12), None);
    }

    #[test]
    fn finishing_while_focused_yields_nothing() {
        let mut t = FocusTracker::default();
        t.update(true, 5);
        assert_eq!(t.finish(9), None);
    }
}
