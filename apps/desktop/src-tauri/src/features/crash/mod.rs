use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::OnceLock;

use dp_crash::CrashContext;
use tauri::Manager;

use crate::features::error::{error_codes, AppError};

error_codes! {
    pub enum CrashError in "crash" {
        Unavailable = "unavailable",
        BundleWriteFailed = "bundle_write_failed",
        MarkerReadFailed = "marker_read_failed",
        MarkerWriteFailed = "marker_write_failed",
        RevealFailed = "reveal_failed",
        OpenIssueFailed = "open_issue_failed",
    }
}

const LOG_FILE: &str = "debug.log";
const DIR_NAME: &str = "crashes";
/// The web view could report the same fault in a loop; a few markers per run say everything.
const MAX_WEBVIEW_MARKERS: usize = 3;
const MAX_WEBVIEW_MESSAGE: usize = 4000;
/// Enough for well over 500 log lines without reading a multi-megabyte file into memory.
const LOG_TAIL_BYTES: u64 = 256 * 1024;

/// Set once at startup. The panic hook reads it without locking; a panic before it is set leaves no marker.
static CONTEXT: OnceLock<CrashContext> = OnceLock::new();
static WEBVIEW_MARKERS: AtomicUsize = AtomicUsize::new(0);

/// The last `max_bytes` of a file as text, starting at a line boundary. Empty when the file is missing.
fn read_tail(path: &Path, max_bytes: u64) -> String {
    let read = || -> io::Result<String> {
        let mut file = File::open(path)?;
        let len = file.metadata()?.len();
        let start = len.saturating_sub(max_bytes);
        file.seek(SeekFrom::Start(start))?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)?;
        let text = String::from_utf8_lossy(&bytes).into_owned();
        Ok(match start {
            0 => text,
            _ => text.split_once('\n').map_or(String::new(), |(_, rest)| rest.to_string()),
        })
    };
    read().unwrap_or_default()
}

fn build_context(app: &tauri::AppHandle) -> Result<CrashContext, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join(DIR_NAME);
    let os = format!(
        "{} {}",
        sysinfo::System::long_os_version().unwrap_or_else(|| std::env::consts::OS.to_string()),
        std::env::consts::ARCH
    );
    Ok(CrashContext { dir, version: app.package_info().version.to_string(), os, dev: tauri::is_dev() })
}

fn context() -> Result<&'static CrashContext, AppError> {
    CONTEXT.get().ok_or_else(|| CrashError::Unavailable.into())
}

/// Runs before the logging plugin is added, because that is what rolls `debug.log`: until then the file
/// still holds the previous run, whose tail goes into any marker that run left behind.
pub fn begin(app: &tauri::AppHandle) {
    let ctx = match build_context(app) {
        Ok(ctx) => ctx,
        Err(e) => return eprintln!("crash reporting disabled: {e}"),
    };
    let previous_log = app.path().app_log_dir().map(|dir| read_tail(&dir.join(LOG_FILE), LOG_TAIL_BYTES));
    let ctx = CONTEXT.get_or_init(|| ctx);
    if let Err(e) = dp_crash::begin_session(ctx, &previous_log.unwrap_or_default()) {
        eprintln!("could not start the crash session: {e}");
    }
}

/// Removes the sentinel. The app calls this from `RunEvent::Exit`, which both the tray's Quit item and
/// closing the last window reach.
pub fn end() {
    if let Some(ctx) = CONTEXT.get() {
        dp_crash::end_session(&ctx.dir);
    }
}

/// Called from the panic hook: plain file writes only, no locks and no Tauri state.
pub fn record_panic(message: &str, backtrace: &str) {
    if let Some(ctx) = CONTEXT.get() {
        let _ = dp_crash::record_panic(ctx, message, backtrace);
    }
}

pub(crate) fn current_log(app: &tauri::AppHandle) -> String {
    log::logger().flush();
    app.path().app_log_dir().map(|dir| read_tail(&dir.join(LOG_FILE), LOG_TAIL_BYTES)).unwrap_or_default()
}

/// The newest crash marker on disk, if any. It is left in place.
pub(crate) fn latest_marker() -> Option<dp_crash::CrashMarker> {
    let dir = &CONTEXT.get()?.dir;
    dp_crash::pending(dir).map(|(_, marker)| marker)
}

fn bundle_and_marker(app: &tauri::AppHandle, id: &str) -> Result<(PathBuf, dp_crash::CrashMarker), AppError> {
    let ctx = context()?;
    let path = dp_crash::write_bundle(&ctx.dir, id, &current_log(app))
        .map_err(|e| AppError::new(CrashError::BundleWriteFailed).detail(e))?;
    let marker =
        dp_crash::read_marker(&ctx.dir, id).map_err(|e| AppError::new(CrashError::MarkerReadFailed).detail(e))?;
    Ok((path, marker))
}

pub mod commands {
    use super::*;
    use dp_crash::CrashReport;

