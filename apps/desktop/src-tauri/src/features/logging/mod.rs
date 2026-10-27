use flate2::{write::GzEncoder, Compression};
use serde::Serialize;
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, Weak};
use std::time::{Duration, SystemTime};
use time::{Date, OffsetDateTime, UtcOffset};
use ts_rs::TS;

use crate::features::error::{error_codes, AppError};

error_codes! {
    pub enum LoggingError in "logging" {
        LogFolderUnavailable = "log_folder_unavailable",
        ReadFailed = "read_failed",
        RevealFailed = "reveal_failed",
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub time: String,
    pub thread: String,
    pub level: String,
    pub logger: String,
    pub message: String,
}

const LEVELS: [&str; 5] = ["ERROR", "WARN", "INFO", "DEBUG", "TRACE"];
const MAX_ARCHIVES: usize = 60;
const BUFFER_BYTES: usize = 16 * 1024;
/// Upper bound on how stale a file can be when the process is killed without a chance to flush.
const FLUSH_INTERVAL: Duration = Duration::from_secs(1);
/// `UtcOffset::current_local_offset` is slow and rarely changes, so it is re-read at most this often.
const OFFSET_REFRESH_SECS: i64 = 60;
/// A tray app can stay up for days and trace.log is verbose, so one day's file is capped as well.
const MAX_FILE_BYTES: u64 = 32 * 1024 * 1024;
const NOISY_DEPENDENCIES: [&str; 12] = [
    "hyper",
    "hyper_util",
    "reqwest",
    "rustls",
    "tao",
    "wry",
    "tauri",
    "tauri_runtime_wry",
    "mio",
    "h2",
    "want",
    "notify",
];

/// Mirrors the file set of the reference log4j2 config: each file takes its level and everything above it.
const FILES: [(&str, log::LevelFilter); 3] = [
    ("latest.log", log::LevelFilter::Info),
    ("debug.log", log::LevelFilter::Debug),
    ("trace.log", log::LevelFilter::Trace),
];

/// Rolled files from the three logs share one name pattern, so archiving is serialised to keep the counters unique.
static ARCHIVE_LOCK: Mutex<()> = Mutex::new(());

pub fn logger_name(target: &str) -> &str {
    target.rsplit("::").next().unwrap_or(target)
}

fn level_colour(level: log::Level) -> &'static str {
    match level {
        log::Level::Error => "31",
        log::Level::Warn => "33",
        log::Level::Info | log::Level::Debug => "32",
        log::Level::Trace => "34",
    }
}

/// `[HH:mm:ss] [thread | LEVEL] [logger]: message`, optionally coloured like the reference console pattern.
pub fn format_line(clock: &str, thread: &str, level: log::Level, target: &str, message: &str, color: bool) -> String {
    let logger = logger_name(target);
    if !color {
        return format!("[{clock}] [{thread} | {level}] [{logger}]: {message}");
    }
    let body = if level == log::Level::Error { format!("\x1b[31m{message}\x1b[0m") } else { message.to_string() };
    format!(
        "\x1b[34m[{clock}]\x1b[0m \x1b[{}m[{thread} | {level}]\x1b[0m \x1b[36m[{logger}]\x1b[0m: {body}",
        level_colour(level)
    )
}

fn parse_header(line: &str) -> Option<LogEntry> {
    let rest = line.strip_prefix('[')?;
    let (time, rest) = rest.split_once("] [")?;
    let (tag, rest) = rest.split_once("] [")?;
    let (logger, message) = rest.split_once("]: ")?;
    let (thread, level) = tag.rsplit_once(" | ")?;
    if time.len() != 8 || !LEVELS.contains(&level) {
        return None;
    }
    Some(LogEntry {
        time: time.into(),
        thread: thread.into(),
        level: level.into(),
        logger: logger.into(),
        message: message.into(),
    })
}

pub fn parse_entries(text: &str) -> Vec<LogEntry> {
    let mut entries: Vec<LogEntry> = Vec::new();
    for line in text.lines() {
        match parse_header(line) {
            Some(entry) => entries.push(entry),
            None => {
                if let Some(last) = entries.last_mut() {
                    last.message.push('\n');
                    last.message.push_str(line);
                }
            }
        }
    }
    entries
}

fn local_offset() -> UtcOffset {
    UtcOffset::current_local_offset().unwrap_or(UtcOffset::UTC)
}

fn today() -> Date {
    OffsetDateTime::now_utc().to_offset(local_offset()).date()
}

