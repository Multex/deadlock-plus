use std::io;
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};

use windows::core::PWSTR;
use windows::Win32::Foundation::{LocalFree, HANDLE, HLOCAL, STILL_ACTIVE};
use windows::Win32::Security::Authorization::ConvertSidToStringSidW;
use windows::Win32::Security::{GetTokenInformation, RevertToSelf, TokenUser, TOKEN_QUERY, TOKEN_USER};
use windows::Win32::System::Pipes::ImpersonateNamedPipeClient;
use windows::Win32::System::Threading::{
    GetCurrentProcess, GetCurrentThread, GetExitCodeProcess, OpenProcess, OpenProcessToken, OpenThreadToken,
    PROCESS_QUERY_LIMITED_INFORMATION,
};

use crate::access::is_valid_sid;
use crate::pipe::{os_error, Pipe};

fn owned(handle: HANDLE) -> OwnedHandle {
    // SAFETY: every caller passes a fresh valid handle that nothing else owns.
    unsafe { OwnedHandle::from_raw_handle(handle.0) }
}

fn token_user_sid(token: &OwnedHandle) -> io::Result<String> {
    let token = HANDLE(token.as_raw_handle());
    let mut needed = 0;
    // SAFETY: a size query with no buffer; it fails with ERROR_INSUFFICIENT_BUFFER and fills `needed`.
    let _ = unsafe { GetTokenInformation(token, TokenUser, None, 0, &mut needed) };
    if (needed as usize) < std::mem::size_of::<TOKEN_USER>() {
        return Err(io::Error::last_os_error());
    }
    // `u64` elements keep the buffer aligned for `TOKEN_USER` and the SID it points into.
    let mut buffer = vec![0u64; (needed as usize).div_ceil(8)];
    // SAFETY: `buffer` holds at least `needed` bytes and outlives the call.
    unsafe { GetTokenInformation(token, TokenUser, Some(buffer.as_mut_ptr().cast()), needed, &mut needed) }
        .map_err(os_error)?;
    // SAFETY: the call succeeded, so the buffer starts with an aligned `TOKEN_USER` whose SID points into `buffer`.
    let sid = unsafe { (*buffer.as_ptr().cast::<TOKEN_USER>()).User.Sid };
    let mut text = PWSTR::null();
    // SAFETY: `sid` is valid while `buffer` lives; on success `text` is a LocalAlloc'd string freed below.
    unsafe { ConvertSidToStringSidW(sid, &mut text) }.map_err(os_error)?;
    // SAFETY: `text` is the NUL-terminated string the conversion returned.
    let result = unsafe { text.to_string() };
    // SAFETY: `text` came from the successful conversion above and nothing else holds it.
    unsafe { LocalFree(HLOCAL(text.0.cast())) };
    let sid = result.map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "SID string is not UTF-16"))?;
    if !is_valid_sid(&sid) {
        return Err(io::Error::new(io::ErrorKind::InvalidData, format!("unexpected SID string {sid:?}")));
    }
    Ok(sid)
}

pub fn current_user_sid() -> io::Result<String> {
    let mut token = HANDLE::default();
    // SAFETY: the process pseudo handle needs no closing; `token` is a valid out-pointer.
    unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) }.map_err(os_error)?;
    token_user_sid(&owned(token))
}

pub fn process_user_sid(pid: u32) -> io::Result<String> {
    // SAFETY: opening a process by id has no preconditions; the handle is owned right away.
    let process = owned(unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.map_err(os_error)?);
    // An exited process stays openable while any handle to it is open; its pid may already belong to another one.
    let mut exit_code = 0;
    // SAFETY: `process` is open with query rights; `exit_code` is a valid out-pointer.
    unsafe { GetExitCodeProcess(HANDLE(process.as_raw_handle()), &mut exit_code) }.map_err(os_error)?;
    if exit_code != STILL_ACTIVE.0 as u32 {
        return Err(io::Error::new(io::ErrorKind::NotFound, format!("process {pid} has exited")));
    }
    let mut token = HANDLE::default();
    // SAFETY: `process` is open with query rights; `token` is a valid out-pointer.
    unsafe { OpenProcessToken(HANDLE(process.as_raw_handle()), TOKEN_QUERY, &mut token) }.map_err(os_error)?;
    token_user_sid(&owned(token))
}

