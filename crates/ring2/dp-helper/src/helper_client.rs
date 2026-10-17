use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::io;
use std::os::windows::io::{AsHandle, AsRawHandle, BorrowedHandle};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use dp_privilege::Outcome;
use windows::Win32::Foundation::{HANDLE, WAIT_OBJECT_0};
use windows::Win32::System::Threading::{GetProcessId, WaitForSingleObject};

use crate::pipe::{self, Pipe};
use crate::{access, args, runas};

/// How often a pending accept stops to check whether the helper process is still running.
const EXIT_CHECK: Duration = Duration::from_millis(50);

/// 128 unpredictable bits without a new dependency: every `RandomState` is keyed from the OS random source.
fn nonce() -> u128 {
    static CALLS: AtomicU64 = AtomicU64::new(0);
    let call = CALLS.fetch_add(1, Ordering::Relaxed);
    let half = || {
        let mut hasher = RandomState::new().build_hasher();
        hasher.write_u64(call);
        hasher.finish()
    };
    (u128::from(half()) << 64) | u128::from(half())
}

fn failed(what: &str, error: io::Error) -> Outcome {
    Outcome::Failed(format!("{what}: {error}"))
}

/// Starts the elevated helper (one UAC prompt) and returns the server end of its private pipe once the helper
/// itself has connected. The pipe admits only administrators, because the elevated helper is the client.
pub fn launch(exe: &Path, timeout: Duration) -> Result<Pipe, Outcome> {
    let app_pid = std::process::id();
    let name = args::helper_pipe_name(app_pid, nonce());
    let sddl = access::pipe_sddl(&[])
        .ok_or_else(|| Outcome::Failed("Could not build the helper pipe's access list.".into()))?;
    let pipe = pipe::create(&name, &sddl, true).map_err(|e| failed("Could not create the helper pipe", e))?;
    let process = runas::launch(exe, &args::helper_params(&name, app_pid))?;
    // SAFETY: `process` is a live process handle owned by this function.
    let helper_pid = unsafe { GetProcessId(HANDLE(process.as_raw_handle())) };
    if helper_pid == 0 {
        return Err(failed("Could not read the helper's process id", io::Error::last_os_error()));
    }
    accept_from(pipe, helper_pid, process.as_handle(), timeout)
}

/// Waits for a client until `timeout` passes or `process` exits, then keeps the pipe only when the client is
/// `expected_pid`. Any other process that reached the pipe first is refused with the pipe.
pub fn accept_from(
    pipe: Pipe,
    expected_pid: u32,
    process: BorrowedHandle<'_>,
    timeout: Duration,
) -> Result<Pipe, Outcome> {
    let deadline = Instant::now() + timeout;
    loop {
        let slice = deadline.saturating_duration_since(Instant::now()).min(EXIT_CHECK);
        match pipe::accept(&pipe, slice) {
            Ok(()) => break,
            Err(e) if e.kind() == io::ErrorKind::TimedOut => {}
            Err(e) => return Err(failed("The helper could not connect", e)),
        }
        if has_exited(process) {
            return Err(Outcome::Failed("The helper exited before it connected.".into()));
        }
        if Instant::now() >= deadline {
            return Err(Outcome::Failed("The helper did not connect in time.".into()));
        }
    }
    let client = pipe::client_pid(&pipe).map_err(|e| failed("Could not check who connected to the helper pipe", e))?;
    if client == 0 || client != expected_pid {
        return Err(Outcome::Failed("Another process connected to the helper pipe.".into()));
    }
    Ok(pipe)
}

