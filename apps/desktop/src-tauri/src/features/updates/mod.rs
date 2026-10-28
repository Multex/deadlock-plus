use semver::Version;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum UpdateChannel {
    Release,
    Beta,
    Nightly,
}

#[cfg(not(feature = "update-rehearsal"))]
const RELEASE_FEED: &str = "https://github.com/deadlock-plus/deadlock-plus/releases/latest/download/latest.json";
#[cfg(not(feature = "update-rehearsal"))]
const BETA_FEED: &str = "https://github.com/deadlock-plus/deadlock-plus/releases/download/beta-feed/latest.json";
#[cfg(not(feature = "update-rehearsal"))]
const NIGHTLY_FEED: &str = "https://github.com/deadlock-plus/deadlock-plus/releases/download/nightly-feed/latest.json";

// A local release build pointed at feeds on this machine, so a real signed installer can be installed through the
// whole update flow before a release ships. Only a build switch selects them: nothing at run time can change a feed,
// and a build on GitHub's runners refuses the switch.
#[cfg(feature = "update-rehearsal")]
const RELEASE_FEED: &str = "http://127.0.0.1:4790/latest.json";
#[cfg(feature = "update-rehearsal")]
const BETA_FEED: &str = "http://127.0.0.1:4791/latest.json";
#[cfg(feature = "update-rehearsal")]
const NIGHTLY_FEED: &str = "http://127.0.0.1:4792/latest.json";
#[cfg(feature = "update-rehearsal")]
const _: () = assert!(option_env!("GITHUB_ACTIONS").is_none(), "update-rehearsal must never build on CI");

impl UpdateChannel {
    /// A channel also follows every more stable one, so a beta that ends in a release moves its users onto that
    /// release instead of leaving them on the last beta.
    pub fn feeds(self) -> &'static [&'static str] {
        match self {
            Self::Release => &[RELEASE_FEED],
            Self::Beta => &[RELEASE_FEED, BETA_FEED],
            Self::Nightly => &[RELEASE_FEED, BETA_FEED, NIGHTLY_FEED],
        }
    }
}

/// The newest offer above `current` among the feeds' answers. Never older than or equal to `current`, so no channel
/// downgrades: a user who moves to a more stable channel waits for it to catch up. A feed that failed is skipped
/// while another answered (nightly feeds carry no Linux build); only when all failed is the first error returned.
pub fn newest<T, E>(
    current: &Version,
    answers: Vec<Result<Option<T>, E>>,
    version: impl Fn(&T) -> &str,
) -> Result<Option<T>, E> {
    let mut best: Option<(Version, T)> = None;
    let mut first_error = None;
    let mut answered = false;
    for answer in answers {
        let offer = match answer {
            Ok(offer) => {
                answered = true;
                offer
            }
            Err(e) => {
                first_error.get_or_insert(e);
                continue;
            }
        };
        let Some(offer) = offer else { continue };
        let Ok(offered) = Version::parse(version(&offer)) else { continue };
        if offered > *current && best.as_ref().is_none_or(|(top, _)| offered > *top) {
            best = Some((offered, offer));
        }
    }
    match first_error {
        Some(e) if !answered => Err(e),
        _ => Ok(best.map(|(_, offer)| offer)),
    }
}

/// The shape the updater plugin's JS `Update` class is built from; its `rid` is what the plugin's own `download`
/// and `install` commands look the update up by, so those keep working unchanged for every channel.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    rid: tauri::ResourceId,
    current_version: String,
    version: String,
    date: Option<String>,
    body: Option<String>,
    raw_json: serde_json::Value,
}

pub mod commands {
    use super::*;
    use crate::command_panics::guarded;
    use crate::features::error::AppError;
    use std::time::Duration;
    use tauri::{Manager, Webview};
    use tauri_plugin_updater::{Update, UpdaterExt};

    const TIMEOUT: Duration = Duration::from_secs(30);

    async fn check_feed(webview: &Webview, feed: &str) -> Result<Option<Update>, String> {
        let url = feed.parse().map_err(|e| format!("{feed}: {e}"))?;
        let updater = webview
            .updater_builder()
            .endpoints(vec![url])
            .and_then(|builder| builder.timeout(TIMEOUT).build())
            .map_err(|e| format!("{feed}: {e}"))?;
        updater.check().await.map_err(|e| format!("{feed}: {e}"))
    }

    /// Checks every feed the channel follows and keeps the update as a resource of this webview, as the plugin's own
    /// `check` does. The plugin's comparator stays in place, so each feed alone already refuses a downgrade.
    #[tauri::command]
    pub async fn check_update(webview: Webview, channel: UpdateChannel) -> Result<Option<UpdateMetadata>, AppError> {
        guarded(async move {
            let current = webview.package_info().version.to_string();
            let current = Version::parse(&current).map_err(AppError::internal)?;
            let answers =
                futures::future::join_all(channel.feeds().iter().map(|feed| check_feed(&webview, feed))).await;
            for failure in answers.iter().filter_map(|answer| answer.as_ref().err()) {
                log::warn!("update feed check failed: {failure}");
            }
            let Some(update) =
                newest(&current, answers, |update: &Update| &update.version).map_err(AppError::network)?
            else {
                return Ok(None);
            };
            let date = update
                .date
                .map(|date| date.format(&time::format_description::well_known::Rfc3339))
                .transpose()
                .map_err(AppError::internal)?;
            Ok(Some(UpdateMetadata {
                current_version: update.current_version.clone(),
                version: update.version.clone(),
                date,
                body: update.body.clone(),
                raw_json: update.raw_json.clone(),
                rid: webview.resources_table().add(update),
            }))
        })
        .await
    }
}

#[cfg(test)]
mod tests;
