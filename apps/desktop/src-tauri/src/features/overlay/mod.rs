use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::Sender;
use std::sync::Mutex;
use std::time::Duration;

use dp_game::focus::{FocusState, GameFocus};
use dp_sync::LockExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Listener, Manager};
use ts_rs::TS;

use crate::features::error::{error_codes, AppError};
use crate::features::game_focus::GameFocusService;
use crate::features::i18n::{translate_in, I18nState};
use crate::features::notifications::{NotificationKind, Placement};

mod linux_support;
mod rules;
mod toasts;
mod window;
mod worker;
#[cfg(target_os = "linux")]
mod x11;

use worker::Msg;

/// Rust to the overlay page: one toast to show.
pub const TOAST_EVENT: &str = "overlay://toast";
/// Overlay page to Rust, once on mount: toasts queued while the page loaded can now be sent.
pub const READY_EVENT: &str = "overlay-ready";
/// Rust to the overlay page, when the user picks another position: toasts already on screen move there.
pub const POSITION_EVENT: &str = "overlay://position";
/// The page drops each card on its own timer; the window hides this long after the last expiry so it never cuts a
/// card off early.
pub const HIDE_MARGIN_MS: u32 = 100;

/// Where corner toasts stack. The center cell is reserved for `Placement::Center`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum OverlayPosition {
    TopLeft,
    TopCenter,
    #[default]
    TopRight,
    Left,
    Right,
    BottomLeft,
    BottomCenter,
    BottomRight,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct OverlaySettings {
    pub enabled: bool,
    pub position: OverlayPosition,
    /// 3-15 s.
    pub duration_secs: u8,
    pub match_found: bool,
    pub queue_stopped: bool,
}

impl Default for OverlaySettings {
    fn default() -> Self {
        Self {
            enabled: true,
            position: OverlayPosition::TopRight,
            duration_secs: 6,
            match_found: true,
            queue_stopped: true,
        }
    }
}

/// Text is rendered in Rust, so the overlay page needs no i18n, KV or commands.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct OverlayToast {
    pub id: String,
    pub kind: NotificationKind,
    pub title: String,
    pub body: String,
    pub placement: Placement,
    /// Ignored for `Placement::Center`.
    pub position: OverlayPosition,
    pub duration_ms: u32,
}

/// Rust to the main window, on change: what Settings needs to explain the overlay.
pub const STATUS_EVENT: &str = "overlay://status";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct OverlayStatus {
    pub game_open: bool,
    /// Deadlock was in Full Screen mode the last time it was in front, so the overlay cannot draw over it.
    pub exclusive_fullscreen: bool,
}

error_codes! {
    pub enum OverlayError in "overlay" {
        GameNotRunning = "game_not_running",
    }
}

const TEST_KEY: &str = "notifications.overlay_test";

/// Time to click into the game before the test toast appears.
const TEST_DELAY: Duration = Duration::from_secs(3);

static NEXT_TEST: AtomicU64 = AtomicU64::new(0);

#[derive(Default)]
pub struct OverlayService {
    settings: Mutex<OverlaySettings>,
    status: Mutex<OverlayStatus>,
    worker: Mutex<Option<Sender<Msg>>>,
}

impl OverlayService {
    /// Idempotent. Start before the focus watcher, so its first change has somewhere to go.
    pub fn start(&self, app: &AppHandle) {
        let mut worker = self.worker.lock_or_recover();
        if worker.is_some() {
            return;
        }
        match worker::spawn(app.clone()) {
            Ok(tx) => *worker = Some(tx),
            Err(e) => {
                log::warn!("overlay could not start: {e}");
                return;
            }
        }
        let handle = app.clone();
        app.listen_any(READY_EVENT, move |_| handle.state::<OverlayService>().send(Msg::Ready));
    }

    fn send(&self, msg: Msg) {
        if let Some(tx) = self.worker.lock_or_recover().as_ref() {
            let _ = tx.send(msg);
        }
    }

    pub fn settings(&self) -> OverlaySettings {
        *self.settings.lock_or_recover()
    }
}

/// Called on the focus hook's thread: only hands the state on.
pub fn on_focus_change(app: &AppHandle, state: FocusState) {
    app.state::<OverlayService>().send(Msg::Focus(state));
}

pub fn available(app: &AppHandle, focus: &FocusState) -> bool {
    let settings = app.state::<OverlayService>().settings();
    rules::available(window::platform_ready(), settings, focus, window::exclusive_fullscreen())
}

pub fn show_toast(app: &AppHandle, id: String, kind: NotificationKind, text: (String, String), placement: Placement) {
    let service = app.state::<OverlayService>();
    service.send(Msg::Toast(rules::toast(id, kind, text, placement, service.settings())));
}

pub mod commands {
    use super::*;

    #[tauri::command]
    pub fn set_overlay_settings(app: AppHandle, settings: OverlaySettings, state: tauri::State<'_, OverlayService>) {
        let settings = settings.sanitized();
        let previous = std::mem::replace(&mut *state.settings.lock_or_recover(), settings);
        if previous.position != settings.position {
            if let Err(e) = app.emit_to(window::LABEL, POSITION_EVENT, settings.position) {
                log::warn!("could not emit {POSITION_EVENT}: {e}");
            }
        }
        log::info!(
            "overlay {} ({:?}, {} s)",
            if settings.enabled { "enabled" } else { "disabled" },
            settings.position,
            settings.duration_secs
        );
    }

    /// Shows one corner toast whether or not the overlay is on, so the user can see where it lands first. Waits
    /// `TEST_DELAY` first, so the user can bring the game forward.
    #[tauri::command]
    pub async fn show_overlay_test(app: AppHandle) -> Result<(), AppError> {
        if app.state::<GameFocusService>().state().focus == GameFocus::Closed {
            return Err(OverlayError::GameNotRunning.into());
        }
        tokio::time::sleep(TEST_DELAY).await;
        let locale = app.state::<I18nState>().locale();
        let text = (
            translate_in(&locale, &format!("{TEST_KEY}.title"), &[]),
            translate_in(&locale, &format!("{TEST_KEY}.body"), &[]),
        );
        let id = format!("overlay-test-{}", NEXT_TEST.fetch_add(1, Ordering::Relaxed));
        show_toast(&app, id, NotificationKind::Alert, text, Placement::Corner);
        Ok(())
    }

    #[tauri::command]
    pub fn overlay_status(state: tauri::State<'_, OverlayService>) -> OverlayStatus {
        *state.status.lock_or_recover()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn errors_are_catalogued() {
        crate::features::error::assert_catalogued::<OverlayError>();
    }

    #[test]
    fn the_test_toast_is_catalogued() {
        for part in ["title", "body"] {
            let key = format!("{TEST_KEY}.{part}");
            assert_ne!(translate_in("en", &key, &[]), key, "{key} missing");
        }
    }
}
