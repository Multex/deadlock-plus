use crate::discovery::Probe;
use crate::kind::{classify_path, ClientKind, Pipe};
use crate::paths::{socket_dirs, MAX_PIPES};
use std::io;
use std::os::fd::AsRawFd;
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};

pub type Connection = UnixStream;

fn candidates() -> impl Iterator<Item = (u8, PathBuf)> {
    let dirs = socket_dirs(std::env::var("XDG_RUNTIME_DIR").ok().as_deref(), std::env::var("TMPDIR").ok().as_deref());
    dirs.into_iter().flat_map(|d| (0..MAX_PIPES).map(move |i| (i, d.join(format!("discord-ipc-{i}")))))
}

pub(crate) fn endpoints() -> Vec<Pipe> {
    candidates()
        .filter(|(_, path)| path.exists())
        .map(|(index, path)| Pipe { index, kind: None, path: Some(path) })
        .collect()
}

/// A socket file left behind by a Discord that quit refuses the connection, so it reads as gone.
pub(crate) fn probe(pipe: &Pipe) -> Probe {
    let Some(path) = &pipe.path else { return Probe::Gone };
    match UnixStream::connect(path) {
        Ok(stream) => Probe::Labelled(label(&stream, path)),
        Err(_) => Probe::Gone,
    }
}

pub fn connect(pipe: &Pipe) -> io::Result<Connection> {
    match &pipe.path {
        Some(path) => UnixStream::connect(path),
        None => candidates()
            .filter(|(i, _)| *i == pipe.index)
            .find_map(|(_, p)| UnixStream::connect(p).ok())
            .ok_or_else(|| io::ErrorKind::NotFound.into()),
    }
}

/// The peer's executable is the stronger signal. Under Flatpak or Snap the pid lives in another
/// namespace and may not resolve, so the sandbox directory in the socket path is the fallback.
fn label(stream: &UnixStream, path: &Path) -> Option<ClientKind> {
    let from_exe = peer_pid(stream.as_raw_fd()).and_then(exe_path).map(|p| classify_path(&p));
    let from_path = classify_path(&path.to_string_lossy());
    match (from_exe, from_path) {
        (Some(k), _) if k != ClientKind::Other => Some(k),
        (_, k) if k != ClientKind::Other => Some(k),
        (Some(k), _) => Some(k),
        (None, _) => None,
    }
}

#[cfg(target_os = "linux")]
fn peer_pid(fd: i32) -> Option<i32> {
    let mut cred = libc::ucred { pid: 0, uid: 0, gid: 0 };
    let mut len = std::mem::size_of::<libc::ucred>() as libc::socklen_t;
    // SAFETY: `fd` is borrowed from a live `UnixStream` owned by the caller, so it stays open for the call.
    // `cred` and `len` are initialised locals; `len` is the size of the `ucred` that `SO_PEERCRED` fills in.
    let rc = unsafe {
        libc::getsockopt(fd, libc::SOL_SOCKET, libc::SO_PEERCRED, (&mut cred as *mut libc::ucred).cast(), &mut len)
    };
    (rc == 0 && cred.pid > 0).then_some(cred.pid)
}

#[cfg(target_os = "linux")]
fn exe_path(pid: i32) -> Option<String> {
    std::fs::read_link(format!("/proc/{pid}/exe")).ok().map(|p| p.to_string_lossy().into_owned())
}

#[cfg(not(target_os = "linux"))]
fn peer_pid(_fd: i32) -> Option<i32> {
    None
}

#[cfg(not(target_os = "linux"))]
fn exe_path(_pid: i32) -> Option<String> {
    None
}
