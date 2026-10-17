use std::io::{self, BufReader, Write};
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::{Duration, Instant};

use windows::Win32::Foundation::{HANDLE, WAIT_OBJECT_0};
use windows::Win32::System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE};

use crate::dispatch::{self, capture_running, Ctx, Starters, Traces};
use crate::idle::{self, IdleFacts};
use crate::op::{self, Reply};
use crate::pipe::{self, Pipe};
use crate::relays::RelayCache;
use crate::serve::{self, Mode, Out};
use crate::{access, logfile, paths, sid};

pub const EXIT_OK: i32 = 0;
/// The app's pipe could not be opened or read.
pub const EXIT_BAD_PIPE: i32 = 2;
/// The pipe is not served by the app, or the app's process or account cannot be read.
pub const EXIT_BAD_PEER: i32 = 3;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const WATCH_EVERY: Duration = Duration::from_secs(1);
/// A trace stops on its own thread after the stop signal; exiting at once could leave its ETW session running.
const STOP_GRACE: Duration = Duration::from_secs(1);

fn lock<T: ?Sized>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Fails with `PermissionDenied` when the pipe is not served by `app_pid`: a same-user process that took the name
/// first must not get an admin server.
pub fn connect_to_app(pipe_name: &str, app_pid: u32, timeout: Duration) -> io::Result<Pipe> {
    let pipe = pipe::connect(pipe_name, timeout)?;
    let server = pipe::server_pid(&pipe)?;
    if !access::server_is_expected(server, app_pid) {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            format!("the pipe is served by process {server}, not the app ({app_pid})"),
        ));
    }
    Ok(pipe)
}

/// The app process, opened once so a later process reusing its id cannot pass for it.
pub struct Owner(OwnedHandle);

impl Owner {
    pub fn open(pid: u32) -> io::Result<Owner> {
        // SAFETY: opening a process by id has no preconditions; the handle is owned right away.
        let handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, false, pid) }.map_err(pipe::os_error)?;
        // SAFETY: `OpenProcess` returned a fresh valid handle that nothing else owns.
        Ok(Owner(unsafe { OwnedHandle::from_raw_handle(handle.0) }))
    }

    pub fn alive(&self) -> bool {
        // SAFETY: the handle is open with SYNCHRONIZE; a zero timeout only polls it.
        unsafe { WaitForSingleObject(HANDLE(self.0.as_raw_handle()), 0) != WAIT_OBJECT_0 }
    }
}

/// The message of an error reply. Trace lines never start with `{`, so they are skipped without parsing.
fn refusal(line: &[u8]) -> Option<String> {
    if line.first() != Some(&b'{') {
        return None;
    }
    let text = std::str::from_utf8(line).ok()?;
    match op::decode_reply(text.trim_end()) {
        Ok(Reply::Error { message }) => Some(message),
        _ => None,
    }
}

/// Logs every error reply on its way to the app. `serve` answers refused requests itself, so the replies are the
/// only place this process sees them.
struct LoggedReplies(Pipe);

impl Write for LoggedReplies {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.0.write(buf)
    }

    fn write_all(&mut self, buf: &[u8]) -> io::Result<()> {
        if let Some(message) = refusal(buf) {
            log::warn!("request refused: {message}");
        }
        self.0.write_all(buf)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.0.flush()
    }
}

fn start_logging() {
    if let Some(path) = logfile::default_path(paths::program_data().map(PathBuf::into_os_string)) {
        logfile::init(&path);
    }
}

fn shut_down(ctx: &Ctx) {
    let running = capture_running(&lock(&ctx.traces));
    dispatch::connection_closed(ctx);
    if running {
        thread::sleep(STOP_GRACE);
    }
    log::logger().flush();
}

fn watch(ctx: Arc<Ctx>, last_request: Arc<Mutex<Instant>>, owner: Owner) {
    loop {
        thread::sleep(WATCH_EVERY);
        let facts = IdleFacts {
            since_last_request: lock(&last_request).elapsed(),
            capture_running: capture_running(&lock(&ctx.traces)),
            owner_alive: Some(owner.alive()),
        };
        if idle::should_exit(&facts) {
            if facts.owner_alive == Some(false) {
                log::info!("the app exited, stopping");
            } else {
                log::info!("no request for {}s, stopping", facts.since_last_request.as_secs());
            }
            shut_down(&ctx);
            std::process::exit(EXIT_OK);
        }
    }
}