/// The client connects at identification level, which is enough to read its token's user. `OpenAsSelf` opens the
/// token with this process's own rights, since an identification token cannot be used to open objects.
pub fn pipe_client_sid(pipe: &Pipe) -> io::Result<String> {
    // SAFETY: `pipe` is an open server end; on success this thread impersonates the client until reverted below.
    unsafe { ImpersonateNamedPipeClient(HANDLE(pipe.as_raw_handle())) }.map_err(os_error)?;
    let mut token = HANDLE::default();
    // SAFETY: the thread pseudo handle needs no closing; `token` is a valid out-pointer.
    let opened = unsafe { OpenThreadToken(GetCurrentThread(), TOKEN_QUERY, true, &mut token) };
    // SAFETY: ends the impersonation started above.
    if unsafe { RevertToSelf() }.is_err() {
        // This thread would go on running with the client's identity.
        std::process::abort();
    }
    opened.map_err(os_error)?;
    token_user_sid(&owned(token))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::access::pipe_sddl;
    use crate::pipe;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::time::Duration;

    const AUTHENTICATED_USERS: &str = "S-1-5-11";
    const LONG: Duration = Duration::from_secs(5);

    fn unique_name(tag: &str) -> String {
        static NEXT: AtomicU32 = AtomicU32::new(0);
        format!(r"\\.\pipe\dp-helper-sid-test-{}-{tag}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed))
    }

    #[test]
    fn current_user_sid_is_a_valid_user_sid() {
        let sid = current_user_sid().unwrap();
        assert!(is_valid_sid(&sid), "{sid:?}");
    }

    #[test]
    fn own_process_has_the_current_user_sid() {
        let sid = process_user_sid(std::process::id()).unwrap();
        assert!(is_valid_sid(&sid), "{sid:?}");
        assert_eq!(sid, current_user_sid().unwrap());
    }

    #[test]
    fn pid_zero_is_an_error() {
        assert!(process_user_sid(0).is_err());
    }

    #[test]
    fn a_dead_pid_is_an_error() {
        let mut child = std::process::Command::new("cmd.exe").args(["/c", "exit 0"]).spawn().unwrap();
        let pid = child.id();
        child.wait().unwrap();
        drop(child);
        assert!(process_user_sid(pid).is_err());
    }

    #[test]
    fn a_pid_that_never_existed_is_an_error() {
        assert!(process_user_sid(u32::MAX - 3).is_err());
    }

    #[test]
    fn pipe_client_is_this_user() {
        let name = unique_name("client");
        let server = pipe::create(&name, &pipe_sddl(&[AUTHENTICATED_USERS]).unwrap(), true).unwrap();
        let _client = std::thread::scope(|s| {
            let client = s.spawn(|| pipe::connect(&name, LONG));
            pipe::accept(&server, LONG).unwrap();
            client.join().unwrap().unwrap()
        });
        let sid = pipe_client_sid(&server).unwrap();
        assert!(is_valid_sid(&sid), "{sid:?}");
        assert_eq!(sid, current_user_sid().unwrap());
    }

    #[test]
    fn pipe_client_sid_leaves_the_thread_as_itself() {
        let name = unique_name("revert");
        let server = pipe::create(&name, &pipe_sddl(&[AUTHENTICATED_USERS]).unwrap(), true).unwrap();
        let _client = pipe::connect(&name, LONG).unwrap();
        pipe::accept(&server, LONG).unwrap();
        pipe_client_sid(&server).unwrap();
        assert!(thread_token_absent());
    }

    fn thread_token_absent() -> bool {
        use windows::Win32::Foundation::{CloseHandle, ERROR_NO_TOKEN, HANDLE};
        use windows::Win32::Security::TOKEN_QUERY;
        use windows::Win32::System::Threading::{GetCurrentThread, OpenThreadToken};
        let mut token = HANDLE::default();
        // SAFETY: the pseudo handle needs no closing; `token` is a valid out-pointer, closed below on success.
        match unsafe { OpenThreadToken(GetCurrentThread(), TOKEN_QUERY, true, &mut token) } {
            Ok(()) => {
                // SAFETY: `token` was just opened by this function.
                let _ = unsafe { CloseHandle(token) };
                false
            }
            Err(e) => e.code() == ERROR_NO_TOKEN.to_hresult(),
        }
    }

    #[test]
    fn an_unconnected_pipe_is_an_error() {
        let server = pipe::create(&unique_name("idle"), &pipe_sddl(&[AUTHENTICATED_USERS]).unwrap(), true).unwrap();
        assert!(pipe_client_sid(&server).is_err());
        assert!(thread_token_absent());
    }
}
