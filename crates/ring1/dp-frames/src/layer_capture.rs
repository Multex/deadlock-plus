use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime};

use dp_frames_wire::{Reader, Record, FRAME_FILE_EXTENSION, HEADER_LEN, RECORD_LEN};
use dp_sync::LockExt;

use crate::status::{CaptureError, CaptureState, CaptureStatus};
use crate::{recent_frametimes_ms, split_focused, FrameStats};

/// The layer stamps presents with `CLOCK_MONOTONIC` nanoseconds.
pub const TICKS_PER_SECOND: u64 = 1_000_000_000;
const MAX_FRAMES: usize = 1_000_000;
const LIVE_WINDOW: usize = 300;
const POLL: Duration = Duration::from_millis(250);

/// Presents parsed from one layer file, grouped by swapchain. The swapchain with the most presents is
/// the game's main one; the rest (overlays, capture tools) are counted but never enter the statistics.
#[derive(Default)]
pub struct FrameLog {
    reader: Reader,
    by_swapchain: HashMap<u32, Vec<u64>>,
    total: usize,
    truncated: bool,
}

impl FrameLog {
    pub fn feed(&mut self, bytes: &[u8]) -> Result<(), String> {
        let mut records: Vec<Record> = Vec::new();
        let result = self.reader.feed(bytes, &mut records);
        for r in records {
            if self.total >= MAX_FRAMES {
                self.truncated = true;
                break;
            }
            self.by_swapchain.entry(r.swapchain).or_default().push(r.timestamp_ns);
            self.total += 1;
        }
        result.map_err(|e| e.to_string())
    }

    fn main_swapchain(&self) -> Option<&Vec<u64>> {
        self.by_swapchain.values().max_by_key(|v| v.len())
    }

    pub fn frames(&self) -> usize {
        self.main_swapchain().map_or(0, Vec::len)
    }

    pub fn other_events(&self) -> usize {
        self.total - self.frames()
    }

    /// The newest timestamps of the main swapchain, sorted. Presents arrive almost in order, so the
    /// tail of the arrival order is the newest window; this avoids copying and sorting the whole log.
    pub fn recent_timestamps(&self) -> Vec<u64> {
        let Some(main) = self.main_swapchain() else {
            return Vec::new();
        };
        let mut tail = main[main.len().saturating_sub(LIVE_WINDOW + 1)..].to_vec();
        tail.sort_unstable();
        tail
    }

    pub fn recent_frametimes_ms(&self) -> Vec<f32> {
        recent_frametimes_ms(&self.recent_timestamps(), LIVE_WINDOW, TICKS_PER_SECOND)
    }

    pub fn stats(&self) -> FrameStats {
        match self.main_swapchain() {
            Some(main) => FrameStats::from_segments(&split_focused(main, &[]), TICKS_PER_SECOND),
            None => FrameStats::default(),
        }
    }
}

struct Shared {
    log: Mutex<FrameLog>,
    error: Mutex<Option<CaptureError>>,
    stop: AtomicBool,
    started: Instant,
}

struct Running {
    shared: Arc<Shared>,
    thread: Option<JoinHandle<()>>,
}

/// Reads the files the Vulkan layer writes into `dir`.
pub struct LayerCapture {
    dir: Option<PathBuf>,
    running: Mutex<Option<Running>>,
}

impl LayerCapture {
    pub fn new(dir: Option<PathBuf>) -> Self {
        Self { dir, running: Mutex::new(None) }
    }

    pub fn start(&self) {
        let mut guard = self.running.lock_or_recover();
        if guard.is_some() {
            return;
        }
        let shared = Arc::new(Shared {
            log: Mutex::new(FrameLog::default()),
            error: Mutex::new(None),
            stop: AtomicBool::new(false),
            started: Instant::now(),
        });
        let thread = match &self.dir {
            Some(dir) => {
                let (dir, shared) = (dir.clone(), shared.clone());
                let existing = frame_files(&dir).into_iter().map(|(path, _)| path).collect();
                let thread = thread::Builder::new()
                    .name("frames-layer-tail".into())
                    .spawn(move || tail_loop(&dir, existing, &shared))
                    .expect("spawn thread");
                Some(thread)
            }
            None => {
                log::warn!("frame capture: could not find the home folder");
                *shared.error.lock_or_recover() = Some(CaptureError::HomeFolderNotFound);
                None
            }
        };
        *guard = Some(Running { shared, thread });
    }

    pub fn status(&self) -> CaptureStatus {
        let guard = self.running.lock_or_recover();
        let Some(r) = guard.as_ref() else {
            return CaptureStatus::default();
        };
        let error = *r.shared.error.lock_or_recover();
        let (frames, other, truncated, tail) = {
            let log = r.shared.log.lock_or_recover();
            (log.frames(), log.other_events(), log.truncated, log.recent_timestamps())
        };
        let recent = recent_frametimes_ms(&tail, LIVE_WINDOW, TICKS_PER_SECOND);
        let state = if error.is_some() {
            CaptureState::Failed
        } else if frames == 0 {
            CaptureState::WaitingForGame
        } else {
            CaptureState::Capturing
        };
        CaptureStatus {
            state,
            error,
            frames: frames as u32,
            elapsed_ms: r.shared.started.elapsed().as_millis().min(u32::MAX as u128) as u32,
            other_process_events: other.min(u32::MAX as usize) as u32,
            truncated,
            game_focused: true,
            recent_frametimes_ms: recent,
        }
    }

