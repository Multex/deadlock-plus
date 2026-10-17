use std::io::{self, Read, Write};
use std::os::windows::io::{AsHandle, AsRawHandle, BorrowedHandle, FromRawHandle, OwnedHandle, RawHandle};
use std::time::{Duration, Instant};

use windows::core::PCWSTR;
use windows::Win32::Foundation::{
    LocalFree, ERROR_BROKEN_PIPE, ERROR_FILE_NOT_FOUND, ERROR_IO_PENDING, ERROR_OPERATION_ABORTED, ERROR_PIPE_BUSY,
    ERROR_PIPE_CONNECTED, HANDLE, HLOCAL, WAIT_OBJECT_0,
};
use windows::Win32::Security::Authorization::{ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1};
use windows::Win32::Security::{PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES};
use windows::Win32::Storage::FileSystem::{
    CreateFileW, ReadFile, WriteFile, FILE_FLAGS_AND_ATTRIBUTES, FILE_FLAG_FIRST_PIPE_INSTANCE, FILE_FLAG_OVERLAPPED,
    FILE_SHARE_NONE, OPEN_EXISTING, PIPE_ACCESS_DUPLEX, SECURITY_IDENTIFICATION, SECURITY_SQOS_PRESENT,
};
use windows::Win32::System::Pipes::{
    ConnectNamedPipe, CreateNamedPipeW, GetNamedPipeClientProcessId, GetNamedPipeServerProcessId, WaitNamedPipeW,
    PIPE_READMODE_BYTE, PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE, PIPE_UNLIMITED_INSTANCES, PIPE_WAIT,
};
use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject};
use windows::Win32::System::IO::{CancelIoEx, GetOverlappedResult, OVERLAPPED};

const BUFFER_SIZE: u32 = 64 * 1024;

/// Exactly the rights `access::pipe_sddl` grants a client. Asking for `GENERIC_WRITE` would be denied, because it
/// includes `FILE_CREATE_PIPE_INSTANCE`.
const CLIENT_ACCESS: u32 = 0x0012_018b;

const RETRY_PAUSE: Duration = Duration::from_millis(20);

/// One end of a byte-mode pipe, opened for overlapped I/O. A synchronous handle serialises every operation on it,
/// so a read waiting for the peer would hold back writes from another thread; each read or write here waits on its
/// own event instead, and clones of one end can read and write at the same time.
#[derive(Debug)]
pub struct Pipe(OwnedHandle);

impl Pipe {
    fn raw(&self) -> HANDLE {
        HANDLE(self.0.as_raw_handle())
    }

    pub fn try_clone(&self) -> io::Result<Self> {
        self.0.try_clone().map(Self)
    }

    /// Runs one overlapped operation to completion. `start` must begin an operation on the given handle with the
    /// given `OVERLAPPED`, using buffers that outlive this call.
    fn complete(&self, start: impl FnOnce(HANDLE, *mut OVERLAPPED) -> windows::core::Result<()>) -> io::Result<u32> {
        let event = new_event()?;
        let mut overlapped = OVERLAPPED { hEvent: HANDLE(event.as_raw_handle()), ..Default::default() };
        match start(self.raw(), &mut overlapped) {
            Ok(()) => {}
            Err(e) if e.code() == ERROR_IO_PENDING.to_hresult() => {}
            Err(e) => return Err(os_error(e)),
        }
        let mut transferred = 0;
        // SAFETY: the operation was started on this handle with `overlapped`, which stays in place until this call
        // returns; waiting means the kernel is done with it and with the caller's buffer afterwards.
        unsafe { GetOverlappedResult(self.raw(), &overlapped, &mut transferred, true) }.map_err(os_error)?;
        Ok(transferred)
    }
}

fn clamp_len(len: usize) -> usize {
    len.min(u32::MAX as usize)
}

impl Read for &Pipe {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if buf.is_empty() {
            return Ok(0);
        }
        let len = clamp_len(buf.len());
        // SAFETY: `buf` is borrowed for the whole of `complete`, which waits until the read has finished.
        match self.complete(|h, ov| unsafe { ReadFile(h, Some(&mut buf[..len]), None, Some(ov)) }) {
            Ok(n) => Ok(n as usize),
            Err(e) if e.raw_os_error() == Some(ERROR_BROKEN_PIPE.0 as i32) => Ok(0),
            Err(e) => Err(e),
        }
    }
}

