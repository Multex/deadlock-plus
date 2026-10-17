use std::cell::Cell;
use std::ffi::{c_int, c_ulong, CStr};
use std::ptr;
use std::sync::OnceLock;

use x11_dl::xlib::{self, Display, XErrorEvent, Xlib};
use x11_dl::xrandr::Xrandr;

use crate::focus_pick::{Monitor, WindowInfo};
use crate::focus_state::ScreenRect;

type ErrorHandler = Option<unsafe extern "C" fn(*mut Display, *mut XErrorEvent) -> c_int>;

thread_local! {
    static OPEN_HERE: Cell<u32> = const { Cell::new(0) };
}

static PREVIOUS_HANDLER: OnceLock<ErrorHandler> = OnceLock::new();

/// Xlib's default handler exits the process, and a window can close between listing it and reading it. A
/// connection is only used on the thread that opened it, so errors raised on such a thread are dropped (the call
/// that caused one returns a failure status); any other thread's errors go to the handler installed before, which
/// is GTK's inside the app.
unsafe extern "C" fn on_error(display: *mut Display, event: *mut XErrorEvent) -> c_int {
    if OPEN_HERE.with(Cell::get) > 0 {
        return 0;
    }
    match PREVIOUS_HANDLER.get().copied().flatten() {
        Some(previous) => previous(display, event),
        None => 0,
    }
}

struct Atoms {
    active_window: c_ulong,
    wm_pid: c_ulong,
    client_list: c_ulong,
    wm_state: c_ulong,
    wm_state_hidden: c_ulong,
}

/// One X11 connection, used only on the thread that opened it.
pub(crate) struct X11 {
    xlib: Xlib,
    xrandr: Option<Xrandr>,
    display: *mut Display,
    root: c_ulong,
    atoms: Atoms,
}

impl X11 {
    /// `None` without libX11 or a reachable display (pure Wayland, headless). `name` overrides `$DISPLAY`.
    pub(crate) fn open(name: Option<&CStr>) -> Option<Self> {
        let xlib = Xlib::open().ok()?;
        // SAFETY: installs a process-wide handler once; `on_error` only reads a thread-local and the saved handler.
        PREVIOUS_HANDLER.get_or_init(|| unsafe { (xlib.XSetErrorHandler)(Some(on_error)) });
        // SAFETY: a null name means `$DISPLAY`; a null result means no connection and nothing to free.
        let display = unsafe { (xlib.XOpenDisplay)(name.map_or(ptr::null(), CStr::as_ptr)) };
        if display.is_null() {
            return None;
        }
        OPEN_HERE.with(|open| open.set(open.get() + 1));
        // SAFETY: `display` is open; atom names are NUL-terminated literals.
        unsafe {
            let atom = |name: &CStr| (xlib.XInternAtom)(display, name.as_ptr(), xlib::False);
            let atoms = Atoms {
                active_window: atom(c"_NET_ACTIVE_WINDOW"),
                wm_pid: atom(c"_NET_WM_PID"),
                client_list: atom(c"_NET_CLIENT_LIST"),
                wm_state: atom(c"_NET_WM_STATE"),
                wm_state_hidden: atom(c"_NET_WM_STATE_HIDDEN"),
            };
            let root = (xlib.XDefaultRootWindow)(display);
            (xlib.XSelectInput)(display, root, xlib::PropertyChangeMask);
            Some(Self { xrandr: Xrandr::open().ok(), xlib, display, root, atoms })
        }
    }

    /// Drains queued events; true when `_NET_ACTIVE_WINDOW` changed since the last call.
    pub(crate) fn active_window_changed(&self) -> bool {
        let mut changed = false;
        // SAFETY: `display` is open; `XNextEvent` fills the zeroed event, and only a PropertyNotify is read as one.
        unsafe {
            while (self.xlib.XPending)(self.display) > 0 {
                let mut event: xlib::XEvent = std::mem::zeroed();
                (self.xlib.XNextEvent)(self.display, &mut event);
                if event.get_type() == xlib::PropertyNotify && event.property.atom == self.atoms.active_window {
                    changed = true;
                }
            }
        }
        changed
    }

    pub(crate) fn active_window(&self) -> Option<WindowInfo> {
        let window = self.property(self.root, self.atoms.active_window, xlib::XA_WINDOW).first().copied()?;
        self.window(window)
    }

    /// Every window the window manager manages.
    pub(crate) fn client_windows(&self) -> Vec<WindowInfo> {
        self.property(self.root, self.atoms.client_list, xlib::XA_WINDOW)
            .into_iter()
            .filter_map(|window| self.window(window))
            .collect()
    }