pub fn run(pipe_name: &str, app_pid: u32) -> i32 {
    start_logging();
    log::info!("privileged helper started for app process {app_pid}");
    let pipe = match connect_to_app(pipe_name, app_pid, CONNECT_TIMEOUT) {
        Ok(pipe) => pipe,
        Err(e) if e.kind() == io::ErrorKind::PermissionDenied => {
            log::error!("refused the app pipe: {e}");
            return EXIT_BAD_PEER;
        }
        Err(e) => {
            log::error!("could not connect to the app: {e}");
            return EXIT_BAD_PIPE;
        }
    };
    let owner = match Owner::open(app_pid) {
        Ok(owner) => owner,
        Err(e) => {
            log::error!("could not open the app process: {e}");
            return EXIT_BAD_PEER;
        }
    };
    // Over-the-shoulder UAC runs this process as another account, so the app's account comes from its own token.
    let sid = match sid::process_user_sid(app_pid) {
        Ok(sid) => sid,
        Err(e) => {
            log::error!("could not read the app's account: {e}");
            return EXIT_BAD_PEER;
        }
    };
    let writer = match pipe.try_clone() {
        Ok(writer) => writer,
        Err(e) => {
            log::error!("could not share the app pipe: {e}");
            return EXIT_BAD_PIPE;
        }
    };
    let out: Out = Arc::new(Mutex::new(LoggedReplies(writer)));
    let ctx = Arc::new(Ctx {
        mode: Mode::Helper,
        sid,
        out: out.clone(),
        conn: 1,
        traces: Arc::new(Mutex::new(Traces::default())),
        starters: Starters::REAL,
        service: None,
    });
    let last_request = Arc::new(Mutex::new(Instant::now()));
    {
        let ctx = ctx.clone();
        let last_request = last_request.clone();
        thread::Builder::new()
            .name("helper-idle".into())
            .spawn(move || watch(ctx, last_request, owner))
            .expect("spawn thread");
    }
    let relays = Mutex::new(RelayCache::new());
    serve::serve(
        BufReader::new(&pipe),
        &out,
        Mode::Helper,
        &|refresh| lock(&relays).get(refresh),
        &|| *lock(&last_request) = Instant::now(),
        &mut |op| dispatch::exec(&ctx, op),
    );
    log::info!("the app closed the pipe, stopping");
    shut_down(&ctx);
    EXIT_OK
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::{Command, Stdio};
    use std::sync::atomic::{AtomicU32, Ordering};

    const LONG: Duration = Duration::from_secs(5);

    fn unique_name(tag: &str) -> String {
        static NEXT: AtomicU32 = AtomicU32::new(0);
        format!(r"\\.\pipe\dp-helper-main-test-{}-{tag}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed))
    }

    fn test_pipe(tag: &str) -> (String, Pipe) {
        let name = unique_name(tag);
        let user = sid::current_user_sid().unwrap();
        let server = pipe::create(&name, &access::pipe_sddl(&[&user]).unwrap(), true).unwrap();
        (name, server)
    }

    #[test]
    fn connects_when_the_app_serves_the_pipe() {
        let (name, _server) = test_pipe("own");
        connect_to_app(&name, std::process::id(), LONG).unwrap();
    }

    #[test]
    fn refuses_a_pipe_served_by_another_process() {
        let (name, _server) = test_pipe("other");
        let error = connect_to_app(&name, std::process::id() + 1, LONG).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied, "{error:?}");
    }

    #[test]
    fn refuses_app_pid_zero() {
        let (name, _server) = test_pipe("zero");
        let error = connect_to_app(&name, 0, LONG).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied, "{error:?}");
    }

    #[test]
    fn a_missing_pipe_is_not_a_peer_error() {
        let error =
            connect_to_app(&unique_name("missing"), std::process::id(), Duration::from_millis(200)).unwrap_err();
        assert_ne!(error.kind(), io::ErrorKind::PermissionDenied, "{error:?}");
    }

    #[test]
    fn this_process_is_alive() {
        assert!(Owner::open(std::process::id()).unwrap().alive());
    }

    #[test]
    fn an_exited_child_is_dead() {
        let root = std::env::var_os("SystemRoot").expect("SystemRoot");
        let cmd = std::path::Path::new(&root).join("System32").join("cmd.exe");
        let mut child = Command::new(cmd)
            .args(["/c", "exit 0"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        // `child` keeps its own handle open, so the process object outlives the exit and the open cannot race it.
        let owner = Owner::open(child.id()).unwrap();
        child.wait().unwrap();
        assert!(!owner.alive());
    }

    #[test]
    fn error_replies_are_refusals() {
        let line = op::encode_reply(&Reply::Error { message: "not a relay".into() });
        assert_eq!(refusal(line.as_bytes()).as_deref(), Some("not a relay"));
    }

    #[test]
    fn other_lines_are_not_refusals() {
        assert_eq!(refusal(op::encode_reply(&Reply::Ok {}).as_bytes()), None);
        assert_eq!(refusal(b"D 123\n"), None);
        assert_eq!(refusal(b"{not json\n"), None);
        assert_eq!(refusal(b""), None);
    }
}
