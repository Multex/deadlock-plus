use dp_game::focus::ScreenRect;
use tauri::AppHandle;

pub(super) const LABEL: &str = "overlay";

pub(super) use platform::{create, destroy, exclusive_fullscreen, hide, platform_ready, raise, show};

#[cfg(windows)]
mod platform {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
    use windows::Win32::Foundation::{COLORREF, HWND};
    use windows::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_RUNNING_D3D_FULL_SCREEN};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetLayeredWindowAttributes, SetWindowLongPtrW, SetWindowPos, ShowWindow, GWL_EXSTYLE,
        HWND_TOPMOST, LWA_ALPHA, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SW_HIDE,
        SW_SHOWNOACTIVATE, WS_EX_APPWINDOW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
        WS_EX_TRANSPARENT,
    };

    use super::*;

    /// Never Tauri's `show()`/`hide()` on this window: tao activates a window on every show after the first, which
    /// would pull focus out of the game. Everything below goes through the HWND instead.
    pub(crate) fn create(app: &AppHandle) -> tauri::Result<()> {
        if app.get_webview_window(LABEL).is_some() {
            return Ok(());
        }
        // With the undecorated shadow on, WebView2 paints an opaque white background.
        let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("overlay".into()))
            .title("Deadlock+ overlay")
            .visible(false)
            .focused(false)
            .focusable(false)
            .transparent(true)
            .decorations(false)
            .shadow(false)
            .skip_taskbar(true)
            .always_on_top(true)
            .build()?;
        window.set_ignore_cursor_events(true)?;
        on_main_thread(&window, |hwnd| {
            apply_styles(hwnd);
            let ex = current_ex_style(hwnd);
            if ex & wanted_ex_style() == wanted_ex_style() && ex & WS_EX_APPWINDOW.0 == 0 {
                log::info!("overlay window created (ex style 0x{ex:08x})");
            } else {
                log::warn!("overlay window ex style 0x{ex:08x} lacks 0x{:08x}", wanted_ex_style());
            }
        });
        Ok(())
    }

    pub(crate) fn destroy(app: &AppHandle) {
        if let Some(window) = app.get_webview_window(LABEL) {
            if let Err(e) = window.destroy() {
                log::warn!("could not close the overlay window: {e}");
            }
        }
    }

    /// Position before size: a move onto a monitor with another DPI rescales the window, and the size set after
    /// it wins.
    pub(crate) fn show(app: &AppHandle, rect: ScreenRect) {
        let Some(window) = app.get_webview_window(LABEL) else {
            return;
        };
        on_main_thread(&window, move |hwnd| unsafe {
            apply_styles(hwnd);
            if let Err(e) = SetWindowPos(hwnd, HWND_TOPMOST, rect.x, rect.y, 0, 0, SWP_NOSIZE | SWP_NOACTIVATE)
                .and_then(|()| {
                    SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, rect.width, rect.height, SWP_NOMOVE | SWP_NOACTIVATE)
                })
            {
                log::warn!("could not place the overlay window: {e}");
            }
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        });
    }

    pub(crate) fn hide(app: &AppHandle) {
        if let Some(window) = app.get_webview_window(LABEL) {
            on_main_thread(&window, |hwnd| unsafe {
                let _ = ShowWindow(hwnd, SW_HIDE);
            });
        }
    }

    /// Only means "the game" while the game is in front; tabbed out it reads busy (5), not fullscreen.
    pub(crate) fn exclusive_fullscreen() -> bool {
        unsafe { SHQueryUserNotificationState() }.is_ok_and(|state| state == QUNS_RUNNING_D3D_FULL_SCREEN)
    }

    pub(crate) fn platform_ready() -> bool {
        true
    }

    /// `HWND_TOPMOST` on every show already keeps it above the game.
    pub(crate) fn raise(_app: &AppHandle) {}

    fn wanted_ex_style() -> u32 {
        (WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST | WS_EX_LAYERED | WS_EX_TRANSPARENT).0
    }

    pub(super) fn merged_ex_style(current: u32) -> u32 {
        (current | wanted_ex_style()) & !WS_EX_APPWINDOW.0
    }

    fn current_ex_style(hwnd: HWND) -> u32 {
        unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32 }
    }

    /// tao rewrites the whole ex style whenever one of its own flags changes, so this runs before every show.
    /// Click-through makes the window layered, and a layered window draws nothing until it has layered attributes.
    fn apply_styles(hwnd: HWND) {
        let current = current_ex_style(hwnd);
        let merged = merged_ex_style(current);
        unsafe {
            if merged != current {
                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, merged as isize);
                let _ = SetWindowPos(
                    hwnd,
                    None,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
                );
            }
            if let Err(e) = SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA) {
                log::warn!("could not set the overlay window's layered attributes: {e}");
            }
        }
    }

    /// Queued behind the style changes tauri has already posted to the event loop (`set_ignore_cursor_events`), so
    /// they have landed by the time `f` runs.
    fn on_main_thread(window: &WebviewWindow, f: impl FnOnce(HWND) + Send + 'static) {
        let raw = match window.window_handle().map(|h| h.as_raw()) {
            Ok(RawWindowHandle::Win32(h)) => h.hwnd.get(),
            _ => return,
        };
        if let Err(e) = window.run_on_main_thread(move || f(HWND(raw as *mut core::ffi::c_void))) {
            log::warn!("could not reach the overlay window: {e}");
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use windows::Win32::UI::WindowsAndMessaging::{WS_EX_ACCEPTFILES, WS_EX_WINDOWEDGE};

        #[test]
        fn the_ex_style_is_no_activate_tool_topmost_click_through_and_off_the_taskbar() {
            let tao = (WS_EX_WINDOWEDGE | WS_EX_ACCEPTFILES | WS_EX_APPWINDOW | WS_EX_NOACTIVATE).0;
            let merged = merged_ex_style(tao);
            assert_eq!(merged & wanted_ex_style(), wanted_ex_style());
            assert_eq!(merged & WS_EX_APPWINDOW.0, 0);
            assert_eq!(merged & (WS_EX_WINDOWEDGE | WS_EX_ACCEPTFILES).0, (WS_EX_WINDOWEDGE | WS_EX_ACCEPTFILES).0);
            assert_eq!(merged_ex_style(merged), merged);
        }
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use std::ffi::c_ulong;
    use std::sync::atomic::{AtomicBool, Ordering};

    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
    use webkit2gtk::glib::prelude::ObjectExt;

    use super::super::linux_support::{
        predicted_backend, support, Backend, DisplayEnv, Unsupported, LINUX_OVERLAY_ENABLED,
    };
    use super::super::x11::Connection;
    use super::*;

    const MAIN_WINDOW: &str = "main";

    /// What the last `create` found; read on every notification, so it must not touch X.
    static READY: AtomicBool = AtomicBool::new(false);

    /// An X11 override-redirect window (XWayland included): the window manager never focuses, frames, places or
    /// lists it. Tauri's `show()`/`hide()` are safe here: on GTK they map and unmap without asking for focus.
    pub(crate) fn create(app: &AppHandle) -> tauri::Result<()> {
        if app.get_webview_window(LABEL).is_some() {
            return Ok(());
        }
        let checked = check(app);
        READY.store(checked.is_ok(), Ordering::Release);
        if let Err(reason) = checked {
            log::info!("no game overlay on this desktop: {reason:?}");
            return Ok(());
        }
        let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("overlay".into()))
            .title("Deadlock+ overlay")
            .visible(false)
            .focused(false)
            .focusable(false)
            .transparent(true)
            .decorations(false)
            .skip_taskbar(true)
            .always_on_top(true)
            .build()?;
        // Queued before any show, so the hook is in place when the first show realizes and maps the window.
        let hooked = window.clone();
        window.run_on_main_thread(move || hook_realize(hooked))?;
        Ok(())
    }

    pub(crate) fn destroy(app: &AppHandle) {
        if let Some(window) = app.get_webview_window(LABEL) {
            if let Err(e) = window.destroy() {
                log::warn!("could not close the overlay window: {e}");
            }
        }
    }

    /// `rect` is in root-window pixels, the space the focus watcher reads; tao divides by GDK's scale itself.
    pub(crate) fn show(app: &AppHandle, rect: ScreenRect) {
        let Some(window) = app.get_webview_window(LABEL) else {
            return;
        };
        let size = PhysicalSize::new(rect.width.max(1).unsigned_abs(), rect.height.max(1).unsigned_abs());
        if let Err(e) = window
            .set_position(PhysicalPosition::new(rect.x, rect.y))
            .and_then(|()| window.set_size(size))
            .and_then(|()| window.show())
        {
            log::warn!("could not show the overlay window: {e}");
        }
    }

    pub(crate) fn hide(app: &AppHandle) {
        if let Some(window) = app.get_webview_window(LABEL) {
            if let Err(e) = window.hide() {
                log::warn!("could not hide the overlay window: {e}");
            }
        }
    }

    pub(crate) fn raise(app: &AppHandle) {
        let Some(xid) = app.get_webview_window(LABEL).as_ref().and_then(xid) else {
            return;
        };
        if let Some(x11) = Connection::open() {
            x11.raise(xid);
        }
    }

    /// X11 has no exclusive mode that hides other windows; a compositor draws the overlay over a fullscreen game.
    pub(crate) fn exclusive_fullscreen() -> bool {
        false
    }

    pub(crate) fn platform_ready() -> bool {
        READY.load(Ordering::Acquire)
    }

    fn check(app: &AppHandle) -> Result<(), Unsupported> {
        if !LINUX_OVERLAY_ENABLED {
            return Err(Unsupported::Disabled);
        }
        let backend = backend(app);
        let compositor = match backend {
            Backend::X11 => Connection::open().map(|x11| x11.compositor_running()),
            Backend::Wayland | Backend::Unknown => None,
        };
        support(true, backend, compositor)
    }

    /// The main window's handle says what GTK really picked; before it is first shown, GDK's own rules decide.
    fn backend(app: &AppHandle) -> Backend {
        let realized = app.get_webview_window(MAIN_WINDOW).and_then(|w| w.window_handle().ok().map(|h| h.as_raw()));
        match realized {
            Some(RawWindowHandle::Xlib(_) | RawWindowHandle::Xcb(_)) => Backend::X11,
            Some(RawWindowHandle::Wayland(_)) => Backend::Wayland,
            _ => {
                let var = |name| std::env::var(name).ok();
                let (gdk_backend, wayland_display, display, session_type) =
                    (var("GDK_BACKEND"), var("WAYLAND_DISPLAY"), var("DISPLAY"), var("XDG_SESSION_TYPE"));
                predicted_backend(DisplayEnv {
                    gdk_backend: gdk_backend.as_deref(),
                    wayland_display: wayland_display.as_deref(),
                    display: display.as_deref(),
                    session_type: session_type.as_deref(),
                })
            }
        }
    }

    fn xid(window: &WebviewWindow) -> Option<c_ulong> {
        match window.window_handle().ok()?.as_raw() {
            RawWindowHandle::Xlib(h) => Some(h.window),
            RawWindowHandle::Xcb(h) => Some(c_ulong::from(h.window.get())),
            _ => None,
        }
    }

    /// GTK realizes and maps in one go on the first show, and a window manager reads override-redirect only at
    /// map time, so the X window is changed from GTK's realize signal: the X window exists, nothing is mapped yet.
    fn hook_realize(window: WebviewWindow) {
        let gtk = match window.gtk_window() {
            Ok(gtk) => gtk,
            Err(e) => {
                log::warn!("overlay window has no GTK window: {e}");
                return;
            }
        };
        gtk.connect_local("realize", true, move |_| {
            match (xid(&window), Connection::open()) {
                (Some(xid), Some(x11)) => {
                    x11.make_overlay(xid);
                    log::info!("overlay window created (X11 0x{xid:x})");
                }
                _ => log::warn!("overlay window realized without an X11 window; it may take focus"),
            }
            None
        });
    }
}

#[cfg(not(any(windows, target_os = "linux")))]
mod platform {
    use super::*;

    pub(crate) fn create(_app: &AppHandle) -> tauri::Result<()> {
        Ok(())
    }

    pub(crate) fn destroy(_app: &AppHandle) {}

    pub(crate) fn show(_app: &AppHandle, _rect: ScreenRect) {}

    pub(crate) fn hide(_app: &AppHandle) {}

    pub(crate) fn exclusive_fullscreen() -> bool {
        false
    }

    pub(crate) fn platform_ready() -> bool {
        false
    }

    pub(crate) fn raise(_app: &AppHandle) {}
}