    pub fn stop(&self) -> FrameStats {
        let Some(r) = self.running.lock_or_recover().take() else {
            return FrameStats::default();
        };
        r.shared.stop.store(true, Ordering::SeqCst);
        if let Some(thread) = r.thread {
            thread.thread().unpark();
            let _ = thread.join();
        }
        let stats = r.shared.log.lock_or_recover().stats();
        stats
    }
}

fn frame_files(dir: &Path) -> Vec<(PathBuf, SystemTime)> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|x| x == FRAME_FILE_EXTENSION))
        .filter_map(|e| Some((e.path(), e.metadata().ok()?.modified().ok()?)))
        .collect()
}

struct Tail {
    path: PathBuf,
    file: File,
}

/// Opens `path` and feeds its header. A file that predates the capture is read from its end, so time
/// spent in menus before the user pressed Start does not count.
fn open_tail(path: &Path, skip_backlog: bool, log: &mut FrameLog) -> Result<Tail, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut header = [0u8; HEADER_LEN];
    if file.read_exact(&mut header).is_err() {
        return Err("header not written yet".into());
    }
    log.feed(&header)?;
    if skip_backlog {
        let len = file.metadata().map_err(|e| e.to_string())?.len() as usize;
        let records = len.saturating_sub(HEADER_LEN) / RECORD_LEN;
        file.seek(SeekFrom::Start((HEADER_LEN + records * RECORD_LEN) as u64)).map_err(|e| e.to_string())?;
    }
    Ok(Tail { path: path.to_path_buf(), file })
}

