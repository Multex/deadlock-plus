use std::ffi::{OsStr, OsString};
use std::path::Path;
use std::time::Duration;

/// The Windows updater ends the old version without a clean exit and starts the new one seconds later, while the
/// old version's WebView2 processes can still be shutting down on the same data folder. Creating the new main
/// window against them can stall with no timeout, so the first launch after an update waits for them, up to this.
pub const SETTLE_LIMIT: Duration = Duration::from_secs(10);
const SETTLE_POLL: Duration = Duration::from_millis(100);
const WEBVIEW_PROCESS: &str = "msedgewebview2.exe";
const USER_DATA_ARG: &str = "--user-data-dir=";
/// WebView2 keeps its profile in this folder under the data directory the app hands it.
const WEBVIEW_PROFILE_DIR: &str = "EBWebView";

pub trait WebviewProcesses {
    /// How many WebView2 processes run on `data_dir`. Other apps' WebView2 processes never count.
    fn using(&mut self, data_dir: &Path) -> usize;
}

#[derive(Debug, PartialEq, Eq)]
pub struct Settled {
    pub found: usize,
    pub left: usize,
    pub waited: Duration,
}

/// Waits for leftover WebView2 processes on `data_dir`, only on the first launch after an update. Never kills them.
pub fn settle<P: WebviewProcesses>(
    updated_from: Option<&str>,
    data_dir: &Path,
    processes: impl FnOnce() -> P,
    mut sleep: impl FnMut(Duration),
) -> Option<Settled> {
    updated_from?;
    let mut processes = processes();
    let found = processes.using(data_dir);
    let (mut left, mut waited) = (found, Duration::ZERO);
    while left > 0 && waited < SETTLE_LIMIT {
        sleep(SETTLE_POLL);
        waited += SETTLE_POLL;
        left = processes.using(data_dir);
    }
    Some(Settled { found, left, waited })
}

fn normalised(path: &str) -> String {
    path.trim_matches('"').replace('/', "\\").trim_end_matches('\\').to_lowercase()
}

/// True for a WebView2 process whose profile is the one WebView2 keeps under `data_dir`.
pub fn uses_data_dir(name: &OsStr, cmd: &[OsString], data_dir: &Path) -> bool {
    if !name.eq_ignore_ascii_case(WEBVIEW_PROCESS) {
        return false;
    }
    let ours = normalised(&data_dir.to_string_lossy());
    let profile = normalised(&data_dir.join(WEBVIEW_PROFILE_DIR).to_string_lossy());
    cmd.iter()
        .filter_map(|arg| arg.to_str()?.strip_prefix(USER_DATA_ARG))
        .map(normalised)
        .any(|dir| dir == ours || dir == profile)
}

pub struct SystemWebviews(sysinfo::System);

impl SystemWebviews {
    pub fn new() -> Self {
        Self(sysinfo::System::new())
    }
}

impl WebviewProcesses for SystemWebviews {
    fn using(&mut self, data_dir: &Path) -> usize {
        use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, UpdateKind};
        let refresh = ProcessRefreshKind::nothing().with_cmd(UpdateKind::Always);
        self.0.refresh_processes_specifics(ProcessesToUpdate::All, true, refresh);
        self.0.processes().values().filter(|p| uses_data_dir(p.name(), p.cmd(), data_dir)).count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    const DATA_DIR: &str = r"C:\Users\Player\AppData\Local\app.deadlockplus";

    fn cmd(args: &[&str]) -> Vec<OsString> {
        args.iter().map(OsString::from).collect()
    }

    fn ours(user_data_dir: &str) -> Vec<OsString> {
        cmd(&[
            r"C:\Program Files (x86)\Microsoft\EdgeWebView\Application\130.0\msedgewebview2.exe",
            "--type=renderer",
            &format!("--user-data-dir={user_data_dir}"),
        ])
    }

    #[test]
    fn our_webview2_processes_match_in_any_spelling_of_the_path() {
        let dir = Path::new(DATA_DIR);
        let name = OsStr::new("msedgewebview2.exe");
        assert!(uses_data_dir(name, &ours(&format!("{DATA_DIR}\\EBWebView")), dir));
        assert!(uses_data_dir(name, &ours(&format!("\"{DATA_DIR}\\EBWebView\"")), dir));
        assert!(uses_data_dir(name, &ours(&format!("{}/ebwebview/", DATA_DIR.to_uppercase())), dir));
        assert!(uses_data_dir(OsStr::new("MSEdgeWebView2.exe"), &ours(DATA_DIR), dir));
    }

    #[test]
    fn other_apps_webview2_processes_never_match() {
        let dir = Path::new(DATA_DIR);
        let name = OsStr::new("msedgewebview2.exe");
        assert!(!uses_data_dir(name, &ours(r"C:\Users\Player\AppData\Local\com.other.app\EBWebView"), dir));
        assert!(!uses_data_dir(name, &ours(&format!("{DATA_DIR}-beta\\EBWebView")), dir));
        assert!(!uses_data_dir(name, &ours(&format!("{DATA_DIR}\\EBWebView\\Default")), dir));
        assert!(!uses_data_dir(name, &cmd(&["msedgewebview2.exe", "--type=renderer"]), dir));
    }

    #[test]
    fn only_webview2_itself_counts() {
        let dir = Path::new(DATA_DIR);
        assert!(!uses_data_dir(OsStr::new("deadlock-plus.exe"), &ours(&format!("{DATA_DIR}\\EBWebView")), dir));
    }

    /// Answers each query with the next count; the last one repeats.
    struct Counts(Vec<usize>, usize);

    impl WebviewProcesses for Counts {
        fn using(&mut self, _: &Path) -> usize {
            self.1 += 1;
            self.0[(self.1 - 1).min(self.0.len() - 1)]
        }
    }

    fn run(updated_from: Option<&str>, counts: Vec<usize>) -> (Option<Settled>, Duration) {
        let mut slept = Duration::ZERO;
        let settled =
            settle(updated_from, &PathBuf::from(DATA_DIR), move || Counts(counts, 0), |d: Duration| slept += d);
        (settled, slept)
    }

    #[test]
    fn a_launch_that_is_not_after_an_update_queries_nothing() {
        let settled = settle(
            None,
            Path::new(DATA_DIR),
            || -> Counts { panic!("processes were queried on an ordinary launch") },
            |_| panic!("an ordinary launch slept"),
        );
        assert_eq!(settled, None);
    }

    #[test]
    fn no_leftovers_means_no_wait() {
        let (settled, slept) = run(Some("0.13.2"), vec![0]);
        assert_eq!(settled, Some(Settled { found: 0, left: 0, waited: Duration::ZERO }));
        assert_eq!(slept, Duration::ZERO);
    }

    #[test]
    fn leftovers_that_exit_are_waited_for_until_gone() {
        let (settled, slept) = run(Some("0.13.2"), vec![4, 3, 1, 0]);
        assert_eq!(settled, Some(Settled { found: 4, left: 0, waited: SETTLE_POLL * 3 }));
        assert_eq!(slept, SETTLE_POLL * 3);
    }

    #[test]
    fn leftovers_that_never_exit_stop_the_wait_at_the_limit() {
        let (settled, slept) = run(Some("0.13.2"), vec![2]);
        assert_eq!(settled, Some(Settled { found: 2, left: 2, waited: SETTLE_LIMIT }));
        assert_eq!(slept, SETTLE_LIMIT);
    }
}