    /// RandR monitors, or the whole screen when RandR 1.5 is missing.
    pub(crate) fn monitors(&self) -> Vec<Monitor> {
        if let Some(xrandr) = &self.xrandr {
            let mut count = 0;
            // SAFETY: `display` is open; the list is copied before it is freed.
            unsafe {
                let list = (xrandr.XRRGetMonitors)(self.display, self.root, xlib::True, &mut count);
                if !list.is_null() {
                    let monitors: Vec<Monitor> = std::slice::from_raw_parts(list, usize::try_from(count).unwrap_or(0))
                        .iter()
                        .map(|m| Monitor {
                            rect: ScreenRect { x: m.x, y: m.y, width: m.width, height: m.height },
                            primary: m.primary != 0,
                        })
                        .collect();
                    (xrandr.XRRFreeMonitors)(list);
                    if !monitors.is_empty() {
                        return monitors;
                    }
                }
            }
        }
        self.attributes(self.root)
            .map(|root| Monitor {
                rect: ScreenRect { x: 0, y: 0, width: root.width, height: root.height },
                primary: true,
            })
            .into_iter()
            .collect()
    }

    fn window(&self, window: c_ulong) -> Option<WindowInfo> {
        if window == 0 {
            return None;
        }
        let attributes = self.attributes(window)?;
        let (mut x, mut y, mut child) = (0, 0, 0);
        // SAFETY: `display` is open and the out-pointers are live locals.
        let placed = unsafe {
            (self.xlib.XTranslateCoordinates)(self.display, window, self.root, 0, 0, &mut x, &mut y, &mut child)
        };
        if placed == 0 {
            return None;
        }
        let hidden = self.property(window, self.atoms.wm_state, xlib::XA_ATOM).contains(&self.atoms.wm_state_hidden);
        Some(WindowInfo {
            pid: self
                .property(window, self.atoms.wm_pid, xlib::XA_CARDINAL)
                .first()
                .and_then(|&pid| u32::try_from(pid).ok())
                .unwrap_or(0),
            class: self.class(window),
            transient: self
                .property(window, xlib::XA_WM_TRANSIENT_FOR, xlib::XA_WINDOW)
                .first()
                .is_some_and(|&owner| owner != 0),
            viewable: attributes.map_state == xlib::IsViewable && !hidden,
            rect: ScreenRect { x, y, width: attributes.width, height: attributes.height },
        })
    }

    fn attributes(&self, window: c_ulong) -> Option<xlib::XWindowAttributes> {
        // SAFETY: `display` is open; the zeroed struct is only an out-parameter and is read only on success.
        unsafe {
            let mut attributes: xlib::XWindowAttributes = std::mem::zeroed();
            ((self.xlib.XGetWindowAttributes)(self.display, window, &mut attributes) != 0).then_some(attributes)
        }
    }

    fn class(&self, window: c_ulong) -> [String; 2] {
        let mut hint = xlib::XClassHint { res_name: ptr::null_mut(), res_class: ptr::null_mut() };
        // SAFETY: `display` is open; each returned string is NUL-terminated, copied, then freed exactly once.
        unsafe {
            let found = (self.xlib.XGetClassHint)(self.display, window, &mut hint) != 0;
            [hint.res_name, hint.res_class].map(|name| {
                if name.is_null() {
                    return String::new();
                }
                let text = if found { CStr::from_ptr(name).to_string_lossy().into_owned() } else { String::new() };
                (self.xlib.XFree)(name.cast());
                text
            })
        }
    }

    /// A format-32 property of type `kind`; empty when it is missing, has another type, or the window is gone.
    fn property(&self, window: c_ulong, atom: c_ulong, kind: c_ulong) -> Vec<c_ulong> {
        let (mut actual, mut format, mut count, mut after) = (0, 0, 0, 0);
        let mut data = ptr::null_mut();
        // SAFETY: `display` is open; format-32 data comes back as an array of C longs, which is copied before the
        // buffer is freed.
        unsafe {
            let status = (self.xlib.XGetWindowProperty)(
                self.display,
                window,
                atom,
                0,
                4096,
                xlib::False,
                kind,
                &mut actual,
                &mut format,
                &mut count,
                &mut after,
                &mut data,
            );
            let values = if status == c_int::from(xlib::Success) && actual == kind && format == 32 && !data.is_null() {
                std::slice::from_raw_parts(data as *const c_ulong, usize::try_from(count).unwrap_or(0)).to_vec()
            } else {
                Vec::new()
            };
            if !data.is_null() {
                (self.xlib.XFree)(data.cast());
            }
            values
        }
    }
}

impl Drop for X11 {
    fn drop(&mut self) {
        // SAFETY: `display` was opened in `open` and is closed only here.
        unsafe {
            (self.xlib.XCloseDisplay)(self.display);
        }
        OPEN_HERE.with(|open| open.set(open.get().saturating_sub(1)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unreachable_display_opens_nothing() {
        assert!(X11::open(Some(c":987654")).is_none());
        assert_eq!(OPEN_HERE.with(Cell::get), 0);
    }
}
