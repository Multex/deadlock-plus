#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

/// Off until Linux players have checked the X11 overlay on their desktops. While off, no overlay window is made
/// and every overlay delivery falls back to a desktop notification.
pub(super) const LINUX_OVERLAY_ENABLED: bool = false;

/// The windowing system GTK draws the app's windows through.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Backend {
    /// An X server, XWayland included.
    X11,
    Wayland,
    Unknown,
}

/// Why no overlay can show on this desktop.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Unsupported {
    Disabled,
    /// Only an X11 override-redirect window can float over the game without taking focus; a Wayland toplevel
    /// cannot place itself or stay above a fullscreen window.
    NativeWayland,
    UnknownBackend,
    NoXDisplay,
    /// Nothing composites, so the transparent window would paint black over the game.
    NoCompositor,
}

/// The environment GDK reads when it picks a backend.
#[derive(Debug, Clone, Copy, Default)]
pub(super) struct DisplayEnv<'a> {
    pub gdk_backend: Option<&'a str>,
    pub wayland_display: Option<&'a str>,
    pub display: Option<&'a str>,
    pub session_type: Option<&'a str>,
}

/// GDK's own pick when no realized window can say: the first usable entry of `GDK_BACKEND`, else Wayland when a
/// Wayland socket is there, else X11.
pub(super) fn predicted_backend(env: DisplayEnv) -> Backend {
    let set = |v: Option<&str>| v.is_some_and(|v| !v.trim().is_empty());
    // Without $WAYLAND_DISPLAY GDK still tries the default socket, which a Wayland session always has.
    let wayland = set(env.wayland_display) || env.session_type.is_some_and(|t| t.eq_ignore_ascii_case("wayland"));
    let x11 = set(env.display);
    let pick = |name: &str| match name {
        "wayland" if wayland => Some(Backend::Wayland),
        "x11" if x11 => Some(Backend::X11),
        _ => None,
    };
    let default_order = || pick("wayland").or_else(|| pick("x11"));
    let found = match env.gdk_backend.map(str::trim).filter(|v| !v.is_empty()) {
        None => default_order(),
        Some(list) => {
            list.split(',').map(str::trim).find_map(|name| if name == "*" { default_order() } else { pick(name) })
        }
    };
    found.unwrap_or(Backend::Unknown)
}

/// `compositor` is `None` when the X display could not be opened.
pub(super) fn support(enabled: bool, backend: Backend, compositor: Option<bool>) -> Result<(), Unsupported> {
    if !enabled {
        return Err(Unsupported::Disabled);
    }
    match (backend, compositor) {
        (Backend::Wayland, _) => Err(Unsupported::NativeWayland),
        (Backend::Unknown, _) => Err(Unsupported::UnknownBackend),
        (Backend::X11, None) => Err(Unsupported::NoXDisplay),
        (Backend::X11, Some(false)) => Err(Unsupported::NoCompositor),
        (Backend::X11, Some(true)) => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const X: Option<&str> = Some(":0");
    const WL: Option<&str> = Some("wayland-0");

    fn env<'a>(
        gdk_backend: Option<&'a str>,
        wayland_display: Option<&'a str>,
        display: Option<&'a str>,
    ) -> DisplayEnv<'a> {
        DisplayEnv { gdk_backend, wayland_display, display, session_type: None }
    }

    #[test]
    fn a_plain_x11_session_is_x11() {
        assert_eq!(predicted_backend(DisplayEnv { session_type: Some("x11"), ..env(None, None, X) }), Backend::X11);
    }

    #[test]
    fn a_wayland_session_is_native_wayland_unless_gdk_backend_says_x11() {
        assert_eq!(predicted_backend(env(None, WL, X)), Backend::Wayland, "GDK tries Wayland first");
        assert_eq!(predicted_backend(env(Some("x11"), WL, X)), Backend::X11, "forced onto XWayland");
        assert_eq!(predicted_backend(env(Some("*"), WL, X)), Backend::Wayland);
        assert_eq!(predicted_backend(env(Some("wayland,x11"), WL, X)), Backend::Wayland);
        let session_only = DisplayEnv { session_type: Some("wayland"), ..env(None, None, X) };
        assert_eq!(predicted_backend(session_only), Backend::Wayland, "GDK falls back to the default socket");
    }

    #[test]
    fn gdk_backend_skips_entries_that_cannot_open() {
        assert_eq!(predicted_backend(env(Some("wayland,x11"), None, X)), Backend::X11);
        assert_eq!(predicted_backend(env(Some("x11,wayland"), WL, None)), Backend::Wayland);
        assert_eq!(predicted_backend(env(Some(" x11 , wayland"), WL, X)), Backend::X11, "spaces are trimmed");
        assert_eq!(predicted_backend(env(Some("broadway"), WL, X)), Backend::Unknown);
        assert_eq!(predicted_backend(env(Some("x11"), WL, None)), Backend::Unknown, "x11 without $DISPLAY");
        assert_eq!(predicted_backend(env(Some(""), WL, X)), Backend::Wayland, "empty means unset");
    }

    #[test]
    fn no_display_at_all_is_unknown() {
        assert_eq!(predicted_backend(env(None, None, None)), Backend::Unknown);
        assert_eq!(predicted_backend(env(None, Some(""), Some(""))), Backend::Unknown, "empty values are unset");
    }

    #[test]
    fn x11_with_a_compositor_is_supported() {
        assert_eq!(support(true, Backend::X11, Some(true)), Ok(()));
    }

    #[test]
    fn the_switch_comes_first() {
        assert_eq!(support(false, Backend::X11, Some(true)), Err(Unsupported::Disabled));
        assert_eq!(support(false, Backend::Wayland, None), Err(Unsupported::Disabled));
    }

    #[test]
    fn native_wayland_and_an_unknown_backend_never_show() {
        assert_eq!(support(true, Backend::Wayland, Some(true)), Err(Unsupported::NativeWayland), "XWayland is up");
        assert_eq!(support(true, Backend::Unknown, Some(true)), Err(Unsupported::UnknownBackend));
    }

    #[test]
    fn x11_needs_a_reachable_display_and_a_compositor() {
        assert_eq!(support(true, Backend::X11, None), Err(Unsupported::NoXDisplay));
        assert_eq!(support(true, Backend::X11, Some(false)), Err(Unsupported::NoCompositor));
    }
}
