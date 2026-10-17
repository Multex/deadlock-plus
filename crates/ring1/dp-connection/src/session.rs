use std::io::{BufRead, BufReader, Write};
use std::net::Ipv4Addr;
use std::os::fd::AsRawFd;
use std::os::unix::fs::{DirBuilderExt, MetadataExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::{Duration, Instant};

use super::policy::{self, Elevation, FileFacts};
use super::wire;
use super::{Config, Packet, Status, HELPER_ARG};

/// Long enough to type a password.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(180);
const POLL: Duration = Duration::from_millis(200);
const FILTER_REFRESH: Duration = Duration::from_secs(2);

/// Returns a sender; sending on it, or dropping it, stops the source.
pub fn start(config: Config) -> Sender<()> {
    let (stop, stopped) = mpsc::channel();
    thread::Builder::new()
        .name("capture-session".into())
        .spawn(move || {
            let Config { sink, remotes, on_status, prompt, .. } = config;
            if !prompt {
                on_status(Status::NeedsPermission);
                return;
            }
            if let Err(message) = run(&*sink, &*remotes, &stopped) {
                log::warn!("connection capture ended: {message}");
                on_status(Status::Failed(message));
            }
        })
        .expect("spawn thread");
    stop
}

struct PrivateDir(PathBuf);

impl PrivateDir {
    fn create() -> std::io::Result<Self> {
        let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_nanos());
        let path = std::env::temp_dir().join(format!("deadlock-plus-capture-{}-{nanos}", std::process::id()));
        std::fs::DirBuilder::new().mode(0o700).create(&path)?;
        Ok(Self(path))
    }
}

impl Drop for PrivateDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// The AppImage's own mount is not visible to root, so the image file itself is what gets elevated.
fn helper_executable() -> std::io::Result<PathBuf> {
    match std::env::var_os("APPIMAGE") {
        Some(image) => Ok(PathBuf::from(image)),
        None => std::env::current_exe(),
    }
}

fn is_root() -> bool {
    // SAFETY: geteuid has no preconditions.
    unsafe { libc::geteuid() == 0 }
}

fn launch(mut command: Command) -> Result<Child, String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("could not ask for permission: {e}"))
}

fn component_facts(path: &Path) -> Option<Vec<FileFacts>> {
    let real = std::fs::canonicalize(path).ok()?;
    let mut chain = Vec::new();
    for part in real.ancestors() {
        let meta = std::fs::metadata(part).ok()?;
        chain.push(FileFacts { uid: meta.uid(), mode: meta.mode() });
    }
    Some(chain)
}

/// Starts the helper with administrator rights, through the desktop's own password prompt. A binary that a
/// normal user could replace is copied to a root-owned location first, inside the same prompt.
fn spawn_helper(exe: &Path, socket: &Path) -> Result<Child, String> {
    if is_root() {
        let mut command = Command::new(exe);
        command.arg(HELPER_ARG).arg(socket);
        return launch(command);
    }
    let pkexec = dp_privilege::pick_pkexec(Path::exists)
        .ok_or("pkexec was not found, so administrator rights cannot be requested")?;
    let mut command = Command::new(pkexec);
    let chain = component_facts(exe).unwrap_or_default();
    match policy::plan_elevation(&chain) {
        Elevation::InPlace => command.arg(exe).arg(HELPER_ARG).arg(socket),
        Elevation::CopyToRootOwned => command.args(policy::copy_and_run_args(exe, HELPER_ARG, socket)),
    };
    launch(command)
}

#[cfg(target_os = "linux")]
fn peer_uid(stream: &UnixStream) -> Option<u32> {
    let mut cred = libc::ucred { pid: 0, uid: 0, gid: 0 };
    let mut len = std::mem::size_of::<libc::ucred>() as libc::socklen_t;
    // SAFETY: `cred` and `len` outlive the call and `len` is its size; the descriptor is owned by `stream`.
    let rc = unsafe {
        libc::getsockopt(
            stream.as_raw_fd(),
            libc::SOL_SOCKET,
            libc::SO_PEERCRED,
            (&mut cred as *mut libc::ucred).cast(),
            &mut len,
        )
    };
    (rc == 0).then_some(cred.uid)
}

