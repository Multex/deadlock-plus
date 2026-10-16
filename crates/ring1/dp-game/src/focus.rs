use std::cell::RefCell;
use std::io;
use std::sync::mpsc;
use std::thread::{self, JoinHandle};

use windows::Win32::Foundation::{BOOL, HMODULE, HWND, LPARAM, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    ClientToScreen, GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST, MONITOR_DEFAULTTOPRIMARY,
};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, EnumWindows, GetClientRect, GetForegroundWindow, GetMessageW, GetWindow,
    GetWindowThreadProcessId, IsWindowVisible, KillTimer, PeekMessageW, PostThreadMessageW, SetTimer,
    EVENT_SYSTEM_FOREGROUND, GW_OWNER, MSG, PM_NOREMOVE, WINEVENT_OUTOFCONTEXT, WM_QUIT, WM_TIMER, WM_USER,
};

use crate::focus_state::{read, FocusSource, Shared, Tracker};
pub use crate::focus_state::{FocusState, GameFocus, ScreenRect};

const RECHECK_MS: u32 = 1000;

/// Tracks whether Deadlock's window is in front, where it is, and which monitor the foreground window is on.
/// Deadlock+'s own windows count as "not the game", so bringing the app forward reads [`GameFocus::Background`].
pub struct FocusWatcher {
    shared: Shared,
    thread_id: u32,
    thread: Option<JoinHandle<()>>,
}

impl FocusWatcher {
    /// Spawns the watcher thread. `on_change` runs on that thread after every state change, including a moved or
    /// resized game window.
    pub fn start(on_change: impl Fn(FocusState) + Send + 'static) -> io::Result<Self> {
        let shared = Shared::default();
        let (ready, started) = mpsc::channel();
        let thread_shared = shared.clone();
        let thread = thread::Builder::new()
            .name("game-focus-watcher".into())
            .spawn(move || run(Tracker::new(Win32Source, thread_shared, Box::new(on_change)), ready))?;
        let thread_id = started.recv().map_err(|_| io::Error::other("focus watcher exited during startup"))?;
        Ok(Self { shared, thread_id, thread: Some(thread) })
    }

    pub fn state(&self) -> FocusState {
        read(&self.shared)
    }

    pub fn stop(mut self) {
        self.shutdown();
    }

    fn shutdown(&mut self) {
        let Some(thread) = self.thread.take() else { return };
        // SAFETY: posting to a thread id has no preconditions; the queue exists before `start` returns.
        unsafe {
            let _ = PostThreadMessageW(self.thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
        }
        let _ = thread.join();
    }
}

impl Drop for FocusWatcher {
    fn drop(&mut self) {
        self.shutdown();
    }
}

thread_local! {
    static TRACKER: RefCell<Option<Tracker<Win32Source>>> = const { RefCell::new(None) };
}

fn refresh() {
    TRACKER.with(|slot| {
        // A foreground event can arrive while `on_change` waits on a cross-thread call; the next timer tick
        // catches up instead.
        if let Ok(mut tracker) = slot.try_borrow_mut() {
            if let Some(tracker) = tracker.as_mut() {
                tracker.refresh();
            }
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
    refresh();
}

fn run(tracker: Tracker<Win32Source>, ready: mpsc::Sender<u32>) {
    // SAFETY: the hook, timer and message loop all live on this thread; the hook and timer are removed before it
    // exits, and the callback only touches this thread's `TRACKER` slot.
    unsafe {
        let mut msg = MSG::default();
        // Forces the thread's message queue into existence so a quit posted from `stop` is not lost.
        let _ = PeekMessageW(&mut msg, None, WM_USER, WM_USER, PM_NOREMOVE);
        let _ = ready.send(GetCurrentThreadId());

        TRACKER.with(|slot| *slot.borrow_mut() = Some(tracker));
        refresh();

        // No `WINEVENT_SKIPOWNPROCESS`: Deadlock+ coming to the front must read as the game losing focus.
        let hook = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            HMODULE::default(),
            Some(on_foreground_change),
            0,
            0,
            WINEVENT_OUTOFCONTEXT,
        );
        // Catches the game starting, exiting or moving, none of which changes the foreground window.
        let timer = SetTimer(None, 0, RECHECK_MS, None);

        while GetMessageW(&mut msg, None, 0, 0).0 > 0 {
            if msg.message == WM_TIMER {
                refresh();
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
    TRACKER.with(|slot| slot.borrow_mut().take());
}

struct Win32Source;

impl FocusSource for Win32Source {
    fn game_pid(&mut self) -> u32 {
        crate::find_pid(crate::is_process)
    }

    fn foreground_pid(&mut self) -> u32 {
        // SAFETY: both calls take no ownership; a null window yields pid 0.
        unsafe { window_pid(GetForegroundWindow()) }
    }

    fn game_rect(&mut self, game_pid: u32) -> Option<ScreenRect> {
        let mut search = WindowSearch { pid: game_pid, best: None };
        // SAFETY: `search` outlives the call and the callback only reads it through the LPARAM it is given.
        unsafe {
            let _ = EnumWindows(Some(collect_game_window), LPARAM(&mut search as *mut WindowSearch as isize));
        }
        search.best.map(|(_, rect)| rect)
    }

    fn foreground_monitor(&mut self) -> Option<ScreenRect> {
        // SAFETY: `info` is sized as the API requires; a null foreground window falls back to the primary monitor.
        unsafe {
            let hwnd = GetForegroundWindow();
            let fallback = if hwnd.is_invalid() { MONITOR_DEFAULTTOPRIMARY } else { MONITOR_DEFAULTTONEAREST };
            let monitor = MonitorFromWindow(hwnd, fallback);
            let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
            GetMonitorInfoW(monitor, &mut info).as_bool().then(|| screen_rect(info.rcMonitor))
        }
    }
}

struct WindowSearch {
    pid: u32,
    best: Option<(i64, ScreenRect)>,
}

unsafe fn window_pid(hwnd: HWND) -> u32 {
    let mut pid = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    pid
}

unsafe extern "system" fn collect_game_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let search = &mut *(lparam.0 as *mut WindowSearch);
    let owned = GetWindow(hwnd, GW_OWNER).is_ok_and(|owner| !owner.is_invalid());
    if IsWindowVisible(hwnd).as_bool() && !owned && window_pid(hwnd) == search.pid {
        if let Some(rect) = client_rect(hwnd) {
            let area = i64::from(rect.width) * i64::from(rect.height);
            if search.best.is_none_or(|(best, _)| area > best) {
                search.best = Some((area, rect));
            }
        }
    }
    BOOL::from(true)
}

unsafe fn client_rect(hwnd: HWND) -> Option<ScreenRect> {
    let mut client = RECT::default();
    GetClientRect(hwnd, &mut client).ok()?;
    let mut origin = POINT { x: client.left, y: client.top };
    ClientToScreen(hwnd, &mut origin).as_bool().then_some(ScreenRect {
        x: origin.x,
        y: origin.y,
        width: client.right - client.left,
        height: client.bottom - client.top,
    })
}

fn screen_rect(rect: RECT) -> ScreenRect {
    ScreenRect { x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stop_ends_the_watcher_thread() {
        let watcher = FocusWatcher::start(|_| {}).unwrap();
        let _ = watcher.state();
        watcher.stop();
    }
}
