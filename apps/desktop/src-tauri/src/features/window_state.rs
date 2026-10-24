use tauri::plugin::TauriPlugin;
use tauri::{WebviewWindow, Wry};
use tauri_plugin_window_state::{StateFlags, WindowExt};

use crate::features::app_window::MAIN_WINDOW;

/// Visibility is left out: `app_window::build_main` decides whether to show the main window (an
/// autostart launch stays in the tray). Restoring it would override that. Decorations are fixed by
/// the window config.
fn restored_state() -> StateFlags {
    StateFlags::all() - StateFlags::VISIBLE - StateFlags::DECORATIONS
}

/// The plugin restores from a task queued on the event loop, which runs after setup has already shown
/// the window; the main window is restored by hand before it is shown instead.
pub fn plugin() -> TauriPlugin<Wry> {
    tauri_plugin_window_state::Builder::default()
        .with_state_flags(restored_state())
        .with_denylist(&["overlay"])
        .skip_initial_state(MAIN_WINDOW)
        .build()
}

pub fn restore_main(window: &WebviewWindow) {
    if let Err(e) = window.restore_state(restored_state()) {
        log::warn!("could not restore the main window's size and position: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn does_not_restore_visibility_or_decorations() {
        let flags = restored_state();
        assert!(!flags.contains(StateFlags::VISIBLE));
        assert!(!flags.contains(StateFlags::DECORATIONS));
    }

    #[test]
    fn restores_size_position_and_maximized() {
        let flags = restored_state();
        assert!(flags.contains(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED));
    }
}