fn file_date(time: SystemTime) -> Date {
    OffsetDateTime::from(time).to_offset(local_offset()).date()
}

fn archive_path(dir: &Path, date: Date) -> PathBuf {
    let stem = format!("{:04}-{:02}-{:02}", date.year(), date.month() as u8, date.day());
    (1..)
        .map(|i| dir.join(format!("{stem}-{i}.log.gz")))
        .find(|p| !p.exists())
        .expect("an unbounded range always yields a free name")
}

fn archive(dir: &Path, file: &Path, date: Date) -> io::Result<()> {
    if fs::metadata(file)?.len() == 0 {
        return Ok(());
    }
    let _guard = ARCHIVE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut encoder = GzEncoder::new(File::create(archive_path(dir, date))?, Compression::default());
    io::copy(&mut File::open(file)?, &mut encoder)?;
    encoder.finish()?;
    fs::remove_file(file)
}

fn prune_archives(dir: &Path) {
    let Ok(read) = fs::read_dir(dir) else { return };
    let mut archives: Vec<(SystemTime, PathBuf)> = read
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.to_string_lossy().ends_with(".log.gz"))
        .filter_map(|p| Some((p.metadata().ok()?.modified().ok()?, p)))
        .collect();
    archives.sort();
    let excess = archives.len().saturating_sub(MAX_ARCHIVES);
    for (_, path) in archives.into_iter().take(excess) {
        let _ = fs::remove_file(path);
    }
}

fn roll(dir: &Path, file: &Path, date: Date) {
    if let Err(e) = archive(dir, file, date) {
        eprintln!("could not archive {}: {e}", file.display());
    }
    prune_archives(dir);
}

/// Rolls on startup and at the first write of a new day, like the reference config's startup and time-based policies.
struct RollingFile {
    dir: PathBuf,
    path: PathBuf,
    file: Option<File>,
    day: Option<Date>,
    size: u64,
    max_size: u64,
    today: Date,
}

impl RollingFile {
    fn open(dir: &Path, name: &str) -> io::Result<Self> {
        fs::create_dir_all(dir)?;
        let path = dir.join(name);
        if let Ok(modified) = fs::metadata(&path).and_then(|m| m.modified()) {
            roll(dir, &path, file_date(modified));
        }
        Ok(Self {
            dir: dir.to_path_buf(),
            path,
            file: None,
            day: None,
            size: 0,
            max_size: MAX_FILE_BYTES,
            today: today(),
        })
    }

    fn write_on(&mut self, today: Date, buf: &[u8]) -> io::Result<usize> {
        let oversized = self.size > 0 && self.size + buf.len() as u64 > self.max_size;
        if let Some(day) = self.day.filter(|d| *d != today || oversized) {
            self.file = None;
            roll(&self.dir, &self.path, day);
        }
        let file = match &mut self.file {
            Some(file) => file,
            slot => {
                self.day = Some(today);
                let file = OpenOptions::new().create(true).append(true).open(&self.path)?;
                self.size = file.metadata()?.len();
                slot.insert(file)
            }
        };
        let written = file.write(buf)?;
        self.size += written as u64;
        Ok(written)
    }
}

impl Write for RollingFile {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.write_on(self.today, buf)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.file.as_mut().map_or(Ok(()), Write::flush)
    }
}

fn record_line(record: &log::Record, message: &std::fmt::Arguments, color: bool) -> String {
    let thread = std::thread::current();
    let now = OffsetDateTime::now_utc().to_offset(local_offset());
    format_line(
        &format!("{:02}:{:02}:{:02}", now.hour(), now.minute(), now.second()),
        thread.name().unwrap_or("unnamed"),
        record.level(),
        record.target(),
        &message.to_string(),
        color,
    )
}

struct FileState {
    out: BufWriter<RollingFile>,
    offset: UtcOffset,
    offset_read_at: i64,
}

/// One buffered log file. Lines are formatted straight into the buffer; an error record flushes it so
/// the lines leading up to a failure are on disk, and `flush_loop` bounds how long anything else waits.
struct FileLog {
    state: Mutex<FileState>,
}

