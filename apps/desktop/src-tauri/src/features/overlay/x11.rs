use std::ffi::{c_int, c_long, c_uchar, c_ulong, CStr, CString};
use std::ptr;

use x11_dl::xfixes::Xlib as XFixes;
use x11_dl::xlib::{self, Display, Xlib};

/// `ShapeInput` from the X Shape extension, which x11-dl does not bind.
const SHAPE_INPUT: c_int = 2;

/// A short-lived connection of our own, never GDK's. GDK's error handler ignores errors raised on displays it did
/// not open, so a window that went away mid-call cannot take the app down.
pub(super) struct Connection {
    xlib: Xlib,
    display: *mut Display,
}

impl Connection {
    /// `None` without libX11 or a reachable `$DISPLAY`.
    pub(super) fn open() -> Option<Self> {
        let xlib = Xlib::open().ok()?;
        // SAFETY: a null name means `$DISPLAY`; a null result means no connection and nothing to free.
        let display = unsafe { (xlib.XOpenDisplay)(ptr::null()) };
        (!display.is_null()).then_some(Self { xlib, display })
    }

    /// The check `gdk_screen_is_composited` makes: someone owns `_NET_WM_CM_S<screen>`.
    pub(super) fn compositor_running(&self) -> bool {
        // SAFETY: `display` is open for the life of `self`.
        let screen = unsafe { (self.xlib.XDefaultScreen)(self.display) };
        let Ok(name) = CString::new(format!("_NET_WM_CM_S{screen}")) else { return false };
        let selection = self.atom(&name);
        // SAFETY: as above; an unowned selection reads as `None` (0).
        unsafe { (self.xlib.XGetSelectionOwner)(self.display, selection) != 0 }
    }

    /// Takes the window out of the window manager's hands: no frame, no focus, no taskbar entry, placed exactly
    /// where it is moved. A window manager only reads override-redirect when the window maps, so this must run
    /// between realize and the first map.
    pub(super) fn make_overlay(&self, window: c_ulong) {
        // SAFETY: `display` is open; `attrs` is fully initialised (zeroed) and only `override_redirect` is read.
        unsafe {
            let mut attrs: xlib::XSetWindowAttributes = std::mem::zeroed();
            attrs.override_redirect = xlib::True;
            (self.xlib.XChangeWindowAttributes)(self.display, window, xlib::CWOverrideRedirect, &mut attrs);
        }
        let notification = self.atom(c"_NET_WM_WINDOW_TYPE_NOTIFICATION");
        self.set_property(window, c"_NET_WM_WINDOW_TYPE", xlib::XA_ATOM, &[notification as c_long]);
        // gamescope draws another client's window over the game only when it carries this.
        self.set_property(window, c"GAMESCOPE_EXTERNAL_OVERLAY", xlib::XA_CARDINAL, &[1]);
        self.clear_input_shape(window);
        self.sync();
    }

    /// A newly mapped override-redirect window keeps its old stacking slot, and the window manager raises the game
    /// above it when the game takes focus.
    pub(super) fn raise(&self, window: c_ulong) {
        // SAFETY: `display` is open.
        unsafe { (self.xlib.XRaiseWindow)(self.display, window) };
        self.sync();
    }

    /// An empty input region sends every click and pointer move to whatever is below. tao's click-through keeps a
    /// 1x1 region at the top-left corner and needs a realized window first.
    fn clear_input_shape(&self, window: c_ulong) {
        let xfixes = match XFixes::open() {
            Ok(xfixes) => xfixes,
            Err(e) => {
                log::warn!("overlay stays clickable, no XFixes: {e}");
                return;
            }
        };
        // SAFETY: `display` is open; the region is created and destroyed here. The server refuses XFixes requests
        // newer than the version the client announced, and input shapes need version 2.
        unsafe {
            let (mut major, mut minor) = (5, 0);
            if (xfixes.XFixesQueryVersion)(self.display, &mut major, ptr::addr_of_mut!(minor).cast_const()) == 0
                || major < 2
            {
                log::warn!("overlay stays clickable, XFixes {major}.{minor} has no input shapes");
                return;
            }
            let region = (xfixes.XFixesCreateRegion)(self.display, ptr::null_mut(), 0);
            (xfixes.XFixesSetWindowShapeRegion)(self.display, window, SHAPE_INPUT, 0, 0, region);
            (xfixes.XFixesDestroyRegion)(self.display, region);
        }
    }

    fn atom(&self, name: &CStr) -> c_ulong {
        // SAFETY: `display` is open; `name` is NUL-terminated.
        unsafe { (self.xlib.XInternAtom)(self.display, name.as_ptr(), xlib::False) }
    }

    /// Format-32 properties travel as C `long`s in Xlib, whatever the platform's width.
    fn set_property(&self, window: c_ulong, name: &CStr, kind: c_ulong, values: &[c_long]) {
        let property = self.atom(name);
        let len = c_int::try_from(values.len()).unwrap_or(c_int::MAX);
        // SAFETY: `display` is open; `values` outlives the call, which copies it.
        unsafe {
            (self.xlib.XChangeProperty)(
                self.display,
                window,
                property,
                kind,
                32,
                xlib::PropModeReplace,
                values.as_ptr().cast::<c_uchar>(),
                len,
            );
        }
    }

    fn sync(&self) {
        // SAFETY: `display` is open.
        unsafe { (self.xlib.XSync)(self.display, xlib::False) };
    }
}

impl Drop for Connection {
    fn drop(&mut self) {
        // SAFETY: opened in `open`, closed once here.
        unsafe { (self.xlib.XCloseDisplay)(self.display) };
    }
}
