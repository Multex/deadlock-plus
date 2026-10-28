use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::bundle::{build_bundle, format_utc, tail_lines, LOG_LINES};
use crate::{CrashContext, CrashKind, CrashMarker};

/// Markers past this many are deleted, oldest first.
pub const KEEP_MARKERS: usize = 10;
const SENTINEL_FILE: &str = "session.sentinel";
const BUNDLE_PREFIX: &str = "deadlock-plus-crash-";
const MAX_MESSAGE_BYTES: usize = 8 * 1024;
const MAX_BACKTRACE_BYTES: usize = 64 * 1024;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Sentinel {
    started_ms: u64,
    version: String,
    os: String,
}

fn cap(text: &str, max_bytes: usize) -> &str {
    if text.len() <= max_bytes {
        return text;
    }
    let mut end = max_bytes;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

fn marker_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.json"))
}

pub fn bundle_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{BUNDLE_PREFIX}{id}.txt"))
}

/// Ids are file names built from a timestamp and a kind; anything else could escape the folder.
pub fn is_valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

fn marker_ids(dir: &Path) -> Vec<String> {
    let Ok(read) = fs::read_dir(dir) else { return Vec::new() };
    let mut ids: Vec<String> = read
        .filter_map(Result::ok)
        .filter_map(|e| e.file_name().into_string().ok())
        .filter_map(|name| name.strip_suffix(".json").map(str::to_string))
        .filter(|id| is_valid_id(id))
        .collect();
    ids.sort();
    ids
}

pub fn read_marker(dir: &Path, id: &str) -> io::Result<CrashMarker> {
    if !is_valid_id(id) {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "invalid crash id"));
    }
    serde_json::from_slice(&fs::read(marker_path(dir, id))?).map_err(io::Error::other)
}

/// Readable markers, newest first. A file that does not parse is skipped.
pub fn list_markers(dir: &Path) -> Vec<(String, CrashMarker)> {
    let mut out: Vec<_> =
        marker_ids(dir).into_iter().filter_map(|id| Some((id.clone(), read_marker(dir, &id).ok()?))).collect();
    out.reverse();
    out
}

pub fn pending(dir: &Path) -> Option<(String, CrashMarker)> {
    list_markers(dir).into_iter().next()
}

