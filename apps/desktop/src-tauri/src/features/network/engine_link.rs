use dp_live::{EngineConnection, EngineRemote};
use dp_network::{EngineLink, EngineServer};

pub fn engine_link(conn: EngineConnection) -> EngineLink {
    let server = conn.remote.map(|remote| match remote {
        EngineRemote::SteamId(id) => EngineServer::Steam(id),
        EngineRemote::Ip(addr) => EngineServer::Ip(addr),
        EngineRemote::Loopback => EngineServer::Loopback,
    });
    EngineLink::from_channel(conn.signon, server)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{Ipv4Addr, SocketAddrV4};

    fn conn(signon: Option<u32>, remote: Option<EngineRemote>) -> EngineConnection {
        EngineConnection { signon, remote }
    }

    #[test]
    fn a_null_channel_is_not_connected_without_a_signon() {
        assert_eq!(engine_link(EngineConnection::NO_CHANNEL), EngineLink::NotConnected { signon: None });
    }

    #[test]
    fn any_signon_but_full_is_not_connected_even_with_a_remote() {
        for signon in [0, 1, 2, 3, 4, 5, 7] {
            let got = engine_link(conn(Some(signon), Some(EngineRemote::SteamId(1))));
            assert_eq!(got, EngineLink::NotConnected { signon: Some(signon) }, "signon {signon}");
        }
    }

    #[test]
    fn a_full_signon_carries_each_remote() {
        let addr = SocketAddrV4::new(Ipv4Addr::new(155, 133, 226, 70), 27015);
        let cases = [
            (Some(EngineRemote::SteamId(90_000_000_000_000_001)), Some(EngineServer::Steam(90_000_000_000_000_001))),
            (Some(EngineRemote::Ip(addr)), Some(EngineServer::Ip(addr))),
            (Some(EngineRemote::Loopback), Some(EngineServer::Loopback)),
            (None, None),
        ];
        for (remote, server) in cases {
            assert_eq!(engine_link(conn(Some(6), remote)), EngineLink::Connected(server), "{remote:?}");
        }
    }
}
