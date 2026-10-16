use std::time::Duration;

use tauri::{AppHandle, Manager};

use super::state::ServerPickerState;
use crate::features::jobs::{JobSpec, JobsState, Policy};
use crate::features::notifications::{self, NotificationTopic};
use crate::http::Http;
use dp_firewall as firewall;
use dp_server_picker::sync::sync_blocks;

const FIRST_RUN_DELAY: Duration = Duration::from_secs(20);
const INTERVAL: Duration = Duration::from_secs(30 * 60);

/// Never registered as a running job: a sync is a short firewall edit, not something to show in
/// the status bar. It is declared only so settings can list it and switch it off.
pub(crate) const SYNC_JOB: JobSpec =
    JobSpec { id: "server-block-sync", default_policy: Policy::Always, policy_configurable: false };

pub fn is_enabled(app: &AppHandle) -> bool {
    app.state::<JobsState>().registry.is_enabled(SYNC_JOB.id)
}

async fn run_in_background(app: &AppHandle) {
    if !is_enabled(app) {
        return;
    }
    let outcome = match sync_blocks(&app.state::<ServerPickerState>().sync_lock, &app.state::<Http>().0).await {
        Ok(outcome) => outcome,
        Err(e) => {
            log::warn!("background block sync failed: {e}");
            return;
        }
    };
    log::debug!("block sync: {} updated, {} failed", outcome.updated.len(), outcome.failed.len());

    if !outcome.updated.is_empty() {
        notifications::push(
            app,
            NotificationTopic::ServerBlocksUpdated,
            "notifications.server_blocks_updated",
            &[("servers", outcome.updated.join(", "))],
            Some("/server-picker".into()),
        );
    }
    if !outcome.failed.is_empty() {
        notifications::push(
            app,
            NotificationTopic::ServerBlocksStale,
            "notifications.server_blocks_stale",
            &[("servers", outcome.failed.join(", "))],
            Some("/server-picker".into()),
        );
    }
}

pub fn start(app: &AppHandle) {
    if !firewall::SUPPORTED {
        return;
    }
    let wake = app.state::<ServerPickerState>().sync_now.clone();
    app.state::<JobsState>().registry.on_enabled(Box::new(move |id| {
        if id == SYNC_JOB.id {
            wake.notify_one();
        }
    }));

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_RUN_DELAY).await;
        let wake = app.state::<ServerPickerState>().sync_now.clone();
        loop {
            run_in_background(&app).await;
            let _ = tokio::time::timeout(INTERVAL, wake.notified()).await;
        }
    });
}
