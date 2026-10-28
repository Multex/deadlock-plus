use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

use dp_announcements::{Announcement, Context, Fetch, KEYS, MAX_ENVELOPE_BYTES, URL};
use dp_sync::LockExt;

use crate::features::error::AppError;

/// Folder under the app data directory holding the last verified feed.
const DIR: &str = "announcements";
const FILE: &str = "feed.json";
const TIMEOUT: Duration = Duration::from_secs(30);

/// Overlapping calls would otherwise race on reading and replacing the stored feed.
static STORE: Mutex<()> = Mutex::new(());

async fn fetch(client: &reqwest::Client) -> Fetch {
    let mut res = match client.get(URL).timeout(TIMEOUT).send().await {
        Ok(res) => res,
        Err(e) => return Fetch::Failed(e.to_string()),
    };
    let status = res.status().as_u16();
    let mut body = Vec::new();
    loop {
        match res.chunk().await {
            Ok(Some(chunk)) => {
                body.extend_from_slice(&chunk);
                // One byte past the limit is enough for the feed to be rejected as oversized.
                if body.len() > MAX_ENVELOPE_BYTES {
                    body.truncate(MAX_ENVELOPE_BYTES + 1);
                    break;
                }
            }
            Ok(None) => break,
            Err(e) => return Fetch::Failed(e.to_string()),
        }
    }
    Fetch::from_response(status, body)
}

fn resolve_and_store(fetched: Fetch, dir: &Path, ctx: &Context) -> Result<Vec<Announcement>, AppError> {
    let _guard = STORE.lock_or_recover();
    let path = dir.join(FILE);
    let stored = std::fs::read(&path).ok();
    let resolved = dp_announcements::resolve(fetched, stored.as_deref(), KEYS).map_err(|e| match e {
        dp_announcements::Error::Fetch(_) => AppError::network(e),
        dp_announcements::Error::Feed(_) => AppError::internal(e),
    })?;
    if let Some(problem) = &resolved.rejected {
        log::warn!("{problem}; showing the last verified announcements");
    }
    if let Some(bytes) = &resolved.save {
        if let Err(e) = std::fs::create_dir_all(dir).and_then(|()| dp_atomic::write_atomic(&path, bytes)) {
            log::warn!("could not store the announcements feed: {e}");
        }
    }
    Ok(resolved.announcements(ctx))
}

pub mod commands {
    use tauri::{AppHandle, Manager, State};

    use super::*;
    use crate::command_panics::{guarded, spawn_blocking_guarded};
    use crate::http::Http;

    /// Signed developer announcements for this app version, platform and time, most severe first.
    #[tauri::command]
    pub async fn get_announcements(app: AppHandle, http: State<'_, Http>) -> Result<Vec<Announcement>, AppError> {
        guarded(async move {
            let dir = app.path().app_data_dir().map_err(AppError::io)?.join(DIR);
            let ctx = Context::current(app.package_info().version.clone());
            let fetched = fetch(&http.0).await;
            spawn_blocking_guarded(move || resolve_and_store(fetched, &dir, &ctx)).await?
        })
        .await
    }
}