fn tail_loop(dir: &Path, existing: HashSet<PathBuf>, shared: &Shared) {
    let mut tail: Option<Tail> = None;
    let mut rejected: HashSet<PathBuf> = HashSet::new();
    let mut buffer = Vec::new();
    while !shared.stop.load(Ordering::SeqCst) {
        let no_frames_yet = shared.log.lock_or_recover().frames() == 0;
        if tail.is_none() || no_frames_yet {
            let newest = frame_files(dir)
                .into_iter()
                .filter(|(p, _)| !rejected.contains(p))
                .max_by_key(|(_, modified)| *modified)
                .map(|(p, _)| p);
            if let Some(path) = newest.filter(|p| tail.as_ref().is_none_or(|t| &t.path != p)) {
                let mut fresh = FrameLog::default();
                match open_tail(&path, existing.contains(&path), &mut fresh) {
                    Ok(t) => {
                        *shared.log.lock_or_recover() = fresh;
                        *shared.error.lock_or_recover() = None;
                        tail = Some(t);
                    }
                    Err(e) if e == "header not written yet" => {}
                    Err(e) => {
                        log::warn!("frame capture: couldn't read {}: {e}", path.display());
                        *shared.error.lock_or_recover() = Some(CaptureError::ReadFailed);
                        rejected.insert(path);
                    }
                }
            }
        }
        if let Some(t) = tail.as_mut() {
            buffer.clear();
            if t.file.read_to_end(&mut buffer).is_ok() && !buffer.is_empty() {
                if let Err(e) = shared.log.lock_or_recover().feed(&buffer) {
                    log::warn!("frame capture: couldn't read {}: {e}", t.path.display());
                    *shared.error.lock_or_recover() = Some(CaptureError::ReadFailed);
                    rejected.insert(t.path.clone());
                    tail = None;
                }
            }
        }
        thread::park_timeout(POLL);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dp_frames_wire::{encode_header, encode_record};
    use std::io::Write;

    const MS: u64 = 1_000_000;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dp-frames-capture-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn records(swapchain: u32, from_ms: u64, count: u64, step_ms: u64) -> Vec<u8> {
        let mut out = Vec::new();
        for i in 0..count {
            encode_record(Record { timestamp_ns: (from_ms + i * step_ms) * MS, swapchain }, &mut out);
        }
        out
    }

    fn write_file(dir: &Path, pid: u32, body: &[u8]) -> PathBuf {
        let path = dir.join(format!("{pid}.dpf"));
        let mut bytes = encode_header(pid).to_vec();
        bytes.extend_from_slice(body);
        std::fs::write(&path, bytes).unwrap();
        path
    }

    fn append(path: &Path, body: &[u8]) {
        std::fs::OpenOptions::new().append(true).open(path).unwrap().write_all(body).unwrap();
    }

    fn wait_for(capture: &LayerCapture, done: impl Fn(&CaptureStatus) -> bool) -> CaptureStatus {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let status = capture.status();
            if done(&status) || Instant::now() > deadline {
                return status;
            }
            thread::sleep(Duration::from_millis(20));
        }
    }

    #[test]
    fn the_tail_does_not_poll_faster_than_four_times_a_second() {
        assert!(POLL >= Duration::from_millis(250));
    }

    #[test]
    fn frame_log_uses_the_busiest_swapchain_and_counts_the_rest_as_other() {
        let mut log = FrameLog::default();
        let mut bytes = encode_header(1).to_vec();
        bytes.extend(records(1, 1, 3, 10));
        bytes.extend(records(2, 1, 20, 10));
        log.feed(&bytes).unwrap();
        assert_eq!(log.frames(), 20);
        assert_eq!(log.other_events(), 3);
        assert_eq!(log.stats().frame_count, 19);
    }

    #[test]
    fn frame_log_stats_survive_out_of_order_records() {
        let mut log = FrameLog::default();
        let mut bytes = encode_header(1).to_vec();
        for t in [30u64, 10, 20, 40] {
            encode_record(Record { timestamp_ns: t * MS, swapchain: 1 }, &mut bytes);
        }
        log.feed(&bytes).unwrap();
        let stats = log.stats();
        assert_eq!(stats.frame_count, 3);
        assert!((stats.median_ms - 10.0).abs() < 1e-6);
    }

    #[test]
    fn recent_frametimes_cover_the_newest_window_in_time_order() {
        let mut log = FrameLog::default();
        let mut bytes = encode_header(1).to_vec();
        for i in 0..2000u64 {
            let t = if i < 1900 {
                i
            } else if i % 2 == 0 {
                i + 1
            } else {
                i - 1
            };
            encode_record(Record { timestamp_ns: t * MS, swapchain: 1 }, &mut bytes);
        }
        log.feed(&bytes).unwrap();
        let recent = log.recent_frametimes_ms();
        assert_eq!(recent.len(), LIVE_WINDOW);
        assert!(recent.iter().all(|ms| (ms - 1.0).abs() < 1e-3));
    }

    #[test]
    fn frame_log_reports_a_foreign_file() {
        let mut log = FrameLog::default();
        assert!(log.feed(&[b'x'; 32]).is_err());
    }

    #[test]
    fn new_files_are_read_from_the_start_and_followed() {
        let dir = temp_dir("follow");
        let capture = LayerCapture::new(Some(dir.clone()));
        capture.start();
        assert_eq!(capture.status().state, CaptureState::WaitingForGame);
        let path = write_file(&dir, 7, &records(1, 100, 10, 10));
        let status = wait_for(&capture, |s| s.frames >= 10);
        assert_eq!(status.state, CaptureState::Capturing);
        assert_eq!(status.frames, 10);
        append(&path, &records(1, 200, 5, 10));
        let status = wait_for(&capture, |s| s.frames >= 15);
        assert_eq!(status.frames, 15);
        assert_eq!(status.recent_frametimes_ms.len(), 14);
        let stats = capture.stop();
        assert_eq!(stats.frame_count, 14);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_file_from_before_start_only_contributes_what_is_appended_later() {
        let dir = temp_dir("backlog");
        let path = write_file(&dir, 9, &records(1, 0, 50, 10));
        let capture = LayerCapture::new(Some(dir.clone()));
        capture.start();
        thread::sleep(Duration::from_millis(200));
        assert_eq!(capture.status().frames, 0);
        append(&path, &records(1, 1000, 4, 10));
        let status = wait_for(&capture, |s| s.frames >= 4);
        assert_eq!(status.frames, 4);
        capture.stop();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_newer_file_replaces_a_silent_stale_one() {
        let dir = temp_dir("stale");
        write_file(&dir, 1, &records(1, 0, 5, 10));
        let capture = LayerCapture::new(Some(dir.clone()));
        capture.start();
        thread::sleep(Duration::from_millis(1100));
        write_file(&dir, 2, &records(1, 500, 6, 10));
        let status = wait_for(&capture, |s| s.frames >= 6);
        assert_eq!(status.frames, 6);
        capture.stop();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_foreign_file_fails_the_capture_with_an_error_code() {
        let dir = temp_dir("foreign");
        let capture = LayerCapture::new(Some(dir.clone()));
        capture.start();
        std::fs::write(dir.join("3.dpf"), [b'z'; 64]).unwrap();
        let status = wait_for(&capture, |s| s.state == CaptureState::Failed);
        assert_eq!(status.state, CaptureState::Failed);
        assert_eq!(serde_json::to_value(&status).unwrap()["error"], "diagnostics.frames_read_failed");
        capture.stop();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn without_a_folder_start_fails_and_stop_returns_empty_stats() {
        let capture = LayerCapture::new(None);
        capture.start();
        let status = capture.status();
        assert_eq!(status.state, CaptureState::Failed);
        assert_eq!(serde_json::to_value(&status).unwrap()["error"], "diagnostics.home_folder_not_found");
        assert_eq!(capture.stop().frame_count, 0);
        assert_eq!(capture.status().state, CaptureState::Idle);
    }
}
