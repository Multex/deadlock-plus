mod bundle;
mod issue;
mod redact;
mod store;

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub use bundle::{build_bundle, format_utc, tail_lines, LOG_LINES};
pub use issue::{issue_url, ISSUE_REPO, MAX_URL_LEN};
pub use redact::{redact, redact_secrets, redact_user_paths};
pub use store::{
    begin_session, bundle_path, dismiss_all, end_session, is_valid_id, list_markers, pending, prune, read_marker,
    record_panic, updated_from, write_bundle, write_marker, KEEP_MARKERS,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "kebab-case")]
pub enum CrashKind {
    Panic,
    Webview,
    UncleanExit,
}

impl CrashKind {
    pub fn as_str(self) -> &'static str {
        match self {
            CrashKind::Panic => "panic",
            CrashKind::Webview => "webview",
            CrashKind::UncleanExit => "unclean-exit",
        }
    }
}

/// What a marker file on disk holds. `log` is the tail of the log from the run that produced the
/// marker; it is attached at the next launch, before the log files roll.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashMarker {
    pub kind: CrashKind,
    pub timestamp_ms: u64,
    pub version: String,
    pub os: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backtrace: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub log: Option<String>,
}

/// The summary the web view gets: no backtrace and no log.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct CrashReport {
    pub id: String,
    pub kind: CrashKind,
    /// Unix time in milliseconds.
    #[ts(type = "number")]
    pub timestamp_ms: u64,
    pub version: String,
    pub os: String,
    /// Redacted, and cut to a length the dialog can show.
    pub message: String,
}

impl CrashReport {
    pub fn new(id: String, marker: &CrashMarker) -> Self {
        let message: String = redact(&marker.message).chars().take(600).collect();
        Self {
            id,
            kind: marker.kind,
            timestamp_ms: marker.timestamp_ms,
            version: marker.version.clone(),
            os: marker.os.clone(),
            message,
        }
    }
}

/// Where markers go and what the running build is. Cheap to clone into a panic hook.
#[derive(Debug, Clone)]
pub struct CrashContext {
    pub dir: PathBuf,
    pub version: String,
    pub os: String,
    /// `tauri dev` kills the app on every rebuild, so a dev build never reports an unclean exit.
    /// Panic markers are still written.
    pub dev: bool,
}

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}
