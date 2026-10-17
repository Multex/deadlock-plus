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
/// Frames this close to a focus change are dropped too: the game hitches as it resumes.
const FOCUS_PAD_NS: u64 = 250_000_000;

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

    /// Leaves out frames inside `unfocused` (widened by [`FOCUS_PAD_NS`]) and reports that time as background.
    pub fn stats(&self, unfocused: &[(u64, u64)]) -> FrameStats {
        let Some(main) = self.main_swapchain() else {
            return FrameStats::default();
        };
        let padded: Vec<(u64, u64)> =
            unfocused.iter().map(|&(a, b)| (a.saturating_sub(FOCUS_PAD_NS), b.saturating_add(FOCUS_PAD_NS))).collect();
        let mut stats = FrameStats::from_segments(&split_focused(main, &padded), TICKS_PER_SECOND);
        stats.background_ms =
            unfocused.iter().map(|&(a, b)| b.saturating_sub(a)).sum::<u64>() as f64 * 1000.0 / TICKS_PER_SECOND as f64;
        stats
    }
}

/// Turns timed focus changes into the unfocused intervals inside `from..=to`. The game counts as focused
/// until a change says otherwise.
fn unfocused_intervals(changes: &[(u64, bool)], from: u64, to: u64) -> Vec<(u64, u64)> {
    let mut sorted = changes.to_vec();
    sorted.sort_by_key(|&(at, _)| at);
    let mut intervals = Vec::new();
    let mut away_since: Option<u64> = None;
    for (at, focused) in sorted {
        let at = at.clamp(from, to);
        match (focused, away_since) {
            (false, None) => away_since = Some(at),
            (true, Some(start)) => {
                away_since = None;
                if at > start {
                    intervals.push((start, at));
                }
            }
            _ => {}
        }
    }
    if let Some(start) = away_since.filter(|&start| to > start) {
        intervals.push((start, to));
    }
    intervals
}

struct Focus {
    focused: bool,
    /// `Some` only while a capture runs.
    changes: Option<Vec<(u64, bool)>>,
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
    clock: fn() -> u64,
    running: Mutex<Option<Running>>,
    focus: Mutex<Focus>,
}

impl LayerCapture {
    pub fn new(dir: Option<PathBuf>) -> Self {
        Self::with_clock(dir, monotonic_ns)
    }

    fn with_clock(dir: Option<PathBuf>, clock: fn() -> u64) -> Self {
        Self { dir, clock, running: Mutex::new(None), focus: Mutex::new(Focus { focused: true, changes: None }) }
    }

    /// Call on every focus change, capturing or not, so a capture knows the state it starts in. A closed
    /// game counts as focused.
    pub fn set_game_focused(&self, focused: bool) {
        let at = (self.clock)();
        let mut focus = self.focus.lock_or_recover();
        focus.focused = focused;
        if let Some(changes) = focus.changes.as_mut() {
            changes.push((at, focused));
        }
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
        {
            let mut focus = self.focus.lock_or_recover();
            focus.changes = Some(vec![((self.clock)(), focus.focused)]);
        }
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
            game_focused: self.focus.lock_or_recover().focused,
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
        let changes = self.focus.lock_or_recover().changes.take().unwrap_or_default();
        let from = changes.first().map_or(0, |&(at, _)| at);
        let unfocused = unfocused_intervals(&changes, from, (self.clock)());
        let stats = r.shared.log.lock_or_recover().stats(&unfocused);
        stats
    }
}

/// The layer's clock, read without a `libc` dependency; std already links the C library on Linux.
#[cfg(target_os = "linux")]
fn monotonic_ns() -> u64 {
    use std::ffi::{c_int, c_long};

    // Layout of `struct timespec` on the 64-bit Linux targets the app ships for.
    #[repr(C)]
    struct Timespec {
        tv_sec: c_long,
        tv_nsec: c_long,
    }
    const CLOCK_MONOTONIC: c_int = 1;
    extern "C" {
        fn clock_gettime(clock: c_int, ts: *mut Timespec) -> c_int;
    }

    let mut ts = Timespec { tv_sec: 0, tv_nsec: 0 };
    // SAFETY: `ts` is a valid out pointer; CLOCK_MONOTONIC always exists.
    unsafe { clock_gettime(CLOCK_MONOTONIC, &mut ts) };
    (ts.tv_sec as u64).wrapping_mul(1_000_000_000).wrapping_add(ts.tv_nsec as u64)
}