fn has_exited(process: BorrowedHandle<'_>) -> bool {
    // SAFETY: `process` is a live process handle borrowed for this call; a zero timeout only polls it.
    unsafe { WaitForSingleObject(HANDLE(process.as_raw_handle()), 0) == WAIT_OBJECT_0 }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    use std::os::windows::io::AsHandle;
    use std::process::{Command, Stdio};
    use std::sync::atomic::AtomicU32;
    use windows::Win32::System::Threading::GetCurrentProcess;

    const LONG: Duration = Duration::from_secs(10);

    fn unique_name(tag: &str) -> String {
        static NEXT: AtomicU32 = AtomicU32::new(0);
        format!(r"\\.\pipe\dp-helper-client-test-{}-{tag}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed))
    }

    fn own_process() -> BorrowedHandle<'static> {
        // SAFETY: `GetCurrentProcess` returns the pseudo handle -1, which `BorrowedHandle` documents as the current
        // process and which never needs closing.
        unsafe { BorrowedHandle::borrow_raw(GetCurrentProcess().0) }
    }

    /// A pipe this unelevated test user may open, with a client from this process connecting in the background.
    fn pipe_with_client(tag: &str) -> (Pipe, std::thread::JoinHandle<io::Result<Pipe>>) {
        let name = unique_name(tag);
        let user = crate::sid::current_user_sid().unwrap();
        let server = pipe::create(&name, &access::pipe_sddl(&[&user]).unwrap(), true).unwrap();
        let client = std::thread::spawn(move || pipe::connect(&name, LONG));
        (server, client)
    }

    #[test]
    fn the_expected_client_is_accepted() {
        let (server, client) = pipe_with_client("own-pid");
        let accepted = accept_from(server, std::process::id(), own_process(), LONG);
        let _client = client.join().unwrap().unwrap();
        let accepted = accepted.unwrap();
        assert_eq!(pipe::client_pid(&accepted).unwrap(), std::process::id());
    }

    #[test]
    fn a_client_from_another_process_is_refused() {
        let (server, client) = pipe_with_client("other-pid");
        let result = accept_from(server, std::process::id() + 1, own_process(), LONG);
        let _client = client.join().unwrap().unwrap();
        assert!(matches!(result, Err(Outcome::Failed(_))), "{result:?}");
    }

    #[test]
    fn pid_zero_never_matches() {
        let (server, client) = pipe_with_client("zero-pid");
        let result = accept_from(server, 0, own_process(), LONG);
        let _client = client.join().unwrap().unwrap();
        assert!(matches!(result, Err(Outcome::Failed(_))), "{result:?}");
    }

    #[test]
    fn accept_returns_early_when_the_helper_exits() {
        let name = unique_name("exited");
        let server = pipe::create(&name, &access::pipe_sddl(&[]).unwrap(), true).unwrap();
        let root = std::env::var_os("SystemRoot").expect("SystemRoot");
        let mut child = Command::new(Path::new(&root).join("System32").join("cmd.exe"))
            .args(["/c", "exit", "0"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let start = Instant::now();
        let result = accept_from(server, child.id(), child.as_handle(), Duration::from_secs(30));
        let elapsed = start.elapsed();
        let _ = child.wait();
        assert!(matches!(result, Err(Outcome::Failed(_))), "{result:?}");
        assert!(elapsed < Duration::from_secs(10), "waited {elapsed:?}");
    }

    #[test]
    fn accept_times_out_without_a_client() {
        let name = unique_name("timeout");
        let server = pipe::create(&name, &access::pipe_sddl(&[]).unwrap(), true).unwrap();
        let start = Instant::now();
        let result = accept_from(server, std::process::id(), own_process(), Duration::from_millis(200));
        assert!(matches!(result, Err(Outcome::Failed(_))), "{result:?}");
        assert!(start.elapsed() >= Duration::from_millis(200));
        assert!(start.elapsed() < Duration::from_secs(3));
    }

    #[test]
    fn nonces_differ_and_fill_both_halves() {
        let nonces: HashSet<u128> = (0..200).map(|_| nonce()).collect();
        assert_eq!(nonces.len(), 200);
        assert!(nonces.iter().any(|n| n >> 64 != 0));
        assert!(nonces.iter().any(|n| *n as u64 != 0));
    }

    #[test]
    fn the_pipe_name_is_one_the_helper_accepts() {
        let pid = std::process::id();
        let name = args::helper_pipe_name(pid, nonce());
        let argv: Vec<std::ffi::OsString> = std::iter::once("deadlock-plus.exe".to_string())
            .chain(args::helper_params(&name, pid).split(' ').map(str::to_string))
            .map(Into::into)
            .collect();
        assert!(matches!(args::parse(&argv), Some(Ok(args::Launch::Helper { .. }))), "{argv:?}");
    }
}