impl Write for &Pipe {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        if buf.is_empty() {
            return Ok(0);
        }
        let len = clamp_len(buf.len());
        // SAFETY: `buf` is borrowed for the whole of `complete`, which waits until the write has finished.
        self.complete(|h, ov| unsafe { WriteFile(h, Some(&buf[..len]), None, Some(ov)) }).map(|n| n as usize)
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

impl Read for Pipe {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        (&*self).read(buf)
    }
}

impl Write for Pipe {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        (&*self).write(buf)
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

impl AsHandle for Pipe {
    fn as_handle(&self) -> BorrowedHandle<'_> {
        self.0.as_handle()
    }
}

impl AsRawHandle for Pipe {
    fn as_raw_handle(&self) -> RawHandle {
        self.0.as_raw_handle()
    }
}

fn wide(s: &str) -> io::Result<Vec<u16>> {
    if s.contains('\0') {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "name contains a NUL"));
    }
    Ok(s.encode_utf16().chain(Some(0)).collect())
}

/// `windows::core::Error` keeps an HRESULT; `io::Error` needs the plain Win32 code for `kind()` to work.
pub(crate) fn os_error(e: windows::core::Error) -> io::Error {
    let code = e.code().0 as u32;
    if code & 0xFFFF_0000 == 0x8007_0000 {
        io::Error::from_raw_os_error((code & 0xFFFF) as i32)
    } else {
        io::Error::from_raw_os_error(code as i32)
    }
}

fn new_event() -> io::Result<OwnedHandle> {
    // SAFETY: no attributes and no name; a manual-reset event, as overlapped I/O requires.
    let event = unsafe { CreateEventW(None, true, false, PCWSTR::null()) }.map_err(os_error)?;
    // SAFETY: `CreateEventW` returned a fresh valid handle that nothing else owns.
    Ok(unsafe { OwnedHandle::from_raw_handle(event.0) })
}

fn millis(timeout: Duration) -> u32 {
    // `u32::MAX` is `INFINITE`.
    timeout.as_millis().min(u32::MAX as u128 - 1) as u32
}

pub fn create(name: &str, sddl: &str, first: bool) -> io::Result<Pipe> {
    let name = wide(name)?;
    let sddl = wide(sddl)?;
    let mut sd = PSECURITY_DESCRIPTOR::default();
    // SAFETY: `sddl` is a NUL-terminated UTF-16 string that outlives the call, and `sd` is a valid out-pointer. On
    // success `sd` points at a LocalAlloc'd descriptor that this function frees below.
    unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(PCWSTR(sddl.as_ptr()), SDDL_REVISION_1, &mut sd, None)
    }
    .map_err(os_error)?;
    let attributes = SECURITY_ATTRIBUTES {
        nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: sd.0,
        bInheritHandle: false.into(),
    };
    let mut open_mode = PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED;
    if first {
        open_mode |= FILE_FLAG_FIRST_PIPE_INSTANCE;
    }
    // SAFETY: `name` is NUL-terminated and outlives the call; `attributes` and the descriptor it points at stay
    // alive until the call returns, and the kernel copies the descriptor into the pipe.
    let pipe = unsafe {
        CreateNamedPipeW(
            PCWSTR(name.as_ptr()),
            open_mode,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
            PIPE_UNLIMITED_INSTANCES,
            BUFFER_SIZE,
            BUFFER_SIZE,
            0,
            Some(&attributes),
        )
    };
    let result = if pipe.is_invalid() { Err(io::Error::last_os_error()) } else { Ok(pipe) };
    // SAFETY: `sd` came from the successful conversion above, nothing else holds it, and the pipe no longer needs it.
    unsafe { LocalFree(HLOCAL(sd.0)) };
    // SAFETY: `CreateNamedPipeW` returned a fresh valid handle that nothing else owns.
    result.map(|pipe| Pipe(unsafe { OwnedHandle::from_raw_handle(pipe.0) }))
}

