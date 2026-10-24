use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

pub mod badges;
mod host;

use crate::features::i18n::I18nState;
use host::TrayHost;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

const MAIN_WINDOW: &str = "main";
pub const WINDOW_HIDDEN_EVENT: &str = "window-hidden";
pub const WINDOW_SHOWN_EVENT: &str = "window-shown";
const QUIT_REQUESTED_EVENT: &str = "quit-requested";
/// The page answers with `quit_app` once its pending saves land; this bounds the wait if it never does.
const QUIT_GRACE: Duration = Duration::from_secs(2);
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

/// The autostart task passes `--autostart`.
fn autostart_launch<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().any(|a| a.as_ref() == AUTOSTART_ARG)
}

fn starts_hidden(autostart: bool, host: impl FnOnce() -> TrayHost) -> bool {
    autostart && host() == TrayHost::Present
}

/// An autostart launch stays in the tray until the user opens it. With no tray host (plain GNOME) there
/// is no icon to open it from, so it shows the window instead.
pub fn launched_hidden() -> bool {
    starts_hidden(autostart_launch(std::env::args()), host::tray_host)
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
                request_quit(app);
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

    if launched_hidden() {
        log::info!("autostart launch, staying in the tray");
    }
    Ok(())
}

/// `app.exit` tears the page down at once, so a save it still holds (a debounced edit) would be lost. The page
/// gets the chance to save first.
pub(crate) fn request_quit(app: &AppHandle) {
    if let Err(e) = app.emit_to(MAIN_WINDOW, QUIT_REQUESTED_EVENT, ()) {
        log::warn!("could not ask the page to quit, exiting now: {e}");
        app.exit(0);
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(QUIT_GRACE);
        log::warn!("the page did not answer the quit request, exiting");
        app.exit(0);
    });
}

#[derive(Debug, PartialEq, Eq)]
enum CloseAction {
    Hide,
    /// Quits through the page, as the tray's Quit does, instead of letting the window close under it.
    Quit,
    Close,
}

fn close_action(label: &str, close_to_tray: bool) -> CloseAction {
    match (label == MAIN_WINDOW, close_to_tray) {
        (true, true) => CloseAction::Hide,
        (true, false) => CloseAction::Quit,
        (false, _) => CloseAction::Close,
    }
}

pub fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
    match event {
        WindowEvent::CloseRequested { api, .. } => {
            match close_action(window.label(), window.state::<CloseToTray>().get()) {
                CloseAction::Hide => {
                    api.prevent_close();
                    log::debug!("close requested, hiding to the tray");
                    if let Err(e) = window.hide() {
                        log::warn!("could not hide the window: {e}");
                    }
                    sync_main_visibility(window.app_handle());
                }
                CloseAction::Quit => {
                    api.prevent_close();
                    log::info!("main window closed with close to tray off, quitting");
                    request_quit(window.app_handle());
                }
                CloseAction::Close => {}
            }
        }
        // Minimize and restore from the taskbar arrive as `Resized`.
        WindowEvent::Resized(_) | WindowEvent::Focused(_) if window.label() == MAIN_WINDOW => {
            sync_main_visibility(window.app_handle());
        }
        _ => {}
    }
}

pub mod commands {
    use super::*;

    #[tauri::command]
    pub fn set_close_to_tray(enabled: bool, state: tauri::State<'_, CloseToTray>) {
        state.set(enabled);
        log::info!("close to tray {}", if enabled { "enabled" } else { "disabled" });
    }

    /// The page's answer to `quit-requested`, sent once its pending saves have landed.
    #[tauri::command]
    pub fn quit_app(app: AppHandle) {
        log::info!("the page is ready, quitting");
        app.exit(0);
    }

    #[tauri::command]
    pub fn launched_hidden() -> bool {
        super::launched_hidden()
    }

    #[tauri::command]
    pub fn main_window_visible(state: tauri::State<'_, MainWindowVisibility>) -> bool {
        state.get()
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
    fn autostart_arg_marks_an_autostart_launch() {
        assert!(autostart_launch(["deadlock-plus.exe", "--autostart"]));
    }

    #[test]
    fn normal_launch_is_not_autostart() {
        assert!(!autostart_launch(["deadlock-plus.exe"]));
        assert!(!autostart_launch(["deadlock-plus.exe", "--autostart-not"]));
    }

    #[test]
    fn autostart_stays_hidden_only_with_a_tray_host() {
        assert!(starts_hidden(true, || TrayHost::Present));
        assert!(!starts_hidden(true, || TrayHost::Absent));
        assert!(!starts_hidden(true, || TrayHost::Unknown));
    }

    #[test]
    fn normal_launch_shows_without_probing_the_tray_host() {
        assert!(!starts_hidden(false, || unreachable!("probed on a normal launch")));
    }

    #[test]
    fn closing_the_main_window_hides_it_with_close_to_tray_on() {
        assert_eq!(close_action("main", true), CloseAction::Hide);
    }

    #[test]
    fn closing_the_main_window_quits_through_the_page_with_close_to_tray_off() {
        assert_eq!(close_action("main", false), CloseAction::Quit);
    }

    #[test]
    fn other_windows_close_normally() {
        assert_eq!(close_action("overlay", true), CloseAction::Close);
        assert_eq!(close_action("overlay", false), CloseAction::Close);
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