#[cfg(not(target_os = "linux"))]
fn peer_uid(stream: &UnixStream) -> Option<u32> {
    let (mut uid, mut gid) = (0, 0);
    // SAFETY: both out-pointers are valid for the call; the descriptor is owned by `stream`.
    let rc = unsafe { libc::getpeereid(stream.as_raw_fd(), &mut uid, &mut gid) };
    (rc == 0).then_some(uid)
}

enum Wait {
    Stopped,
    Failed(String),
}

fn accept(listener: &UnixListener, child: &mut Child, stopped: &Receiver<()>) -> Result<UnixStream, Wait> {
    listener.set_nonblocking(true).map_err(|e| Wait::Failed(e.to_string()))?;
    let deadline = Instant::now() + CONNECT_TIMEOUT;
    loop {
        match listener.accept() {
            Ok((stream, _)) => {
                if !peer_uid(&stream).is_some_and(policy::peer_allowed) {
                    log::warn!("rejected a capture connection from an unexpected user");
                    continue;
                }
                stream.set_nonblocking(false).map_err(|e| Wait::Failed(e.to_string()))?;
                return Ok(stream);
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(e) => return Err(Wait::Failed(e.to_string())),
        }
        if matches!(stopped.recv_timeout(POLL), Ok(()) | Err(RecvTimeoutError::Disconnected)) {
            let _ = child.kill();
            return Err(Wait::Stopped);
        }
        if let Ok(Some(status)) = child.try_wait() {
            let mut stderr = String::new();
            if let Some(mut pipe) = child.stderr.take() {
                let _ = std::io::Read::read_to_string(&mut pipe, &mut stderr);
            }
            if let Some(message) = policy::explain_early_exit(status.code(), &stderr) {
                return Err(Wait::Failed(message));
            }
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            return Err(Wait::Failed("Permission was not granted in time.".into()));
        }
    }
}

fn run(
    sink: &(dyn Fn(Packet) + Send + Sync),
    remotes: &(dyn Fn() -> Vec<Ipv4Addr> + Send + Sync),
    stopped: &Receiver<()>,
) -> Result<(), String> {
    let dir = PrivateDir::create().map_err(|e| format!("could not prepare the capture: {e}"))?;
    let socket = dir.0.join("s");
    let listener = UnixListener::bind(&socket).map_err(|e| format!("could not prepare the capture: {e}"))?;
    let exe = helper_executable().map_err(|e| e.to_string())?;
    let mut child = spawn_helper(&exe, &socket)?;
    let stream = match accept(&listener, &mut child, stopped) {
        Ok(stream) => stream,
        Err(Wait::Stopped) => return Ok(()),
        Err(Wait::Failed(message)) => return Err(message),
    };
    log::info!("connection capture helper connected");

    let writer = stream.try_clone().map_err(|e| e.to_string())?;
    let result = thread::scope(|scope| {
        let reader = thread::Builder::new()
            .name("capture-reader".into())
            .spawn_scoped(scope, || {
                for line in BufReader::new(&stream).lines().map_while(Result::ok) {
                    if let Some((inbound, remote, ticks_100ns)) = wire::decode_packet(&line) {
                        sink(Packet { pid: None, remote, inbound, ticks_100ns });
                    } else if let Some(message) = wire::decode_error(&line) {
                        return Err(message);
                    }
                }
                Ok(())
            })
            .map_err(|e| e.to_string())?;

        let mut writer = &writer;
        let mut sent: Option<Vec<Ipv4Addr>> = None;
        let mut next_push = Instant::now();
        let outcome = loop {
            if Instant::now() >= next_push {
                let mut wanted = remotes();
                wanted.sort();
                wanted.dedup();
                if sent.as_ref() != Some(&wanted) {
                    if writer.write_all(wire::encode_filter(&wanted).as_bytes()).is_err() {
                        break Ok(());
                    }
                    sent = Some(wanted);
                }
                next_push = Instant::now() + FILTER_REFRESH;
            }
            match stopped.recv_timeout(POLL) {
                Ok(()) | Err(RecvTimeoutError::Disconnected) => break Ok(()),
                Err(RecvTimeoutError::Timeout) => {}
            }
            if reader.is_finished() {
                break Ok(());
            }
        };
        let _ = stream.shutdown(std::net::Shutdown::Both);
        match reader.join() {
            Ok(Err(message)) => Err(message),
            _ => outcome,
        }
    });
    let _ = child.wait();
    result
}