/// No layer runs off Linux; this keeps the capture usable in tests on a development host.
#[cfg(not(target_os = "linux"))]
fn monotonic_ns() -> u64 {
    use std::sync::OnceLock;
    static START: OnceLock<Instant> = OnceLock::new();
    START.get_or_init(Instant::now).elapsed().as_nanos() as u64
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
    use std::sync::atomic::AtomicU64;

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
        assert_eq!(log.stats(&[]).frame_count, 19);
    }

    #[test]
    fn frame_log_stats_survive_out_of_order_records() {
        let mut log = FrameLog::default();
        let mut bytes = encode_header(1).to_vec();
        for t in [30u64, 10, 20, 40] {
            encode_record(Record { timestamp_ns: t * MS, swapchain: 1 }, &mut bytes);
        }
        log.feed(&bytes).unwrap();
        let stats = log.stats(&[]);
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

    #[test]
    fn leaving_and_returning_yields_one_interval() {
        let changes = [(0, true), (20, false), (25, false), (30, true), (40, true)];
        assert_eq!(unfocused_intervals(&changes, 0, 100), vec![(20, 30)]);
    }

    #[test]
    fn still_away_at_stop_closes_at_the_window_end() {
        assert_eq!(unfocused_intervals(&[(0, true), (50, false)], 0, 100), vec![(50, 100)]);
    }

    #[test]
    fn away_at_start_opens_at_the_window_start() {
        assert_eq!(unfocused_intervals(&[(0, false), (40, true)], 0, 100), vec![(0, 40)]);
    }

    #[test]
    fn changes_outside_the_window_are_clamped_to_it() {
        assert_eq!(unfocused_intervals(&[(5, false), (150, true)], 10, 100), vec![(10, 100)]);
        assert!(unfocused_intervals(&[(5, false), (8, true)], 10, 100).is_empty());
    }

    #[test]
    fn changes_recorded_out_of_order_are_sorted_first() {
        assert_eq!(unfocused_intervals(&[(0, true), (30, true), (20, false)], 0, 100), vec![(20, 30)]);
    }

    #[test]
    fn always_focused_yields_nothing() {
        assert!(unfocused_intervals(&[(0, true)], 0, 100).is_empty());
        assert!(unfocused_intervals(&[], 0, 100).is_empty());
    }

    #[test]
    fn frame_log_drops_padded_unfocused_time_and_reports_it_as_background() {
        let mut log = FrameLog::default();
        let mut bytes = encode_header(1).to_vec();
        bytes.extend(records(1, 0, 200, 10));
        log.feed(&bytes).unwrap();
        let stats = log.stats(&[(1000 * MS, 1500 * MS)]);
        // Kept: 0..=740 ms (75 presents) and 1760..=1990 ms (24 presents), one frame fewer per run.
        assert_eq!(stats.frame_count, 74 + 23);
        assert!((stats.background_ms - 500.0).abs() < 1e-6);
        assert!((stats.max_ms - 10.0).abs() < 1e-6, "the gap must not count as a frame");
    }

    #[test]
    fn the_capture_clock_moves_forward() {
        let first = monotonic_ns();
        thread::sleep(Duration::from_millis(5));
        let second = monotonic_ns();
        assert!(second >= first + 4 * MS, "{first} -> {second}");
    }

    static FOCUS_CLOCK: AtomicU64 = AtomicU64::new(0);

    #[test]
    fn focus_changes_while_capturing_reach_the_stats() {
        let dir = temp_dir("focus");
        let capture = LayerCapture::with_clock(Some(dir.clone()), || FOCUS_CLOCK.load(Ordering::SeqCst));
        capture.set_game_focused(false);
        FOCUS_CLOCK.store(0, Ordering::SeqCst);
        capture.start();
        assert!(!capture.status().game_focused, "a tab-out before start carries into the capture");
        FOCUS_CLOCK.store(300 * MS, Ordering::SeqCst);
        capture.set_game_focused(true);
        assert!(capture.status().game_focused);
        FOCUS_CLOCK.store(1000 * MS, Ordering::SeqCst);
        capture.set_game_focused(false);
        FOCUS_CLOCK.store(1500 * MS, Ordering::SeqCst);
        capture.set_game_focused(true);
        write_file(&dir, 11, &records(1, 0, 200, 10));
        wait_for(&capture, |s| s.frames >= 200);
        FOCUS_CLOCK.store(2000 * MS, Ordering::SeqCst);
        let stats = capture.stop();
        // Kept: 560..=740 ms (19 presents) and 1760..=1990 ms (24 presents).
        assert_eq!(stats.frame_count, 18 + 23);
        assert!((stats.background_ms - 800.0).abs() < 1e-6);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