impl FileLog {
    fn open(dir: &Path, name: &str) -> io::Result<Arc<Self>> {
        let out = BufWriter::with_capacity(BUFFER_BYTES, RollingFile::open(dir, name)?);
        Ok(Arc::new(Self { state: Mutex::new(FileState { out, offset: local_offset(), offset_read_at: i64::MIN }) }))
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, FileState> {
        self.state.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn write_at(&self, now: OffsetDateTime, record: &log::Record) {
        let mut state = self.lock();
        let date = now.date();
        if state.out.get_ref().today != date {
            // Buffered lines belong to the file's previous day and must be written before it rolls.
            let _ = state.out.flush();
            state.out.get_mut().today = date;
        }
        let thread = std::thread::current();
        let _ = writeln!(
            state.out,
            "[{:02}:{:02}:{:02}] [{} | {}] [{}]: {}",
            now.hour(),
            now.minute(),
            now.second(),
            thread.name().unwrap_or("unnamed"),
            record.level(),
            logger_name(record.target()),
            record.args()
        );
        if record.level() == log::Level::Error {
            let _ = state.out.flush();
        }
    }

    fn flush(&self) {
        let _ = self.lock().out.flush();
    }
}

struct FileLogHandle(Arc<FileLog>);

impl log::Log for FileLogHandle {
    fn enabled(&self, _: &log::Metadata) -> bool {
        true
    }

    fn log(&self, record: &log::Record) {
        let utc = OffsetDateTime::now_utc();
        let offset = {
            let mut state = self.0.lock();
            let minute = utc.unix_timestamp() / OFFSET_REFRESH_SECS;
            if state.offset_read_at != minute {
                state.offset = local_offset();
                state.offset_read_at = minute;
            }
            state.offset
        };
        self.0.write_at(utc.to_offset(offset), record);
    }

    fn flush(&self) {
        self.0.flush();
    }
}

/// Ends once every file it watches has been dropped.
fn flush_loop(files: Vec<Weak<FileLog>>) {
    loop {
        std::thread::sleep(FLUSH_INTERVAL);
        let mut alive = false;
        for file in &files {
            if let Some(file) = file.upgrade() {
                file.flush();
                alive = true;
            }
        }
        if !alive {
            return;
        }
    }
}

fn dispatch(dir: &Path) -> io::Result<tauri_plugin_log::fern::Dispatch> {
    use tauri_plugin_log::fern;

    let mut root = fern::Dispatch::new().level(log::LevelFilter::Trace);
    for name in NOISY_DEPENDENCIES {
        root = root.level_for(name, log::LevelFilter::Warn);
    }
    let mut files = Vec::with_capacity(FILES.len());
    for (name, level) in FILES {
        let file = FileLog::open(dir, name)?;
        files.push(Arc::downgrade(&file));
        root = root.chain(
            fern::Dispatch::new()
                .level(level)
                .chain(fern::Output::from(Box::new(FileLogHandle(file)) as Box<dyn log::Log>)),
        );
    }
    std::thread::Builder::new().name("log-flush".into()).spawn(move || flush_loop(files))?;
    if cfg!(debug_assertions) {
        root = root.chain(
            fern::Dispatch::new()
                .level(log::LevelFilter::Info)
                .format(|out, message, record| out.finish(format_args!("{}", record_line(record, message, true))))
                .chain(std::io::stdout()),
        );
    }
    Ok(root)
}

/// The plugin only supplies the web view's `log` command; the logger is installed here so its output
/// is not wrapped in the plugin's own line format.
pub fn plugin<R: tauri::Runtime>(dir: &Path) -> io::Result<tauri::plugin::TauriPlugin<R>> {
    dispatch(dir)?.apply().map_err(io::Error::other)?;
    Ok(tauri_plugin_log::Builder::new().skip_logger().build())
}

/// The crash marker is written first, with plain file I/O, because it is the record that must survive
/// if the process ends here. The log is flushed before the hook returns for the same reason.
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let backtrace = std::backtrace::Backtrace::force_capture().to_string();
        report_panic(&info.to_string(), &backtrace, crate::features::crash::record_panic);
        previous(info);
    }));
}

/// A panic inside a command body is answered with `common.internal` and the app keeps running, so it is logged
/// but leaves no crash marker for the next launch's crash dialog.
pub(crate) fn report_panic(message: &str, backtrace: &str, record_crash: impl FnOnce(&str, &str)) {
    if crate::command_panics::panic_is_handled() {
        log::error!("a command panicked and answered common.internal: {message}\n{backtrace}");
    } else {
        record_crash(message, backtrace);
        log::error!("{message}\n{backtrace}");
    }
    log::logger().flush();
}

