use std::io;
use std::time::{Duration, Instant};

use windows::core::PCWSTR;
use windows::Win32::Foundation::ERROR_SERVICE_ALREADY_RUNNING;
use windows::Win32::System::Services::{
    CloseServiceHandle, OpenSCManagerW, OpenServiceW, StartServiceW, SC_HANDLE, SC_MANAGER_CONNECT,
    SERVICE_QUERY_STATUS, SERVICE_START,
};

use crate::{access, pipe, scm};

const POLL_PAUSE: Duration = Duration::from_millis(50);

struct ScHandle(SC_HANDLE);

impl Drop for ScHandle {
    fn drop(&mut self) {
        // SAFETY: the handle came from a successful SCM open call and is closed only here.
        let _ = unsafe { CloseServiceHandle(self.0) };
    }
}

fn open_service(service: &str) -> io::Result<ScHandle> {
    if service.contains('\0') {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "service name contains a NUL"));
    }
    let name: Vec<u16> = service.encode_utf16().chain(Some(0)).collect();
    // SAFETY: null machine and database names select the local active database.
    let manager = unsafe { OpenSCManagerW(PCWSTR::null(), PCWSTR::null(), SC_MANAGER_CONNECT) }
        .map(ScHandle)
        .map_err(|e| io::Error::from_raw_os_error(win32_code(&e)))?;
    // SAFETY: `manager` is open and `name` is NUL-terminated; both outlive the call.
    unsafe { OpenServiceW(manager.0, PCWSTR(name.as_ptr()), SERVICE_START | SERVICE_QUERY_STATUS) }
        .map(ScHandle)
        .map_err(|e| io::Error::from_raw_os_error(win32_code(&e)))
}

/// `windows::core::Error` keeps an HRESULT; `io::Error` needs the plain Win32 code for `kind()` to work.
fn win32_code(e: &windows::core::Error) -> i32 {
    let code = e.code().0 as u32;
    if code & 0xFFFF_0000 == 0x8007_0000 {
        (code & 0xFFFF) as i32
    } else {
        code as i32
    }
}

/// True when this user may start the service. The service DACL grants start and query only to approved accounts, and
/// nothing stronger is requested.
pub fn approved(service: &str) -> bool {
    open_service(service).is_ok()
}

/// Starts the service if needed, waits for its process, connects to its pipe and checks who serves it.
pub fn connect(service: &str, pipe_name: &str, timeout: Duration) -> io::Result<pipe::Pipe> {
    let deadline = Instant::now() + timeout;
    let handle = open_service(service)?;
    // SAFETY: `handle` is open with SERVICE_START and no arguments are passed.
    match unsafe { StartServiceW(handle.0, None) } {
        Ok(()) => {}
        Err(e) if e.code() == ERROR_SERVICE_ALREADY_RUNNING.to_hresult() => {}
        Err(e) => return Err(io::Error::from_raw_os_error(win32_code(&e))),
    }
    drop(handle);
    let pid = loop {
        if let Some(pid) = scm::query_pid(service) {
            break pid;
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(io::Error::new(io::ErrorKind::TimedOut, "the Deadlock+ service did not start"));
        }
        std::thread::sleep(POLL_PAUSE.min(remaining));
    };
    let pipe = pipe::connect(pipe_name, deadline.saturating_duration_since(Instant::now()))?;
    verify_server(&pipe, pid)?;
    Ok(pipe)
}

/// Stops a process that squats the pipe name from receiving requests.
pub fn verify_server(pipe: &pipe::Pipe, expected_pid: u32) -> io::Result<()> {
    if access::server_is_expected(pipe::server_pid(pipe)?, expected_pid) {
        Ok(())
    } else {
        Err(io::Error::new(io::ErrorKind::PermissionDenied, "the pipe is not served by the Deadlock+ service"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    const TEST_SERVICE: &str = "DeadlockPlusServiceClientTestNeverInstalled";
    const LONG: Duration = Duration::from_secs(5);

    fn unique_name() -> String {
        static NEXT: AtomicU32 = AtomicU32::new(0);
        format!(r"\\.\pipe\dp-helper-sc-test-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed))
    }

    fn connected_client() -> (pipe::Pipe, pipe::Pipe) {
        let name = unique_name();
        let server = pipe::create(&name, &access::pipe_sddl(&["S-1-5-11"]).unwrap(), true).unwrap();
        let client = std::thread::scope(|s| {
            let client = s.spawn(|| pipe::connect(&name, LONG));
            pipe::accept(&server, LONG).unwrap();
            client.join().unwrap().unwrap()
        });
        (server, client)
    }

    #[test]
    fn missing_service_is_not_approved() {
        assert_ne!(TEST_SERVICE, crate::args::SERVICE_NAME);
        assert!(!approved(TEST_SERVICE));
    }

    #[test]
    fn connect_to_missing_service_fails_fast() {
        let start = Instant::now();
        let error = connect(TEST_SERVICE, &unique_name(), Duration::from_secs(10)).unwrap_err();
        assert!(start.elapsed() < Duration::from_secs(2), "waited {:?}", start.elapsed());
        assert_ne!(error.kind(), io::ErrorKind::TimedOut, "{error:?}");
    }

    #[test]
    fn a_service_without_start_rights_is_not_approved() {
        // Any user may query RpcSs but nobody unprivileged may start it.
        if dp_elevation::is_elevated() {
            return;
        }
        assert!(!approved("RpcSs"));
    }

    #[test]
    fn names_with_nul_are_refused() {
        assert!(!approved("a\0b"));
    }

    #[test]
    fn verify_accepts_the_own_pid() {
        let (_server, client) = connected_client();
        verify_server(&client, std::process::id()).unwrap();
    }

    #[test]
    fn verify_rejects_another_pid() {
        let (_server, client) = connected_client();
        let error = verify_server(&client, std::process::id() + 4).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
    }

    #[test]
    fn verify_rejects_pid_zero() {
        let (_server, client) = connected_client();
        let error = verify_server(&client, 0).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
    }
}