/// Plain `std::fs` and no shared state, so it is safe to call from a panic hook. Returns the id.
pub fn write_marker(
    ctx: &CrashContext,
    kind: CrashKind,
    message: &str,
    backtrace: Option<&str>,
    timestamp_ms: u64,
) -> io::Result<String> {
    fs::create_dir_all(&ctx.dir)?;
    let marker = CrashMarker {
        kind,
        timestamp_ms,
        version: ctx.version.clone(),
        os: ctx.os.clone(),
        message: cap(message, MAX_MESSAGE_BYTES).to_string(),
        backtrace: backtrace.map(|b| cap(b, MAX_BACKTRACE_BYTES).to_string()),
        log: None,
    };
    let json = serde_json::to_vec_pretty(&marker).map_err(io::Error::other)?;
    for n in 0.. {
        let id = match n {
            0 => format!("{timestamp_ms:013}-{}", kind.as_str()),
            _ => format!("{timestamp_ms:013}-{}-{n}", kind.as_str()),
        };
        match OpenOptions::new().write(true).create_new(true).open(marker_path(&ctx.dir, &id)) {
            Ok(mut file) => {
                file.write_all(&json)?;
                prune(&ctx.dir, KEEP_MARKERS);
                return Ok(id);
            }
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    unreachable!("an unbounded range always yields a free name")
}

pub fn record_panic(ctx: &CrashContext, message: &str, backtrace: &str) -> io::Result<String> {
    write_marker(ctx, CrashKind::Panic, message, Some(backtrace), crate::now_ms())
}

fn remove_bundle(dir: &Path, id: &str) {
    let _ = fs::remove_file(bundle_path(dir, id));
}

/// Deletes the oldest markers, and their report files, beyond `keep`.
pub fn prune(dir: &Path, keep: usize) {
    let ids = marker_ids(dir);
    for id in &ids[..ids.len().saturating_sub(keep)] {
        let _ = fs::remove_file(marker_path(dir, id));
        remove_bundle(dir, id);
    }
}

/// Deletes every marker and every report file. The session sentinel stays.
pub fn dismiss_all(dir: &Path) {
    let Ok(read) = fs::read_dir(dir) else { return };
    for entry in read.filter_map(Result::ok) {
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_marker = name.strip_suffix(".json").is_some_and(is_valid_id);
        let is_bundle = name.starts_with(BUNDLE_PREFIX) && name.ends_with(".txt");
        if is_marker || is_bundle {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Writes the report for `id` next to the markers and returns its path.
pub fn write_bundle(dir: &Path, id: &str, current_log: &str) -> io::Result<PathBuf> {
    let marker = read_marker(dir, id)?;
    let path = bundle_path(dir, id);
    fs::write(&path, build_bundle(&marker, current_log))?;
    Ok(path)
}

fn read_sentinel(dir: &Path) -> Option<Option<Sentinel>> {
    match fs::read(dir.join(SENTINEL_FILE)) {
        Ok(bytes) => Some(serde_json::from_slice(&bytes).ok()),
        Err(_) => None,
    }
}

fn attach_logs(dir: &Path, previous_log: &str) {
    if previous_log.trim().is_empty() {
        return;
    }
    let tail = tail_lines(previous_log, LOG_LINES);
    for (id, mut marker) in list_markers(dir) {
        if marker.log.is_some() {
            continue;
        }
        marker.log = Some(tail.clone());
        if let Ok(json) = serde_json::to_vec_pretty(&marker) {
            let _ = fs::write(marker_path(dir, &id), json);
        }
    }
}

/// Call once at launch, before the log files roll. A sentinel left by the last run means it died
/// without a clean exit, unless a marker already explains it, the build changed (the Windows
/// updater ends the old process without a clean exit) or `ctx.dev` is set. Markers still lacking
/// a log get the tail of `previous_log`, which is the log of the run that wrote them. Returns the
/// id of the `unclean-exit` marker when one was written.
pub fn begin_session(ctx: &CrashContext, previous_log: &str) -> io::Result<Option<String>> {
    fs::create_dir_all(&ctx.dir)?;
    let now = crate::now_ms();
    let mut written = None;
    if let Some(found) = read_sentinel(&ctx.dir) {
        let sentinel = found.unwrap_or(Sentinel { started_ms: 0, version: ctx.version.clone(), os: ctx.os.clone() });
        let explained = list_markers(&ctx.dir).iter().any(|(_, m)| m.timestamp_ms >= sentinel.started_ms);
        if !ctx.dev && sentinel.version == ctx.version && !explained {
            let past = CrashContext { dir: ctx.dir.clone(), version: sentinel.version, os: sentinel.os, dev: ctx.dev };
            let message = format!(
                "The previous run, started {}, did not exit cleanly (crash, forced close or shutdown).",
                format_utc(sentinel.started_ms)
            );
            written = Some(write_marker(&past, CrashKind::UncleanExit, &message, None, now)?);
        }
    }
    attach_logs(&ctx.dir, previous_log);
    let sentinel = Sentinel { started_ms: now, version: ctx.version.clone(), os: ctx.os.clone() };
    fs::write(ctx.dir.join(SENTINEL_FILE), serde_json::to_vec(&sentinel).map_err(io::Error::other)?)?;
    Ok(written)
}

/// The version of the previous run when it was another build that never exited cleanly, which is how the Windows
/// updater ends the old version. Read it before `begin_session`, which replaces the sentinel.
pub fn updated_from(dir: &Path, version: &str) -> Option<String> {
    read_sentinel(dir).flatten().map(|s| s.version).filter(|previous| previous != version)
}

/// Call on a clean exit.
pub fn end_session(dir: &Path) {
    let _ = fs::remove_file(dir.join(SENTINEL_FILE));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dp-crash-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    fn ctx(dir: &Path) -> CrashContext {
        CrashContext { dir: dir.to_path_buf(), version: "0.5.0".into(), os: "Test OS".into(), dev: false }
    }

    fn dev_ctx(dir: &Path) -> CrashContext {
        CrashContext { dev: true, ..ctx(dir) }
    }

    #[test]
    fn a_marker_round_trips() {
        let dir = scratch("round-trip");
        let id = write_marker(&ctx(&dir), CrashKind::Webview, "boom", Some("0: f"), 1_000).unwrap();
        let marker = read_marker(&dir, &id).unwrap();
        assert_eq!(marker.kind, CrashKind::Webview);
        assert_eq!(marker.message, "boom");
        assert_eq!(marker.backtrace.as_deref(), Some("0: f"));
        assert_eq!((marker.timestamp_ms, marker.version.as_str(), marker.os.as_str()), (1_000, "0.5.0", "Test OS"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn kinds_serialise_as_their_names() {
        let dir = scratch("kinds");
        let id = write_marker(&ctx(&dir), CrashKind::UncleanExit, "m", None, 5).unwrap();
        assert!(id.ends_with("-unclean-exit"));
        let text = fs::read_to_string(marker_path(&dir, &id)).unwrap();
        assert!(text.contains("\"unclean-exit\""));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn markers_written_in_the_same_millisecond_do_not_overwrite() {
        let dir = scratch("collision");
        let a = write_marker(&ctx(&dir), CrashKind::Panic, "one", None, 7).unwrap();
        let b = write_marker(&ctx(&dir), CrashKind::Panic, "two", None, 7).unwrap();
        assert_ne!(a, b);
        assert_eq!(list_markers(&dir).len(), 2);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn pending_is_the_newest_marker() {
        let dir = scratch("pending");
        assert!(pending(&dir).is_none());
        write_marker(&ctx(&dir), CrashKind::Panic, "old", None, 100).unwrap();
        write_marker(&ctx(&dir), CrashKind::Webview, "new", None, 200).unwrap();
        assert_eq!(pending(&dir).unwrap().1.message, "new");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn only_the_newest_markers_are_kept() {
        let dir = scratch("retention");
        for n in 0..(KEEP_MARKERS as u64 + 5) {
            write_marker(&ctx(&dir), CrashKind::Panic, &format!("m{n}"), None, 1_000 + n).unwrap();
        }
        let kept = list_markers(&dir);
        assert_eq!(kept.len(), KEEP_MARKERS);
        assert_eq!(kept[0].1.message, format!("m{}", KEEP_MARKERS + 4));
        assert_eq!(kept.last().unwrap().1.message, "m5");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn pruning_removes_the_report_file_of_a_pruned_marker() {
        let dir = scratch("prune-report");
        let old = write_marker(&ctx(&dir), CrashKind::Panic, "old", None, 1).unwrap();
        write_bundle(&dir, &old, "").unwrap();
        for n in 0..KEEP_MARKERS as u64 {
            write_marker(&ctx(&dir), CrashKind::Panic, "x", None, 10 + n).unwrap();
        }
        assert!(!bundle_path(&dir, &old).exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_unreadable_marker_is_skipped() {
        let dir = scratch("corrupt");
        write_marker(&ctx(&dir), CrashKind::Panic, "good", None, 1).unwrap();
        fs::write(dir.join("0000000000002-panic.json"), "{not json").unwrap();
        assert_eq!(list_markers(&dir).len(), 1);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn oversized_text_is_cut_on_a_character_boundary() {
        let dir = scratch("cap");
        let long = "\u{1f4a5}".repeat(10_000);
        let id = write_marker(&ctx(&dir), CrashKind::Panic, &long, Some(&long), 1).unwrap();
        let marker = read_marker(&dir, &id).unwrap();
        assert!(marker.message.len() <= MAX_MESSAGE_BYTES);
        assert!(marker.backtrace.unwrap().len() <= MAX_BACKTRACE_BYTES);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn ids_that_could_leave_the_folder_are_rejected() {
        let dir = scratch("ids");
        assert!(read_marker(&dir, "../secrets").is_err());
        assert!(read_marker(&dir, "").is_err());
        assert!(write_bundle(&dir, "a/b", "").is_err());
        assert!(is_valid_id("0000000001000-unclean-exit-2"));
    }

    #[test]
    fn dismiss_removes_markers_and_reports_but_not_the_sentinel() {
        let dir = scratch("dismiss");
        begin_session(&ctx(&dir), "").unwrap();
        let id = write_marker(&ctx(&dir), CrashKind::Panic, "m", None, crate::now_ms()).unwrap();
        write_bundle(&dir, &id, "").unwrap();
        dismiss_all(&dir);
        assert!(list_markers(&dir).is_empty());
        assert!(!bundle_path(&dir, &id).exists());
        assert!(dir.join(SENTINEL_FILE).exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_first_launch_has_no_marker_and_leaves_a_sentinel() {
        let dir = scratch("first");
        assert_eq!(begin_session(&ctx(&dir), "").unwrap(), None);
        assert!(dir.join(SENTINEL_FILE).exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_clean_exit_leaves_nothing_to_report_next_launch() {
        let dir = scratch("clean");
        begin_session(&ctx(&dir), "").unwrap();
        end_session(&dir);
        assert!(!dir.join(SENTINEL_FILE).exists());
        assert_eq!(begin_session(&ctx(&dir), "").unwrap(), None);
        assert!(list_markers(&dir).is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_leftover_sentinel_becomes_an_unclean_exit_marker() {
        let dir = scratch("unclean");
        begin_session(&ctx(&dir), "").unwrap();
        let id = begin_session(&ctx(&dir), "").unwrap().expect("marker written");
        let marker = read_marker(&dir, &id).unwrap();
        assert_eq!(marker.kind, CrashKind::UncleanExit);
        assert!(marker.message.contains("did not exit cleanly"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_panic_marker_from_the_dead_run_explains_it() {
        let dir = scratch("explained");
        begin_session(&ctx(&dir), "").unwrap();
        record_panic(&ctx(&dir), "panicked", "bt").unwrap();
        assert_eq!(begin_session(&ctx(&dir), "").unwrap(), None);
        assert_eq!(list_markers(&dir).len(), 1);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_sentinel_from_another_build_is_not_a_crash() {
        let dir = scratch("updated");
        let mut old = ctx(&dir);
        old.version = "0.4.1".into();
        begin_session(&old, "").unwrap();
        assert_eq!(begin_session(&ctx(&dir), "").unwrap(), None);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_sentinel_from_another_build_names_the_version_updated_from() {
        let dir = scratch("updated-from");
        let mut old = ctx(&dir);
        old.version = "0.4.1".into();
        begin_session(&old, "").unwrap();
        assert_eq!(updated_from(&dir, "0.5.0").as_deref(), Some("0.4.1"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn no_update_is_seen_after_a_clean_exit_the_same_build_or_a_first_launch() {
        let dir = scratch("not-updated");
        assert_eq!(updated_from(&dir, "0.5.0"), None);
        begin_session(&ctx(&dir), "").unwrap();
        assert_eq!(updated_from(&dir, "0.5.0"), None);
        let mut old = ctx(&dir);
        old.version = "0.4.1".into();
        begin_session(&old, "").unwrap();
        end_session(&dir);
        assert_eq!(updated_from(&dir, "0.5.0"), None);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_leftover_sentinel_in_a_dev_build_is_not_a_crash() {
        let dir = scratch("dev-unclean");
        begin_session(&dev_ctx(&dir), "").unwrap();
        assert_eq!(begin_session(&dev_ctx(&dir), "").unwrap(), None);
        assert!(list_markers(&dir).is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_panic_in_a_dev_build_is_still_reported() {
        let dir = scratch("dev-panic");
        begin_session(&dev_ctx(&dir), "").unwrap();
        record_panic(&dev_ctx(&dir), "panicked", "bt").unwrap();
        begin_session(&dev_ctx(&dir), "").unwrap();
        assert_eq!(pending(&dir).unwrap().1.kind, CrashKind::Panic);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_dev_build_still_writes_the_same_sentinel() {
        let (release, dev) = (scratch("sentinel-release"), scratch("sentinel-dev"));
        begin_session(&ctx(&release), "").unwrap();
        begin_session(&dev_ctx(&dev), "").unwrap();
        let read = |dir: &Path| -> serde_json::Value {
            let mut v: serde_json::Value = serde_json::from_slice(&fs::read(dir.join(SENTINEL_FILE)).unwrap()).unwrap();
            v["startedMs"] = 0.into();
            v
        };
        assert_eq!(read(&release), read(&dev));
        let _ = fs::remove_dir_all(&release);
        let _ = fs::remove_dir_all(&dev);
    }

    #[test]
    fn a_garbled_sentinel_still_counts_as_an_unclean_exit() {
        let dir = scratch("garbled");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(SENTINEL_FILE), "").unwrap();
        assert!(begin_session(&ctx(&dir), "").unwrap().is_some());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_previous_runs_log_is_attached_once() {
        let dir = scratch("attach");
        begin_session(&ctx(&dir), "").unwrap();
        let id = record_panic(&ctx(&dir), "boom", "bt").unwrap();
        begin_session(&ctx(&dir), "line a\nline b").unwrap();
        assert_eq!(read_marker(&dir, &id).unwrap().log.as_deref(), Some("line a\nline b"));
        begin_session(&ctx(&dir), "a newer run").unwrap();
        assert_eq!(read_marker(&dir, &id).unwrap().log.as_deref(), Some("line a\nline b"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_unclean_exit_marker_gets_the_previous_log_too() {
        let dir = scratch("attach-unclean");
        begin_session(&ctx(&dir), "").unwrap();
        let id = begin_session(&ctx(&dir), "last words").unwrap().unwrap();
        assert_eq!(read_marker(&dir, &id).unwrap().log.as_deref(), Some("last words"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_bundle_file_holds_the_report() {
        let dir = scratch("bundle");
        let id = write_marker(&ctx(&dir), CrashKind::Webview, "js broke", None, 1_000).unwrap();
        let path = write_bundle(&dir, &id, "current log line").unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(path.file_name().unwrap().to_string_lossy().starts_with("deadlock-plus-crash-"));
        assert!(text.contains("Kind: webview") && text.contains("js broke") && text.contains("current log line"));
        let _ = fs::remove_dir_all(&dir);
    }
}
