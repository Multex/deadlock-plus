use std::net::SocketAddrV4;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::Mutex;

use deadlock_reader::netchan::{NetChanError, NetConnection, Remote};
use deadlock_reader::Reader;

use crate::link::lock;

/// The server end of the game's net channel.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EngineRemote {
    SteamId(u64),
    Ip(SocketAddrV4),
    Loopback,
}

/// What the game's net channel says about the current connection.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct EngineConnection {
    /// Raw signon state. `None` when the game has no net channel.
    pub signon: Option<u32>,
    /// `None` when the remote is unset or of a kind that is not decoded.
    pub remote: Option<EngineRemote>,
}

impl EngineConnection {
    pub const NO_CHANNEL: Self = Self { signon: None, remote: None };
}

type RawRead = std::thread::Result<Result<Option<NetConnection>, NetChanError>>;

static LAST_FAILURE: Mutex<Option<String>> = Mutex::new(None);

/// `None` when the connection cannot be read, so it is unknown.
pub(crate) fn read(reader: &Reader) -> Option<EngineConnection> {
    // The reader walks foreign process memory; a bug in that walk must not take the app down.
    let outcome = from_read(catch_unwind(AssertUnwindSafe(|| reader.net_connection())));
    let failure = outcome.as_ref().err().cloned();
    if record(&mut lock(&LAST_FAILURE), failure.clone()) {
        if let Some(failure) = failure {
            log::debug!("{failure}");
        }
    }
    outcome.ok()
}

fn from_read(read: RawRead) -> Result<EngineConnection, String> {
    match read {
        Err(_) => Err("net connection read panicked".to_string()),
        Ok(Err(e)) => Err(format!("net connection not readable: {e}")),
        Ok(Ok(None)) => Ok(EngineConnection::NO_CHANNEL),
        // A missing signon offset must not read as "no channel", or a connected game would look disconnected.
        Ok(Ok(Some(NetConnection { signon: None, .. }))) => Err("net connection signon offset unknown".to_string()),
        Ok(Ok(Some(conn))) => Ok(EngineConnection { signon: conn.signon, remote: conn.remote.and_then(remote) }),
    }
}

fn remote(raw: Remote) -> Option<EngineRemote> {
    match raw {
        Remote::SteamId(id) => Some(EngineRemote::SteamId(id)),
        Remote::Ip(addr) => addr.map(EngineRemote::Ip),
        Remote::Loopback => Some(EngineRemote::Loopback),
        _ => None,
    }
}

/// Whether `failure` should be logged: only the first tick of each distinct failure is.
fn record(last: &mut Option<String>, failure: Option<String>) -> bool {
    let changed = failure.is_some() && *last != failure;
    *last = failure;
    changed
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    fn connection(signon: Option<u32>, remote: Option<Remote>) -> RawRead {
        Ok(Ok(Some(NetConnection { signon, remote })))
    }

    #[test]
    fn a_read_error_is_unknown() {
        assert!(from_read(Ok(Err(NetChanError::Unavailable))).is_err());
        assert!(from_read(Ok(Err(NetChanError::Implausible { field: "signon", value: 9.0 }))).is_err());
    }

    #[test]
    fn a_panicking_read_is_unknown() {
        assert!(from_read(Err(Box::new("boom"))).is_err());
    }

    #[test]
    fn a_null_channel_has_no_signon_and_no_remote() {
        assert_eq!(from_read(Ok(Ok(None))), Ok(EngineConnection::NO_CHANNEL));
    }

    #[test]
    fn a_channel_whose_signon_offset_is_unknown_is_unknown_not_a_null_channel() {
        assert!(from_read(connection(None, Some(Remote::Loopback))).is_err());
    }

    #[test]
    fn each_decoded_remote_is_carried_with_the_signon() {
        let addr = SocketAddrV4::new(Ipv4Addr::new(155, 133, 226, 70), 27015);
        let cases = [
            (Remote::SteamId(90_000_000_000_000_001), Some(EngineRemote::SteamId(90_000_000_000_000_001))),
            (Remote::Ip(Some(addr)), Some(EngineRemote::Ip(addr))),
            (Remote::Loopback, Some(EngineRemote::Loopback)),
            (Remote::Ip(None), None),
            (Remote::Unknown(7), None),
        ];
        for (raw, remote) in cases {
            assert_eq!(from_read(connection(Some(6), Some(raw))), Ok(EngineConnection { signon: Some(6), remote }));
        }
        assert_eq!(from_read(connection(Some(3), None)), Ok(EngineConnection { signon: Some(3), remote: None }));
    }

    #[test]
    fn a_failure_is_logged_once_until_it_changes_or_clears() {
        let mut last = None;
        let a = || Some("a".to_string());
        assert!(record(&mut last, a()));
        assert!(!record(&mut last, a()));
        assert!(record(&mut last, Some("b".to_string())));
        assert!(!record(&mut last, None));
        assert!(record(&mut last, Some("b".to_string())));
    }
}
