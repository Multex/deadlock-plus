use std::sync::atomic::{AtomicBool, Ordering};

pub mod badges;

use crate::features::i18n::I18nState;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

const MAIN_WINDOW: &str = "main";
pub const WINDOW_HIDDEN_EVENT: &str = "window-hidden";
pub const WINDOW_SHOWN_EVENT: &str = "window-shown";
const AUTOSTART_ARG: &str = "--autostart";
const SHOW_ID: &str = "show";
const QUIT_ID: &str = "quit";

/// Whether closing the window hides it (the watchers keep running) instead of exiting.
#[derive(Default)]
pub struct CloseToTray(AtomicBool);

impl CloseToTray {
    pub fn set(&self, enabled: bool) {
        self.0.store(enabled, Ordering::Relaxed);
    }

    pub fn get(&self) -> bool {
        self.0.load(Ordering::Relaxed)
    }
}

fn visibility_event(was: bool, now: bool) -> Option<&'static str> {
    match (was, now) {
        (false, true) => Some(WINDOW_SHOWN_EVENT),
        (true, false) => Some(WINDOW_HIDDEN_EVENT),
        _ => None,
    }
}

/// Whether the main window is shown and not minimized. WebView2 never fires `visibilitychange` on
/// minimize or hide-to-tray, so the backend tracks it for the frontend.
#[derive(Default)]
pub struct MainWindowVisibility(AtomicBool);

impl MainWindowVisibility {
    pub fn get(&self) -> bool {
        self.0.load(Ordering::Relaxed)
    }

    fn update(&self, now: bool) -> Option<&'static str> {
        visibility_event(self.0.swap(now, Ordering::Relaxed), now)
    }
}

/// The autostart task passes `--autostart`; that launch stays in the tray until the user opens it.
pub fn launched_hidden<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().any(|a| a.as_ref() == AUTOSTART_ARG)
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MAIN_WINDOW) {
        log::debug!("showing the main window");
        for (step, result) in [("unminimize", w.unminimize()), ("show", w.show()), ("focus", w.set_focus())] {
            if let Err(e) = result {
                log::warn!("main window {step} failed: {e}");
            }
        }
    }
    sync_main_visibility(app);
}

fn sync_main_visibility(app: &AppHandle) {
    let Some(w) = app.get_webview_window(MAIN_WINDOW) else { return };
    let visible = match (w.is_visible(), w.is_minimized()) {
        (Ok(shown), Ok(minimized)) => shown && !minimized,
        (Err(e), _) | (_, Err(e)) => {
            log::warn!("could not read the main window state: {e}");
            return;
        }
    };
    if let Some(event) = app.state::<MainWindowVisibility>().update(visible) {
        if let Err(e) = app.emit(event, ()) {
            log::warn!("could not emit {event}: {e}");
        }
    }
}

struct MenuText {
    show: String,
    quit: String,
    tooltip: String,
}

fn menu_text(i18n: &I18nState) -> MenuText {
    MenuText { show: i18n.tr("tray.show", &[]), quit: i18n.tr("tray.quit", &[]), tooltip: i18n.tr("tray.tooltip", &[]) }
}

fn build_menu(app: &AppHandle, text: &MenuText) -> tauri::Result<Menu<tauri::Wry>> {
    Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, SHOW_ID, &text.show, true, None::<&str>)?,
            &MenuItem::with_id(app, QUIT_ID, &text.quit, true, None::<&str>)?,
        ],
    )
}

/// Rebuilds the menu and tooltip in the current language.
pub fn apply_language(app: &AppHandle) {
    let Some(tray) = app.try_state::<TrayIcon>() else { return };
    let text = menu_text(&app.state::<I18nState>());
    match build_menu(app, &text) {
        Ok(menu) => {
            if let Err(e) = tray.set_menu(Some(menu)) {
                log::warn!("could not update the tray menu: {e}");
            }
        }
        Err(e) => log::warn!("could not build the tray menu: {e}"),
    }
    if let Err(e) = tray.set_tooltip(Some(text.tooltip)) {
        log::warn!("could not update the tray tooltip: {e}");
    }
}

/// The tray icon is always created, even with close-to-tray off: an autostart launch has no window,
/// so it is the only way back in.
pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let text = menu_text(&app.state::<I18nState>());
    let menu = build_menu(app, &text)?;
    let mut tray = TrayIconBuilder::new()
        .tooltip(&text.tooltip)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            SHOW_ID => show_main(app),
            QUIT_ID => {
                log::info!("quit requested from the tray");
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    let tray_icon = tray.build(app)?;
    app.manage(tray_icon);
    badges::setup(app);

    if launched_hidden(std::env::args()) {
        log::info!("autostart launch, staying in the tray");
    }
    Ok(())
}

