use std::ffi::{OsStr, OsString};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

#[cfg(windows)]
pub mod focus;
#[cfg(not(windows))]
#[path = "focus_stub.rs"]
pub mod focus;
mod focus_state;

/// Deadlock runs as `deadlock.exe` under Wine and Proton too, though Proton can report a different process name.
pub const PROCESS_NAME: &str = "deadlock.exe";

pub fn is_process(name: &OsStr) -> bool {
    name.to_string_lossy().eq_ignore_ascii_case(PROCESS_NAME)
}

/// How long a scan stays valid. Every caller shares it, so the whole app enumerates processes at most this often.
pub const MAX_AGE: Duration = Duration::from_secs(2);

#[derive(Clone)]
struct Proc {
    pid: u32,
    name: OsString,
    start: u64,
    argv0: Option<OsString>,
}

impl Proc {
    fn matches(&self, matches: fn(&OsStr) -> bool) -> bool {
        // Proton can expose a thread name instead of the executable. Later arguments can belong to launchers.
        matches(&self.name)
            || self.argv0.as_deref().is_some_and(|arg| {
                let arg = arg.to_string_lossy();
                matches(OsStr::new(arg.rsplit(['/', '\\']).next().unwrap_or_default()))
            })
    }
}

/// Time-bounded cache over a process scanner. The scan runs on whichever caller finds it stale, under the lock, so
/// concurrent callers share one scan and the first call always sees a fresh value.
struct ScanCache<S> {
    scan: S,
    max_age: Duration,
    last: Mutex<Option<(Instant, Vec<Proc>)>>,
}

impl<S: Fn() -> Vec<Proc>> ScanCache<S> {
    fn new(scan: S, max_age: Duration) -> Self {
        Self { scan, max_age, last: Mutex::new(None) }
    }

    fn with<R>(&self, now: Instant, read: impl FnOnce(&[Proc]) -> R) -> R {
        let mut last = self.last.lock().unwrap_or_else(|e| e.into_inner());
        let fresh = matches!(&*last, Some((at, _)) if now.saturating_duration_since(*at) < self.max_age);
        if !fresh {
            *last = Some((now, (self.scan)()));
        }
        read(last.as_ref().map(|(_, procs)| procs.as_slice()).unwrap_or_default())
    }
}

fn scan_system() -> Vec<Proc> {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};
    let mut sys = System::new();
    let refresh = ProcessRefreshKind::nothing();
    #[cfg(target_os = "linux")]
    let refresh = refresh.with_cmd(sysinfo::UpdateKind::OnlyIfNotSet);
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, refresh);
    sys.processes()
        .iter()
        .filter(|(_, p)| p.thread_kind().is_none())
        .map(|(pid, p)| Proc {
            pid: pid.as_u32(),
            name: p.name().to_owned(),
            start: p.start_time(),
            argv0: p.cmd().first().cloned(),
        })
        .collect()
}

type SystemCache = ScanCache<fn() -> Vec<Proc>>;

fn shared() -> &'static SystemCache {
    static CACHE: OnceLock<SystemCache> = OnceLock::new();
    CACHE.get_or_init(|| ScanCache::new(scan_system as fn() -> Vec<Proc>, MAX_AGE))
}

fn running(procs: &[Proc]) -> bool {
    procs.iter().any(|p| p.matches(is_process))
}

fn earliest_start(procs: &[Proc]) -> Option<u64> {
    procs.iter().filter(|p| p.matches(is_process)).map(|p| p.start).min()
}

fn first_pid(procs: &[Proc], matches: fn(&OsStr) -> bool) -> u32 {
    procs.iter().find(|p| p.matches(matches)).map(|p| p.pid).unwrap_or(0)
}

/// Whether Deadlock is running. Reads a process scan shared app-wide and at most [`MAX_AGE`] old.
pub fn is_running() -> bool {
    shared().with(Instant::now(), running)
}

/// Unix seconds at which the oldest running Deadlock process started, or `None` when the game is not running.
pub fn start_time() -> Option<u64> {
    shared().with(Instant::now(), earliest_start)
}

