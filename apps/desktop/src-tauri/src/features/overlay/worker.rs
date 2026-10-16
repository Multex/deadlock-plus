use std::io;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::{Duration, Instant};

use dp_game::focus::{FocusState, GameFocus, ScreenRect};
use dp_sync::LockExt;
use tauri::{AppHandle, Emitter, Manager};

use super::rules::{follow_rect, lifecycle, next_status, show_rect, Lifecycle};
use super::toasts::Toasts;
use super::{window, OverlayService, OverlayToast, STATUS_EVENT, TOAST_EVENT};

const MAIN_WINDOW: &str = "main";
/// The display mode can change while the game stays in front, which moves no window and so fires no focus change.
const FULLSCREEN_POLL: Duration = Duration::from_secs(2);

pub(super) enum Msg {
    Focus(FocusState),
    Toast(OverlayToast),
    Ready,
}

/// One thread owns the window, so creation, showing and hiding never race each other, and the focus hook's
/// thread only ever does a channel send.
pub(super) fn spawn(app: AppHandle) -> io::Result<Sender<Msg>> {
    let (tx, rx) = mpsc::channel();
    thread::Builder::new()
        .name("overlay".into())
        .spawn(move || Worker { app, focus: FocusState::default(), toasts: Toasts::default(), shown: None }.run(rx))?;
    Ok(tx)
}

struct Worker {
    app: AppHandle,
    focus: FocusState,
    toasts: Toasts,
    shown: Option<ScreenRect>,
}

impl Worker {
    fn run(mut self, rx: Receiver<Msg>) {
        loop {
            let msg = match self.wait() {
                Some(timeout) => match rx.recv_timeout(timeout) {
                    Ok(msg) => Some(msg),
                    Err(RecvTimeoutError::Timeout) => None,
                    Err(RecvTimeoutError::Disconnected) => return,
                },
                None => match rx.recv() {
                    Ok(msg) => Some(msg),
                    Err(_) => return,
                },
            };
            if let Some(msg) = msg {
                self.handle(msg, Instant::now());
            }
            if self.toasts.expire(Instant::now()) {
                window::hide(&self.app);
                self.shown = None;
            }
            if self.focus.focus == GameFocus::Focused {
                self.refresh_status();
            }
        }
    }

    fn wait(&self) -> Option<Duration> {
        let hide = self.toasts.hide_at().map(|at| at.saturating_duration_since(Instant::now()));
        let poll = (self.focus.focus == GameFocus::Focused).then_some(FULLSCREEN_POLL);
        match (hide, poll) {
            (Some(hide), Some(poll)) => Some(hide.min(poll)),
            (hide, poll) => hide.or(poll),
        }
    }

    fn handle(&mut self, msg: Msg, now: Instant) {
        match msg {
            Msg::Focus(next) => {
                match lifecycle(self.focus.focus, next.focus) {
                    Some(Lifecycle::Create) => {
                        self.toasts.window_created();
                        self.shown = None;
                        if let Err(e) = window::create(&self.app) {
                            log::warn!("could not create the overlay window: {e}");
                        }
                    }
                    Some(Lifecycle::Close) => {
                        self.toasts.window_closed();
                        self.shown = None;
                        window::destroy(&self.app);
                    }
                    None => {}
                }
                self.focus = next;
                if let Some(rect) = follow_rect(self.shown, &self.focus, self.toasts.hide_at().is_some()) {
                    window::show(&self.app, rect);
                    self.shown = Some(rect);
                }
                self.refresh_status();
            }
            Msg::Toast(toast) => {
                let toasts = self.toasts.push(toast, now);
                self.send(toasts);
            }
            Msg::Ready => {
                log::debug!("overlay page ready");
                let toasts = self.toasts.ready(now);
                self.send(toasts);
            }
        }
    }

    fn send(&mut self, toasts: Vec<OverlayToast>) {
        if toasts.is_empty() {
            return;
        }
        for toast in &toasts {
            if let Err(e) = self.app.emit_to(window::LABEL, TOAST_EVENT, toast) {
                log::warn!("could not send overlay toast {}: {e}", toast.id);
            }
        }
        match show_rect(&self.focus) {
            Some(rect) => {
                window::show(&self.app, rect);
                self.shown = Some(rect);
            }
            None => log::debug!("no monitor to show the overlay on"),
        }
    }

    fn refresh_status(&self) {
        let exclusive = self.focus.focus == GameFocus::Focused && window::exclusive_fullscreen();
        let service = self.app.state::<OverlayService>();
        let mut status = service.status.lock_or_recover();
        let next = next_status(*status, self.focus.focus, exclusive);
        if next == *status {
            return;
        }
        *status = next;
        drop(status);
        log::debug!("overlay status: {next:?}");
        if let Err(e) = self.app.emit_to(MAIN_WINDOW, STATUS_EVENT, next) {
            log::warn!("could not emit {STATUS_EVENT}: {e}");
        }
    }
}
