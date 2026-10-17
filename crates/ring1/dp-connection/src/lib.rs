use std::net::{Ipv4Addr, SocketAddrV4};
use std::sync::Arc;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::start;

// The helper only needs std and libc, so it compiles and tests on every host that has them.
#[cfg(unix)]
mod capture;
#[cfg(unix)]
mod helper;
mod policy;
#[cfg(unix)]
mod session;
pub mod wire;
#[cfg(unix)]
pub use helper::run as run_helper;
#[cfg(unix)]
pub use session::start;

// Compiled everywhere so its tests run on every host; only used where there is no backend.
#[cfg_attr(any(windows, unix), allow(dead_code))]
mod unsupported;
#[cfg(not(any(windows, unix)))]
pub use unsupported::start;

/// The command-line switch that makes the app binary run as the capture helper instead of opening a window.
pub const HELPER_ARG: &str = "--capture-helper";

pub struct Packet {
    /// Known only where the source can tell processes apart.
    pub pid: Option<u32>,
    pub remote: SocketAddrV4,
    pub inbound: bool,
    /// Event time in 100 ns units. Only differences between packets are meaningful.
    pub ticks_100ns: i64,
}

/// Lets a source skip processes nobody is watching before it does any parsing.
pub type Wanted = Arc<dyn Fn(u32) -> bool + Send + Sync>;
pub type Sink = Arc<dyn Fn(Packet) + Send + Sync>;
/// The far-end addresses worth reporting, for sources that cannot filter by process.
pub type Remotes = Arc<dyn Fn() -> Vec<Ipv4Addr> + Send + Sync>;

pub enum Status {
    Failed(String),
    /// Capturing needs administrator rights the user has not granted yet.
    NeedsPermission,
}

pub type OnStatus = Box<dyn FnOnce(Status) + Send>;

/// The shape of every capture backend's `start`, so a caller can pick one at run time.
pub type Start = fn(Config) -> std::sync::mpsc::Sender<()>;

pub struct Config {
    pub wanted: Wanted,
    pub sink: Sink,
    pub remotes: Remotes,
    pub on_status: OnStatus,
    /// The user asked for this, so a password prompt is acceptable.
    pub prompt: bool,
}