/// Pid of the first process whose name (or argv[0] basename on Linux) satisfies `matches`, or 0.
/// Shares the same bounded-age scan.
pub fn find_pid(matches: fn(&OsStr) -> bool) -> u32 {
    shared().with(Instant::now(), |procs| first_pid(procs, matches))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn proc(pid: u32, name: &str, start: u64) -> Proc {
        Proc { pid, name: name.into(), start, argv0: None }
    }

    fn proton_proc(pid: u32, name: &str, start: u64, argv0: &str) -> Proc {
        Proc { argv0: Some(argv0.into()), ..proc(pid, name, start) }
    }

    #[test]
    fn renamed_proton_game_is_detected_by_running_pid_and_start_time() {
        for path in [
            r"S:\steamapps\common\Deadlock\game\bin\win64\deadlock.exe",
            "/home/player/Steam Library/steamapps/common/Deadlock/game/bin/win64/Deadlock.EXE",
        ] {
            let procs = [proc(1, "steam", 5), proton_proc(7, "MainThrd", 300, path), proc(8, "deadlock.exe", 400)];
            assert!(running(&procs[..2]), "{path}");
            assert_eq!(first_pid(&procs, is_process), 7, "{path}");
            assert_eq!(earliest_start(&procs), Some(300), "{path}");
        }
    }

    #[test]
    fn renamed_processes_without_the_game_executable_are_not_detected() {
        for path in ["python3", "wine64", "", "/games/deadlock.exe.bak", "/games/deadlock.exe/"] {
            let procs = [proton_proc(7, "MainThrd", 300, path)];
            assert!(!running(&procs), "{path}");
            assert_eq!(first_pid(&procs, is_process), 0, "{path}");
            assert_eq!(earliest_start(&procs), None, "{path}");
        }
        assert!(!running(&[proc(7, "MainThrd", 300)]));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn proton_paths_with_non_utf8_directories_are_detected() {
        use std::os::unix::ffi::OsStringExt;
        let game = Proc {
            argv0: Some(OsString::from_vec(b"/home/\xff/Steam Library/game/bin/win64/deadlock.exe".to_vec())),
            ..proc(7, "MainThrd", 300)
        };
        assert!(running(&[game]));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn scan_system_ignores_a_launcher_with_deadlock_in_a_later_argument() {
        let mut child = std::process::Command::new("/bin/sh")
            .args(["-c", "read -r line", "/games/deadlock.exe"])
            .stdin(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        let pid = child.id();
        let procs = scan_system();
        child.kill().unwrap();
        child.wait().unwrap();
        let launcher: Vec<_> = procs.into_iter().filter(|p| p.pid == pid).collect();
        assert_eq!(launcher.len(), 1);
        assert!(!running(&launcher));
        assert_eq!(first_pid(&launcher, is_process), 0);
        assert_eq!(earliest_start(&launcher), None);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn scan_system_recognizes_a_game_argv_zero_with_a_different_process_name() {
        use std::os::unix::process::CommandExt;
        let mut child = std::process::Command::new("sleep")
            .arg0(r"S:\Steam Library\Deadlock\game\bin\win64\deadlock.exe")
            .arg("30")
            .spawn()
            .unwrap();
        let pid = child.id();
        let procs = scan_system();
        child.kill().unwrap();
        child.wait().unwrap();
        let game: Vec<_> = procs.into_iter().filter(|p| p.pid == pid).collect();
        assert_eq!(game.len(), 1);
        assert_ne!(game[0].name, OsStr::new(PROCESS_NAME));
        assert!(running(&game));
        assert_eq!(first_pid(&game, is_process), pid);
        assert_eq!(earliest_start(&game), Some(game[0].start));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn scan_system_excludes_secondary_threads() {
        let (stop, stopped) = std::sync::mpsc::channel::<()>();
        let worker = std::thread::spawn(move || {
            let _ = stopped.recv();
        });
        let tasks: Vec<u32> = std::fs::read_dir("/proc/self/task")
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().parse().unwrap())
            .filter(|pid| *pid != std::process::id())
            .collect();
        let procs = scan_system();
        drop(stop);
        worker.join().unwrap();
        assert!(!tasks.is_empty());
        assert!(procs.iter().all(|p| !tasks.contains(&p.pid)));
    }

    #[test]
    fn running_finds_the_game_among_names() {
        assert!(running(&[proc(1, "explorer.exe", 5), proc(2, "Deadlock.exe", 9)]));
        assert!(!running(&[proc(1, "explorer.exe", 5), proc(2, "deadlock-plus.exe", 9)]));
        assert!(!running(&[]));
    }

    #[test]
    fn earliest_start_among_matching_processes_wins() {
        let procs = [proc(1, "explorer.exe", 5), proc(2, "deadlock.exe", 300), proc(3, "Deadlock.exe", 200)];
        assert_eq!(earliest_start(&procs), Some(200));
        assert_eq!(earliest_start(&procs[..1]), None);
    }

    #[test]
    fn first_pid_is_zero_without_a_match() {
        let procs = [proc(7, "deadlock.exe", 1)];
        assert_eq!(first_pid(&procs, is_process), 7);
        assert_eq!(first_pid(&procs[..0], is_process), 0);
    }

    fn counting(calls: &std::sync::Arc<std::sync::atomic::AtomicUsize>, pid: u32) -> ScanCache<impl Fn() -> Vec<Proc>> {
        let calls = calls.clone();
        ScanCache::new(
            move || {
                calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                vec![proc(pid, "deadlock.exe", 10)]
            },
            Duration::from_secs(2),
        )
    }

    #[test]
    fn first_read_scans_and_fresh_reads_reuse_it() {
        let calls = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let cache = counting(&calls, 4);
        let t0 = Instant::now();
        assert!(cache.with(t0, running));
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
        assert_eq!(cache.with(t0 + Duration::from_millis(1900), |p| first_pid(p, is_process)), 4);
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    #[test]
    fn stale_reads_rescan() {
        let calls = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let cache = counting(&calls, 4);
        let t0 = Instant::now();
        cache.with(t0, running);
        cache.with(t0 + Duration::from_secs(2), running);
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 2);
    }

    #[test]
    fn matches_the_game_exe_in_any_case_only() {
        assert!(is_process(OsStr::new("deadlock.exe")));
        assert!(is_process(OsStr::new("Deadlock.EXE")));
        assert!(!is_process(OsStr::new("deadlock")));
        assert!(!is_process(OsStr::new("deadlock-plus.exe")));
    }
}
