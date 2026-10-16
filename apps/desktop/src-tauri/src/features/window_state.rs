use tauri::plugin::TauriPlugin;
use tauri::Wry;
use tauri_plugin_window_state::StateFlags;

/// Visibility is left out: the main window starts hidden and `tray::commands::frontend_ready`
/// decides whether to show it (an autostart launch stays in the tray). Restoring it would override
/// that. Decorations are fixed by the window config.
fn restored_state() -> StateFlags {
    StateFlags::all() - StateFlags::VISIBLE - StateFlags::DECORATIONS
}

pub fn plugin() -> TauriPlugin<Wry> {
    tauri_plugin_window_state::Builder::default().with_state_flags(restored_state()).with_denylist(&["overlay"]).build()
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
