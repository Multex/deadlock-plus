use std::net::SocketAddrV4;

use dp_connection::wire;
use dp_frames::line::{self, FrameLine};

use crate::op::{self, Reply};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Incoming {
    Reply(Reply),
    Packet { inbound: bool, remote: SocketAddrV4, ticks: i64 },
    NetFailed(String),
    Frames(FrameLine),
}

pub fn classify(line: &str) -> Option<Incoming> {
    if line.starts_with('{') {
        return op::decode_reply(line).ok().map(Incoming::Reply);
    }
    if line.starts_with("P ") {
        let (inbound, remote, ticks) = wire::decode_packet(line)?;
        return Some(Incoming::Packet { inbound, remote, ticks });
    }
    if line.starts_with("E ") {
        return wire::decode_error(line).map(Incoming::NetFailed);
    }
    if line.starts_with("D ") || line.starts_with("O ") || line.starts_with("X ") {
        return line::decode(line).map(Incoming::Frames);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    fn remote() -> SocketAddrV4 {
        SocketAddrV4::new(Ipv4Addr::new(155, 133, 226, 1), 27015)
    }

    #[test]
    fn classifies_a_reply() {
        let line = op::encode_reply(&Reply::Refreshed { updated: vec!["a".into()], failed: vec![] });
        assert_eq!(
            classify(&line),
            Some(Incoming::Reply(Reply::Refreshed { updated: vec!["a".into()], failed: vec![] }))
        );
        assert_eq!(classify(&op::encode_reply(&Reply::Ok {})), Some(Incoming::Reply(Reply::Ok {})));
    }

    #[test]
    fn classifies_a_packet() {
        assert_eq!(
            classify(&wire::encode_packet(true, remote(), -42)),
            Some(Incoming::Packet { inbound: true, remote: remote(), ticks: -42 })
        );
        assert_eq!(
            classify(&wire::encode_packet(false, remote(), 7)),
            Some(Incoming::Packet { inbound: false, remote: remote(), ticks: 7 })
        );
    }

    #[test]
    fn classifies_a_net_error() {
        assert_eq!(classify(&wire::encode_error("trace\nfailed")), Some(Incoming::NetFailed("trace failed".into())));
    }

    #[test]
    fn classifies_frame_lines() {
        for l in [FrameLine::Present(9), FrameLine::Others(2), FrameLine::Failed("boom".into())] {
            assert_eq!(classify(&line::encode(&l)), Some(Incoming::Frames(l)));
        }
    }

    #[test]
    fn junk_is_none() {
        for l in
            ["", "\n", "hello", "p i 1.2.3.4 5 6", "Q 1", "[1]", "D", "D x", "O -1", "P i 1.2.3.4 5", "P x 1.2.3.4 5 6"]
        {
            assert_eq!(classify(l), None, "{l:?}");
        }
    }

    #[test]
    fn a_filter_line_is_none() {
        assert_eq!(classify(&wire::encode_filter(&[Ipv4Addr::new(1, 2, 3, 4)])), None);
        assert_eq!(classify("F\n"), None);
    }

    #[test]
    fn an_undecodable_reply_is_none() {
        assert_eq!(classify("{\"reply\":\"nope\"}\n"), None);
        assert_eq!(classify("{not json\n"), None);
        assert_eq!(classify("{\"reply\":\"ok\",\"extra\":1}\n"), None);
    }
}