    async fn blocking<T: Send + 'static>(
        work: impl FnOnce() -> Result<T, AppError> + Send + 'static,
    ) -> Result<T, AppError> {
        tauri::async_runtime::spawn_blocking(work).await.map_err(AppError::internal)?
    }

    /// The newest unhandled crash marker, if the last run left one. The dialog shows this at launch.
    #[tauri::command]
    pub async fn pending_crash() -> Result<Option<CrashReport>, AppError> {
        let dir = context()?.dir.clone();
        blocking(move || Ok(dp_crash::pending(&dir).map(|(id, marker)| CrashReport::new(id, &marker)))).await
    }

    /// Writes the plain-text report for `id` next to the markers and returns its path.
    #[tauri::command]
    pub async fn write_crash_bundle(app: tauri::AppHandle, id: String) -> Result<String, AppError> {
        blocking(move || Ok(bundle_and_marker(&app, &id)?.0.to_string_lossy().into_owned())).await
    }

    /// Writes the report for `id`, shows it in the file manager and returns its path.
    #[tauri::command]
    pub async fn reveal_crash_bundle(app: tauri::AppHandle, id: String) -> Result<String, AppError> {
        blocking(move || {
            let (path, _) = bundle_and_marker(&app, &id)?;
            crate::features::reveal::show(&path).map_err(|e| AppError::new(CrashError::RevealFailed).detail(e))?;
            Ok(path.to_string_lossy().into_owned())
        })
        .await
    }

    /// Writes the report for `id`, opens the pre-filled GitHub issue in the browser and returns the report's
    /// path, so the dialog can tell the user which file to attach.
    #[tauri::command]
    pub async fn open_crash_issue(app: tauri::AppHandle, id: String) -> Result<String, AppError> {
        blocking(move || {
            let (path, marker) = bundle_and_marker(&app, &id)?;
            let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            tauri_plugin_opener::open_url(dp_crash::issue_url(&marker, &name), None::<&str>)
                .map_err(|e| AppError::new(CrashError::OpenIssueFailed).detail(e))?;
            Ok(path.to_string_lossy().into_owned())
        })
        .await
    }

    /// Deletes every crash marker and report file. The dialog is not shown again for them.
    #[tauri::command]
    pub async fn dismiss_crash() -> Result<(), AppError> {
        let dir = context()?.dir.clone();
        blocking(move || {
            dp_crash::dismiss_all(&dir);
            Ok(())
        })
        .await
    }

    /// Called by the web view on a fatal error. Writes a `webview` marker, at most a few per run.
    #[tauri::command]
    pub async fn report_webview_crash(message: String) -> Result<(), AppError> {
        let ctx = context()?;
        if WEBVIEW_MARKERS.fetch_add(1, Ordering::Relaxed) >= MAX_WEBVIEW_MARKERS {
            return Ok(());
        }
        let message: String = message.chars().take(MAX_WEBVIEW_MESSAGE).collect();
        dp_telemetry::errors::capture_webview_error(&message, "");
        blocking(move || {
            dp_crash::write_marker(ctx, dp_crash::CrashKind::Webview, &message, None, dp_crash::now_ms())
                .map(|_| ())
                .map_err(|e| AppError::new(CrashError::MarkerWriteFailed).detail(e))
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_crash_code_is_in_the_english_catalog() {
        crate::features::error::assert_catalogued::<CrashError>();
    }

    #[test]
    fn commands_report_unavailable_before_startup_sets_the_context() {
        assert_eq!(context().unwrap_err().code(), "crash.unavailable");
    }

    #[test]
    fn a_crash_bundle_stays_inside_the_crash_folder() {
        let dir = scratch("bundle-path");
        let ctx = CrashContext { dir: dir.clone(), version: "0".into(), os: "test".into(), dev: false };
        let id = dp_crash::write_marker(&ctx, dp_crash::CrashKind::Webview, "boom", None, 1).unwrap();
        let path = dp_crash::write_bundle(&dir, &id, "").unwrap();
        assert_eq!(path.parent(), Some(dir.as_path()));
        for hostile in ["../x", r"..\x", "a/b", r"a\b", "..", ".", "", "A", "a.b", "C:x"] {
            assert!(dp_crash::write_bundle(&dir, hostile, "").is_err(), "{hostile:?} was accepted");
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-crash-test-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_small_file_is_read_whole() {
        let dir = scratch("small");
        std::fs::write(dir.join("a.log"), "one\ntwo\n").unwrap();
        assert_eq!(read_tail(&dir.join("a.log"), 1024), "one\ntwo\n");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_large_file_is_cut_to_whole_lines_from_the_end() {
        let dir = scratch("large");
        std::fs::write(dir.join("a.log"), "first line\nsecond line\nthird line\n").unwrap();
        assert_eq!(read_tail(&dir.join("a.log"), 15), "third line\n");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_missing_file_is_empty() {
        assert_eq!(read_tail(&std::env::temp_dir().join("deadlock-plus-no-such.log"), 10), "");
    }
}
