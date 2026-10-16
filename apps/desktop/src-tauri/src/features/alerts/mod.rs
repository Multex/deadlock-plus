use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use crate::features::notifications::{self, NotificationKind};
use crate::features::patch_notes::PatchNotesState;
use crate::http::Http;
use dp_alerts::feed::parse_feed_with_text;
use dp_alerts::{load, merge_tracking_changes, save, Alert, Stored, STORE_FILE};
use dp_patch_notes::store::{PatchOrigin, PatchSource};
use dp_sync::LockExt;

const FEED_URL: &str = "https://api.deadlock-api.com/v2/patches";
const POLL: Duration = Duration::from_secs(15 * 60);
pub const CHANGED_EVENT: &str = "alerts-changed";

/// The catalog key and params for a batch of new alerts, or `None` when the batch is empty.
fn notification_message(fresh: &[Alert]) -> Option<(&'static str, Vec<(&'static str, String)>)> {
    let first = fresh.first()?;
    let title = ("title", first.title.clone());
    Some(match fresh.len() - 1 {
        0 => ("notifications.alert_new", vec![title]),
        n => ("notifications.alert_new_more", vec![title, ("count", n.to_string())]),
    })
}

#[derive(Default)]
pub struct AlertsState {
    enabled: AtomicBool,
    stored: Mutex<Option<Stored>>,
}

impl AlertsState {
    fn path(app: &AppHandle) -> Option<PathBuf> {
        app.path().app_data_dir().ok().map(|d| d.join(STORE_FILE))
    }

    fn with_stored<R>(&self, app: &AppHandle, f: impl FnOnce(&mut Stored) -> R) -> R {
        let mut guard = self.stored.lock_or_recover();
        let stored = guard.get_or_insert_with(|| Self::path(app).map(|p| load(&p)).unwrap_or_default());
        f(stored)
    }

    fn persist(&self, app: &AppHandle) {
        if let Some(path) = Self::path(app) {
            let guard = self.stored.lock_or_recover();
            if let Some(stored) = guard.as_ref() {
                if let Err(e) = save(&path, stored) {
                    log::warn!("could not save {STORE_FILE}: {e}");
                }
            }
        }
    }

    /// `notify` is off for a manual refresh: the user is already looking at the list.
    async fn poll(&self, app: &AppHandle, notify: bool) {
        let http = app.state::<Http>().0.clone();
        let resp = match http.get(FEED_URL).send().await.and_then(|r| r.error_for_status()) {
            Ok(resp) => resp,
            Err(e) => {
                log::warn!("alerts feed request failed: {e}");
                return;
            }
        };
        let text = match resp.text().await {
            Ok(text) => text,
            Err(e) => {
                log::warn!("alerts feed body could not be read: {e}");
                return;
            }
        };
        let pairs = match parse_feed_with_text(&text) {
            Ok(pairs) => pairs,
            Err(e) => {
                log::warn!("alerts feed could not be parsed: {e}");
                return;
            }
        };

        let items: Vec<Alert> = pairs.iter().map(|(alert, _)| alert.clone()).collect();
        // Embedding is slow CPU work; handing it to the dedicated indexer thread here just
        // queues it, so it never delays showing the alerts list itself.
        let patch_notes = app.state::<PatchNotesState>();
        let known = patch_notes.known_ids(app);
        let sourced: Vec<(PatchSource, String)> = pairs
            .into_iter()
            .filter(|(alert, _)| !known.contains(&alert.id))
            .map(|(alert, text)| {
                let origin = if alert.source == "steam" { PatchOrigin::Steam } else { PatchOrigin::Forum };
                (
                    PatchSource {
                        id: alert.id,
                        title: alert.title,
                        published: alert.published,
                        link: alert.link,
                        origin,
                    },
                    text,
                )
            })
            .collect();
        if !sourced.is_empty() {
            patch_notes.ingest_new(sourced);
        }

        let fetched = items.len();
        let (fresh, changed) = self.with_stored(app, |s| merge_tracking_changes(s, items));
        if changed {
            self.persist(app);
        }
        log::debug!("alerts poll: {fetched} items, {} new (notify: {notify})", fresh.len());
        if fresh.is_empty() {
            return;
        }
        log::info!("{} new Deadlock update(s) found", fresh.len());
        if let Err(e) = app.emit(CHANGED_EVENT, ()) {
            log::warn!("could not emit {CHANGED_EVENT}: {e}");
        }
        if !notify {
            return;
        }
        if let Some((key, params)) = notification_message(&fresh) {
            notifications::push(
                app,
                NotificationKind::Alert,
                key,
                &params,
                Some("/alerts".into()),
                notifications::ALERT_ROUTE,
            );
        }
    }
}

pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            let state = app.state::<AlertsState>();
            if state.enabled.load(Ordering::Relaxed) {
                state.poll(&app, true).await;
            }
            tokio::time::sleep(POLL).await;
        }
    });
}

pub mod commands {
    use super::*;
    use crate::features::error::AppError;

    #[tauri::command]
    pub fn set_alerts_enabled(enabled: bool, state: tauri::State<'_, AlertsState>) {
        state.enabled.store(enabled, Ordering::Relaxed);
        log::info!("update alerts {}", if enabled { "enabled" } else { "disabled" });
    }

    /// Fetches once on demand, even with alerts off, so the page is never empty just because nothing was polled yet.
    #[tauri::command]
    pub async fn refresh_alerts(app: AppHandle, state: tauri::State<'_, AlertsState>) -> Result<(), AppError> {
        state.poll(&app, false).await;
        Ok(())
    }

    #[tauri::command]
    pub fn list_alerts(app: AppHandle, state: tauri::State<'_, AlertsState>) -> Vec<Alert> {
        state.with_stored(&app, |s| s.alerts.clone())
    }

    #[tauri::command]
    pub fn mark_alerts_read(app: AppHandle, state: tauri::State<'_, AlertsState>) {
        let changed = state.with_stored(&app, |s| {
            let unread = s.alerts.iter().any(|a| !a.read);
            s.alerts.iter_mut().for_each(|a| a.read = true);
            unread
        });
        if changed {
            state.persist(&app);
            if let Err(e) = app.emit(CHANGED_EVENT, ()) {
                log::warn!("could not emit {CHANGED_EVENT}: {e}");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn alert(id: &str) -> Alert {
        Alert {
            id: id.into(),
            title: format!("title {id}"),
            link: format!("https://example.test/{id}"),
            source: "forum".into(),
            published: String::new(),
            kind: "Patch notes".into(),
            summary: String::new(),
            image: None,
            read: false,
        }
    }

    #[test]
    fn notification_message_summarises_a_batch() {
        assert_eq!(notification_message(&[]), None);
        assert_eq!(
            notification_message(&[alert("a")]),
            Some(("notifications.alert_new", vec![("title", "title a".to_string())]))
        );
        assert_eq!(
            notification_message(&[alert("a"), alert("b"), alert("c")]),
            Some(("notifications.alert_new_more", vec![("title", "title a".to_string()), ("count", "2".to_string())]))
        );
    }
}