pub fn log_startup(app: &tauri::AppHandle) {
    log::info!(
        "Deadlock+ {} starting ({} {}, args: {:?})",
        app.package_info().version,
        sysinfo::System::long_os_version().unwrap_or_else(|| std::env::consts::OS.to_string()),
        std::env::consts::ARCH,
        std::env::args().skip(1).collect::<Vec<_>>()
    );
}

pub mod commands {
    use super::*;
    use crate::command_panics::guarded;
    use tauri::Manager;

    const MAX_RETURNED: usize = 2000;
    const VIEWED_FILE: &str = "debug.log";

    fn log_dir(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
        app.path().app_log_dir().map_err(|e| AppError::new(LoggingError::LogFolderUnavailable).detail(e))
    }

    fn read_current(app: &tauri::AppHandle) -> Result<String, AppError> {
        log::logger().flush();
        let path = log_dir(app)?.join(VIEWED_FILE);
        match fs::read(&path) {
            Ok(bytes) => Ok(String::from_utf8_lossy(&bytes).into_owned()),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(String::new()),
            Err(e) => Err(AppError::new(LoggingError::ReadFailed).detail(e)),
        }
    }

    #[tauri::command]
    pub async fn read_logs(app: tauri::AppHandle) -> Result<Vec<LogEntry>, AppError> {
        guarded(async move {
            crate::command_panics::spawn_blocking_guarded(move || {
                let mut entries = parse_entries(&read_current(&app)?);
                let excess = entries.len().saturating_sub(MAX_RETURNED);
                entries.drain(..excess);
                Ok(entries)
            })
            .await?
        })
        .await
    }

    /// The current session at debug level, with user names in paths masked, ready to paste into a bug report.
    #[tauri::command]
    pub async fn export_logs(app: tauri::AppHandle) -> Result<String, AppError> {
        guarded(async move {
            crate::command_panics::spawn_blocking_guarded(move || {
                let header = format!(
                    "Deadlock+ {} on {} {}\n\n",
                    app.package_info().version,
                    sysinfo::System::long_os_version().unwrap_or_else(|| std::env::consts::OS.to_string()),
                    std::env::consts::ARCH
                );
                Ok(dp_crash::redact(&(header + &read_current(&app)?)))
            })
            .await?
        })
        .await
    }