/// Waits up to `timeout` for a client on `pipe`. A client that connected before the call counts as connected.
pub fn accept(pipe: &Pipe, timeout: Duration) -> io::Result<()> {
    let event = new_event()?;
    let mut overlapped = OVERLAPPED { hEvent: HANDLE(event.as_raw_handle()), ..Default::default() };
    // SAFETY: `pipe` is an open overlapped server handle; `overlapped` stays in place until the operation is
    // finished below, whether it completes or is cancelled.
    match unsafe { ConnectNamedPipe(pipe.raw(), Some(&mut overlapped)) } {
        Ok(()) => return Ok(()),
        Err(e) if e.code() == ERROR_PIPE_CONNECTED.to_hresult() => return Ok(()),
        Err(e) if e.code() == ERROR_IO_PENDING.to_hresult() => {}
        Err(e) => return Err(os_error(e)),
    }
    // SAFETY: `event` is a valid event handle owned by this function.
    if unsafe { WaitForSingleObject(HANDLE(event.as_raw_handle()), millis(timeout)) } != WAIT_OBJECT_0 {
        // SAFETY: cancels only the operation that uses `overlapped`; a failure means it already finished.
        let _ = unsafe { CancelIoEx(pipe.raw(), Some(&overlapped)) };
    }
    let mut transferred = 0;
    // SAFETY: waits until the kernel has finished with `overlapped`, after a completion or a cancel.
    match unsafe { GetOverlappedResult(pipe.raw(), &overlapped, &mut transferred, true) } {
        Ok(()) => Ok(()),
        Err(e) if e.code() == ERROR_OPERATION_ABORTED.to_hresult() => {
            Err(io::Error::new(io::ErrorKind::TimedOut, "no client connected"))
        }
        Err(e) => Err(os_error(e)),
    }
}

fn open(name: &[u16]) -> io::Result<Pipe> {
    // SAFETY: `name` is NUL-terminated and outlives the call. Identification level stops a server that squats the
    // name from acting as this user.
    let pipe = unsafe {
        CreateFileW(
            PCWSTR(name.as_ptr()),
            CLIENT_ACCESS,
            FILE_SHARE_NONE,
            None,
            OPEN_EXISTING,
            FILE_FLAG_OVERLAPPED | FILE_FLAGS_AND_ATTRIBUTES(SECURITY_SQOS_PRESENT.0 | SECURITY_IDENTIFICATION.0),
            None,
        )
    }
    .map_err(os_error)?;
    // SAFETY: `CreateFileW` returned a fresh valid handle that nothing else owns.
    Ok(Pipe(unsafe { OwnedHandle::from_raw_handle(pipe.0) }))
}

/// Connects to `name`, waiting up to `timeout` while every instance is busy or the pipe does not exist yet (a
/// service that was just started has not created it).
pub fn connect(name: &str, timeout: Duration) -> io::Result<Pipe> {
    let name = wide(name)?;
    let deadline = Instant::now() + timeout;
    loop {
        let error = match open(&name) {
            Ok(pipe) => return Ok(pipe),
            Err(e) => e,
        };
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(io::Error::new(io::ErrorKind::TimedOut, error));
        }
        match error.raw_os_error() {
            Some(code) if code == ERROR_PIPE_BUSY.0 as i32 => {
                // SAFETY: `name` is NUL-terminated and outlives the call. The result only says whether to retry.
                let _ = unsafe { WaitNamedPipeW(PCWSTR(name.as_ptr()), millis(remaining).max(1)) };
            }
            Some(code) if code == ERROR_FILE_NOT_FOUND.0 as i32 => std::thread::sleep(RETRY_PAUSE.min(remaining)),
            _ => return Err(error),
        }
    }
}

pub fn server_pid(pipe: &Pipe) -> io::Result<u32> {
    let mut pid = 0;
    // SAFETY: `pipe` is an open pipe handle and `pid` a valid out-pointer.
    unsafe { GetNamedPipeServerProcessId(pipe.raw(), &mut pid) }.map_err(os_error)?;
    Ok(pid)
}