fn should_hide_to_tray(label: &str, close_to_tray: bool) -> bool {
    label == MAIN_WINDOW && close_to_tray
}

pub fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
    match event {
        WindowEvent::CloseRequested { api, .. } => {
            if should_hide_to_tray(window.label(), window.state::<CloseToTray>().get()) {
                api.prevent_close();
                log::debug!("close requested, hiding to the tray");
                if let Err(e) = window.hide() {
                    log::warn!("could not hide the window: {e}");
                }
                sync_main_visibility(window.app_handle());
            }
        }
        // Minimize and restore from the taskbar arrive as `Resized`.
        WindowEvent::Resized(_) | WindowEvent::Focused(_) if window.label() == MAIN_WINDOW => {
            sync_main_visibility(window.app_handle());
        }
        _ => {}
    }
}

static READY_SEEN: AtomicBool = AtomicBool::new(false);

/// A dev full-page reload sends `frontend_ready` again; revealing then would steal focus on every edit.
fn first_ready(seen: &AtomicBool) -> bool {
    !seen.swap(true, Ordering::Relaxed)
}

pub mod commands {
    use super::*;

    #[tauri::command]
    pub fn set_close_to_tray(enabled: bool, state: tauri::State<'_, CloseToTray>) {
        state.set(enabled);
        log::info!("close to tray {}", if enabled { "enabled" } else { "disabled" });
    }

    #[tauri::command]
    pub fn main_window_visible(state: tauri::State<'_, MainWindowVisibility>) -> bool {
        state.get()
    }

    /// Called once the frontend has actually rendered something, so the window is only ever
    /// revealed with real content in it. WebView2 has a known slow/flashing cold start; showing
    /// the window early and painting `backgroundColor` over the gap just moves the flash from
    /// white to that color instead of removing it. Staying hidden until now, with the window built
    /// `"visible": false` in `tauri.conf.json`, means the user never sees the empty state at all.
    #[tauri::command]
    pub fn frontend_ready(app: AppHandle) {
        if first_ready(&READY_SEEN) && !launched_hidden(std::env::args()) {
            show_main(&app);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menu_text_follows_the_language() {
        let i18n = I18nState::default();
        let english = menu_text(&i18n);
        assert!(i18n.set("af"));
        let afrikaans = menu_text(&i18n);
        for (key, text) in
            [("tray.show", &afrikaans.show), ("tray.quit", &afrikaans.quit), ("tray.tooltip", &afrikaans.tooltip)]
        {
            assert_eq!(*text, crate::features::i18n::translate_in("af", key, &[]), "{key}");
        }
        assert_ne!(afrikaans.quit, english.quit);
    }

    #[test]
    fn autostart_arg_means_hidden_launch() {
        assert!(launched_hidden(["deadlock-plus.exe", "--autostart"]));
    }

    #[test]
    fn normal_launch_is_visible() {
        assert!(!launched_hidden(["deadlock-plus.exe"]));
        assert!(!launched_hidden(["deadlock-plus.exe", "--autostart-not"]));
    }

    #[test]
    fn only_the_first_ready_signal_reveals_the_window() {
        let seen = AtomicBool::new(false);
        assert!(first_ready(&seen));
        assert!(!first_ready(&seen));
        assert!(!first_ready(&seen));
    }

    #[test]
    fn hides_only_main_window_with_close_to_tray_on() {
        assert!(should_hide_to_tray("main", true));
        assert!(!should_hide_to_tray("main", false));
        assert!(!should_hide_to_tray("other", true));
    }

    #[test]
    fn visibility_event_only_on_a_change() {
        assert_eq!(visibility_event(false, true), Some(WINDOW_SHOWN_EVENT));
        assert_eq!(visibility_event(true, false), Some(WINDOW_HIDDEN_EVENT));
        assert_eq!(visibility_event(true, true), None);
        assert_eq!(visibility_event(false, false), None);
    }

    #[test]
    fn main_window_visibility_starts_hidden_and_never_repeats() {
        let s = MainWindowVisibility::default();
        assert!(!s.get());
        assert_eq!(s.update(false), None);
        assert_eq!(s.update(true), Some(WINDOW_SHOWN_EVENT));
        assert_eq!(s.update(true), None);
        assert!(s.get());
        assert_eq!(s.update(false), Some(WINDOW_HIDDEN_EVENT));
        assert_eq!(s.update(false), None);
        assert!(!s.get());
    }

    #[test]
    fn close_to_tray_defaults_off_and_toggles() {
        let s = CloseToTray::default();
        assert!(!s.get());
        s.set(true);
        assert!(s.get());
        s.set(false);
        assert!(!s.get());
    }
}