    #[tauri::command]
    pub fn open_log_dir(app: tauri::AppHandle) -> Result<(), AppError> {
        let dir = log_dir(&app)?;
        fs::create_dir_all(&dir).map_err(AppError::io)?;
        crate::features::reveal::show(&dir).map_err(|e| AppError::new(LoggingError::RevealFailed).detail(e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Read;
    use time::Month;

    fn date(y: i32, m: Month, d: u8) -> Date {
        Date::from_calendar_date(y, m, d).unwrap()
    }

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn gunzip(path: &Path) -> String {
        let mut out = String::new();
        flate2::read::GzDecoder::new(fs::File::open(path).unwrap()).read_to_string(&mut out).unwrap();
        out
    }

    #[test]
    fn logger_is_the_last_path_segment() {
        assert_eq!(logger_name("deadlock_plus_lib::features::tray"), "tray");
        assert_eq!(logger_name("Webview"), "Webview");
    }

    #[test]
    fn plain_line_matches_the_log4j_pattern() {
        assert_eq!(
            format_line("12:34:56", "main", log::Level::Info, "deadlock_plus_lib::features::tray", "tray ready", false),
            "[12:34:56] [main | INFO] [tray]: tray ready"
        );
    }

    #[test]
    fn coloured_line_uses_the_log4j_colours() {
        let warn = format_line("01:02:03", "t", log::Level::Warn, "a::b", "m", true);
        assert_eq!(warn, "\x1b[34m[01:02:03]\x1b[0m \x1b[33m[t | WARN]\x1b[0m \x1b[36m[b]\x1b[0m: m");
        let error = format_line("01:02:03", "t", log::Level::Error, "a::b", "m", true);
        assert!(error.starts_with("\x1b[34m[01:02:03]\x1b[0m \x1b[31m[t | ERROR]\x1b[0m"));
        assert!(error.ends_with(": \x1b[31mm\x1b[0m"));
    }

    #[test]
    fn parses_a_formatted_line() {
        let got = parse_entries("[12:34:56] [tokio-runtime-worker | INFO] [tray]: tray ready\n");
        assert_eq!(
            got,
            vec![LogEntry {
                time: "12:34:56".into(),
                thread: "tokio-runtime-worker".into(),
                level: "INFO".into(),
                logger: "tray".into(),
                message: "tray ready".into(),
            }]
        );
    }

    #[test]
    fn unformatted_lines_continue_the_previous_entry() {
        let got = parse_entries("[12:00:00] [main | ERROR] [a]: panic at x\n  stack line 1\n  stack line 2\n[12:00:01] [main | INFO] [a]: next\n");
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].message, "panic at x\n  stack line 1\n  stack line 2");
        assert_eq!(got[1].message, "next");
    }

    #[test]
    fn leading_junk_before_the_first_entry_is_dropped() {
        assert!(parse_entries("stray\n").is_empty());
        assert_eq!(parse_entries("stray\n[12:00:00] [main | WARN] [a]: ok\n").len(), 1);
    }

    #[test]
    fn brackets_and_colons_inside_a_message_do_not_split_fields() {
        let got = parse_entries("[12:00:00] [main | INFO] [a]: got [1]: [2] items | x\r\n");
        assert_eq!(got[0].message, "got [1]: [2] items | x");
        assert_eq!(got[0].thread, "main");
    }

    #[test]
    fn archive_names_count_up_per_date() {
        let dir = scratch("archive-names");
        let d = date(2026, Month::September, 26);
        assert_eq!(archive_path(&dir, d), dir.join("2026-09-26-1.log.gz"));
        fs::write(dir.join("2026-09-26-1.log.gz"), b"x").unwrap();
        fs::write(dir.join("2026-09-26-2.log.gz"), b"x").unwrap();
        assert_eq!(archive_path(&dir, d), dir.join("2026-09-26-3.log.gz"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn opening_archives_the_previous_run_and_starts_empty() {
        let dir = scratch("startup");
        fs::write(dir.join("latest.log"), "old run\n").unwrap();
        let mut file = RollingFile::open(&dir, "latest.log").unwrap();
        file.write_on(date(2026, Month::September, 26), b"new run\n").unwrap();
        assert_eq!(fs::read_to_string(dir.join("latest.log")).unwrap(), "new run\n");
        let archives: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|e| e.file_name().to_string_lossy().ends_with(".log.gz"))
            .collect();
        assert_eq!(archives.len(), 1);
        assert_eq!(gunzip(&archives[0].path()), "old run\n");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_empty_previous_file_is_not_archived() {
        let dir = scratch("empty");
        fs::write(dir.join("latest.log"), "").unwrap();
        RollingFile::open(&dir, "latest.log").unwrap();
        assert!(!fs::read_dir(&dir)
            .unwrap()
            .filter_map(Result::ok)
            .any(|e| e.file_name().to_string_lossy().ends_with(".gz")));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_new_day_rolls_the_file_under_the_old_date() {
        let dir = scratch("daily");
        let mut file = RollingFile::open(&dir, "latest.log").unwrap();
        file.write_on(date(2026, Month::September, 26), b"day one\n").unwrap();
        file.write_on(date(2026, Month::September, 26), b"still day one\n").unwrap();
        file.write_on(date(2026, Month::September, 27), b"day two\n").unwrap();
        assert_eq!(fs::read_to_string(dir.join("latest.log")).unwrap(), "day two\n");
        assert_eq!(gunzip(&dir.join("2026-09-26-1.log.gz")), "day one\nstill day one\n");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_oversized_file_rolls_within_the_same_day() {
        let dir = scratch("size-cap");
        let mut file = RollingFile::open(&dir, "latest.log").unwrap();
        file.max_size = 10;
        let day = date(2026, Month::September, 26);
        file.write_on(
            day, b"123456
",
        )
        .unwrap();
        file.write_on(
            day, b"abcdef
",
        )
        .unwrap();
        file.write_on(
            day, b"x
",
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(dir.join("latest.log")).unwrap(),
            "abcdef
x
"
        );
        assert_eq!(
            gunzip(&dir.join("2026-09-26-1.log.gz")),
            "123456
"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_record_is_written_once_in_the_reference_format() {
        use log::Log;
        let dir = scratch("pipeline");
        let (_, logger) = dispatch(&dir).unwrap().into_log();
        logger.log(
            &log::Record::builder()
                .args(format_args!("submitted 1 match"))
                .target("deadlock_plus_lib::features::ingest")
                .level(log::Level::Info)
                .build(),
        );
        logger.flush();
        for file in ["latest.log", "debug.log", "trace.log"] {
            let entries = parse_entries(&fs::read_to_string(dir.join(file)).unwrap());
            assert_eq!(entries.len(), 1, "{file}");
            assert_eq!(entries[0].message, "submitted 1 match", "{file}");
            assert_eq!(entries[0].logger, "ingest", "{file}");
        }
        let _ = fs::remove_dir_all(&dir);
    }

    fn log_one(logger: &dyn log::Log, level: log::Level, text: &str) {
        logger.log(&log::Record::builder().args(format_args!("{}", text)).target("a::b").level(level).build());
    }

    fn on_disk(dir: &Path, file: &str) -> String {
        fs::read_to_string(dir.join(file)).unwrap_or_default()
    }

    #[test]
    fn info_records_wait_in_the_buffer_until_a_flush() {
        let dir = scratch("buffered");
        let (_, logger) = dispatch(&dir).unwrap().into_log();
        log_one(&*logger, log::Level::Info, "quiet");
        assert_eq!(on_disk(&dir, "debug.log"), "");
        logger.flush();
        assert!(on_disk(&dir, "debug.log").contains("quiet"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_error_record_is_on_disk_without_a_flush() {
        let dir = scratch("error-flush");
        let (_, logger) = dispatch(&dir).unwrap().into_log();
        log_one(&*logger, log::Level::Info, "before");
        log_one(&*logger, log::Level::Error, "boom");
        for file in ["latest.log", "debug.log", "trace.log"] {
            let text = on_disk(&dir, file);
            assert!(text.contains("before") && text.contains("boom"), "{file}: {text:?}");
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn buffered_records_reach_disk_on_the_timer() {
        let dir = scratch("timer");
        let (_, logger) = dispatch(&dir).unwrap().into_log();
        log_one(&*logger, log::Level::Info, "eventually");
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        while !on_disk(&dir, "debug.log").contains("eventually") {
            assert!(std::time::Instant::now() < deadline, "the timer never flushed");
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_file_line_matches_the_plain_reference_format() {
        let dir = scratch("line-format");
        let log = FileLog::open(&dir, "latest.log").unwrap();
        let now = date(2026, Month::September, 26).with_hms(1, 2, 3).unwrap().assume_utc();
        let record =
            log::Record::builder().args(format_args!("hello")).target("x::tray").level(log::Level::Warn).build();
        log.write_at(now, &record);
        log.flush();
        let thread = std::thread::current();
        let expected =
            format_line("01:02:03", thread.name().unwrap_or("unnamed"), log::Level::Warn, "x::tray", "hello", false);
        assert_eq!(on_disk(&dir, "latest.log"), format!("{expected}\n"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn buffered_lines_are_rolled_under_the_day_they_were_logged() {
        let dir = scratch("buffered-roll");
        let log = FileLog::open(&dir, "latest.log").unwrap();
        let at = |d: u8| date(2026, Month::September, d).with_hms(12, 0, 0).unwrap().assume_utc();
        let write = |day: u8, args: std::fmt::Arguments| {
            log.write_at(at(day), &log::Record::builder().args(args).target("a").level(log::Level::Info).build())
        };
        write(26, format_args!("day one"));
        write(27, format_args!("day two"));
        log.flush();
        assert!(gunzip(&dir.join("2026-09-26-1.log.gz")).contains("day one"));
        let latest = on_disk(&dir, "latest.log");
        assert!(latest.contains("day two") && !latest.contains("day one"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn each_file_keeps_only_its_level_and_above() {
        use log::Log;
        let dir = scratch("levels");
        let (_, logger) = dispatch(&dir).unwrap().into_log();
        for (level, text) in [(log::Level::Info, "info"), (log::Level::Debug, "debug"), (log::Level::Trace, "trace")] {
            logger.log(&log::Record::builder().args(format_args!("{text}")).target("a::b").level(level).build());
        }
        logger.flush();
        let messages = |file: &str| -> Vec<String> {
            parse_entries(&fs::read_to_string(dir.join(file)).unwrap()).into_iter().map(|e| e.message).collect()
        };
        assert_eq!(messages("latest.log"), ["info"]);
        assert_eq!(messages("debug.log"), ["info", "debug"]);
        assert_eq!(messages("trace.log"), ["info", "debug", "trace"]);
        let _ = fs::remove_dir_all(&dir);
    }
}

#[cfg(test)]
mod error_tests {
    #[test]
    fn every_logging_code_is_in_the_english_catalog() {
        crate::features::error::assert_catalogued::<super::LoggingError>();
    }
}