pub fn client_pid(pipe: &Pipe) -> io::Result<u32> {
    let mut pid = 0;
    // SAFETY: `pipe` is an open pipe handle and `pid` a valid out-pointer.
    unsafe { GetNamedPipeClientProcessId(pipe.raw(), &mut pid) }.map_err(os_error)?;
    Ok(pid)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::access::pipe_sddl;
    use std::io::{BufRead, BufReader};
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::mpsc;

    const AUTHENTICATED_USERS: &str = "S-1-5-11";
    const LONG: Duration = Duration::from_secs(5);

    fn unique_name(tag: &str) -> String {
        static NEXT: AtomicU32 = AtomicU32::new(0);
        format!(r"\\.\pipe\dp-helper-test-{}-{tag}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed))
    }

    fn user_sddl() -> String {
        pipe_sddl(&[AUTHENTICATED_USERS]).unwrap()
    }

    fn connected_pair(tag: &str) -> (Pipe, Pipe) {
        let name = unique_name(tag);
        let server = create(&name, &user_sddl(), true).unwrap();
        let client = std::thread::scope(|s| {
            let client = s.spawn(|| connect(&name, LONG));
            accept(&server, LONG).unwrap();
            client.join().unwrap().unwrap()
        });
        (server, client)
    }

    #[test]
    fn round_trip_between_threads() {
        let (server, client) = connected_pair("round-trip");
        let echo = std::thread::spawn(move || {
            let mut line = String::new();
            BufReader::new(&server).read_line(&mut line).unwrap();
            (&server).write_all(format!("echo {line}").as_bytes()).unwrap();
        });
        (&client).write_all(b"hello\n").unwrap();
        let mut line = String::new();
        BufReader::new(&client).read_line(&mut line).unwrap();
        assert_eq!(line, "echo hello\n");
        echo.join().unwrap();
    }

    #[test]
    fn a_write_completes_while_a_read_waits_on_the_same_end() {
        let (server, client) = connected_pair("duplex");
        let writer_end = server.try_clone().unwrap();
        let reader = std::thread::spawn(move || {
            let mut byte = [0u8; 1];
            (&server).read_exact(&mut byte).map(|()| byte[0])
        });
        std::thread::sleep(Duration::from_millis(100));
        let (done_tx, done_rx) = mpsc::channel();
        std::thread::spawn(move || {
            let _ = done_tx.send((&writer_end).write_all(b"x"));
        });
        let written = done_rx.recv_timeout(Duration::from_secs(2));
        (&client).write_all(b"y").unwrap();
        assert_eq!(reader.join().unwrap().unwrap(), b'y');
        assert!(matches!(written, Ok(Ok(()))), "write blocked behind the pending read: {written:?}");
        let mut byte = [0u8; 1];
        (&client).read_exact(&mut byte).unwrap();
        assert_eq!(byte[0], b'x');
    }

    #[test]
    fn a_closed_client_reads_as_end_of_file() {
        let (server, client) = connected_pair("eof");
        drop(client);
        let mut buf = [0u8; 8];
        assert_eq!((&server).read(&mut buf).unwrap(), 0);
    }

    #[test]
    fn client_sees_this_process_as_the_server() {
        let (server, client) = connected_pair("server-pid");
        assert_eq!(server_pid(&client).unwrap(), std::process::id());
        assert_eq!(server_pid(&server).unwrap(), std::process::id());
    }

    #[test]
    fn server_sees_this_process_as_the_client() {
        let (server, _client) = connected_pair("client-pid");
        assert_eq!(client_pid(&server).unwrap(), std::process::id());
    }

    #[test]
    fn a_second_first_instance_fails() {
        // A DACL that lets this user create instances, so only the flag can make the second create fail.
        const OPEN: &str = "D:P(A;;GA;;;AU)";
        let name = unique_name("first");
        let _server = create(&name, OPEN, true).unwrap();
        create(&name, OPEN, false).unwrap();
        assert!(create(&name, OPEN, true).is_err());
    }

    #[test]
    fn an_admins_only_pipe_denies_an_unelevated_client() {
        if dp_elevation::is_elevated() {
            return;
        }
        let name = unique_name("admins-only");
        let _server = create(&name, &pipe_sddl(&[]).unwrap(), true).unwrap();
        let error = connect(&name, Duration::from_millis(500)).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied, "{error:?}");
    }

    #[test]
    fn accept_times_out_without_a_client() {
        let name = unique_name("timeout");
        let server = create(&name, &user_sddl(), true).unwrap();
        let start = Instant::now();
        let error = accept(&server, Duration::from_millis(200)).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::TimedOut);
        assert!(start.elapsed() >= Duration::from_millis(200));
        assert!(start.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn accept_counts_a_client_that_connected_first() {
        let name = unique_name("early");
        let server = create(&name, &user_sddl(), true).unwrap();
        let _client = connect(&name, LONG).unwrap();
        accept(&server, LONG).unwrap();
    }

    #[test]
    fn connect_times_out_when_no_pipe_exists() {
        let start = Instant::now();
        let error = connect(&unique_name("missing"), Duration::from_millis(200)).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::TimedOut);
        assert!(start.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn create_rejects_a_bad_sddl() {
        assert!(create(&unique_name("bad-sddl"), "not sddl", true).is_err());
    }
}
