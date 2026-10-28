use std::net::{Ipv4Addr, SocketAddrV4};
use std::os::windows::process::CommandExt;
use std::sync::mpsc::{self, Sender};
use std::thread;

use ferrisetw::parser::Parser;
use ferrisetw::provider::{EventFilter, Provider, ProviderBuilder};
use ferrisetw::schema_locator::SchemaLocator;
use ferrisetw::trace::{TraceTrait, UserTrace};
use ferrisetw::EventRecord;

use super::{Config, Packet, Status};

const KERNEL_NETWORK: &str = "7dd42a49-5329-4832-8dfd-43d979153a88";
const SESSION: &str = "DeadlockPlusNetwork";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const EVENT_SEND: u16 = 42;
const EVENT_RECEIVE: u16 = 43;
/// `KERNEL_NETWORK_KEYWORD_IPV4`. TCP over IPv4 carries it too, so the event id filter does most of the cutting.
const KEYWORD_IPV4: u64 = 0x10;

/// Filtered inside ETW, so other traffic on the machine never reaches the callback.
fn network_provider() -> ProviderBuilder {
    Provider::by_guid(KERNEL_NETWORK)
        .any(KEYWORD_IPV4)
        .add_filter(EventFilter::ByEventIds(vec![EVENT_SEND, EVENT_RECEIVE]))
}

struct UdpV4 {
    pid: u32,
    daddr: u32,
    saddr: u32,
    dport: u16,
    sport: u16,
}

/// Version 0 of events 42 and 43: `PID`, `size`, `daddr`, `saddr` (u32 each), then `dport`, `sport` (u16 each),
/// all fixed width, so the fields sit at fixed offsets.
fn decode_udp_v4(payload: &[u8]) -> Option<UdpV4> {
    let u32_at = |at: usize| Some(u32::from_le_bytes(payload.get(at..at + 4)?.try_into().ok()?));
    let u16_at = |at: usize| Some(u16::from_le_bytes(payload.get(at..at + 2)?.try_into().ok()?));
    Some(UdpV4 { pid: u32_at(0)?, daddr: u32_at(8)?, saddr: u32_at(12)?, dport: u16_at(16)?, sport: u16_at(18)? })
}

/// The Win32 `EVENT_RECORD` layout. ferrisetw's `EventRecord` is `#[repr(transparent)]` over it but keeps the
/// payload private; reading it directly skips a schema lookup and a by-name parse that allocates on every event.
#[repr(C)]
struct RawEventRecord {
    header: [u64; 10],
    buffer_context: u32,
    extended_data_count: u16,
    user_data_length: u16,
    extended_data: *const std::ffi::c_void,
    user_data: *const u8,
    user_context: *const std::ffi::c_void,
}

const _: () = assert!(std::mem::size_of::<RawEventRecord>() == std::mem::size_of::<EventRecord>());

fn payload(record: &EventRecord) -> &[u8] {
    // SAFETY: `EventRecord` is `#[repr(transparent)]` over `EVENT_RECORD` in the pinned ferrisetw version, and
    // `RawEventRecord` mirrors that layout (the size assert above catches drift). ETW keeps `UserData` valid for
    // `UserDataLength` bytes while the callback holds the record.
    unsafe {
        let raw = &*(record as *const EventRecord).cast::<RawEventRecord>();
        if raw.user_data.is_null() {
            return &[];
        }
        std::slice::from_raw_parts(raw.user_data, usize::from(raw.user_data_length))
    }
}

/// Later event versions may move fields, so they go through the schema.
fn parse_with_schema(record: &EventRecord, locator: &SchemaLocator, wanted: &super::Wanted) -> Option<UdpV4> {
    let schema = locator.event_schema(record).ok()?;
    let parser = Parser::create(record, &schema);
    let pid = parser.try_parse::<u32>("PID").ok()?;
    if !wanted(pid) {
        return None;
    }
    Some(UdpV4 {
        pid,
        daddr: parser.try_parse("daddr").ok()?,
        saddr: parser.try_parse("saddr").ok()?,
        dport: parser.try_parse("dport").ok()?,
        sport: parser.try_parse("sport").ok()?,
    })
}

fn is_local(ip: Ipv4Addr) -> bool {
    ip.is_private() || ip.is_loopback() || ip.is_unspecified() || ip.is_link_local()
}

/// The remote side is whichever address is not ours; if both or neither look local, the destination.
/// Ports arrive in network byte order.
fn remote_endpoint(daddr: u32, saddr: u32, dport: u16, sport: u16) -> SocketAddrV4 {
    let d = Ipv4Addr::from(daddr.to_le_bytes());
    let s = Ipv4Addr::from(saddr.to_le_bytes());
    let (ip, port) = if is_local(d) && !is_local(s) { (s, sport) } else { (d, dport) };
    SocketAddrV4::new(ip, port.swap_bytes())
}

/// Returns a sender; sending on it, or dropping it, stops the source.
pub fn start(config: Config) -> Sender<()> {
    let Config { wanted, sink, on_status, .. } = config;
    let (tx, rx) = mpsc::channel::<()>();

    thread::Builder::new()
        .name("etw-session".into())
        .spawn(move || {
            // ETW sessions outlive the process that created them, so clear one left by a crashed run.
            if let Err(e) = std::process::Command::new(super::policy::system32_exe(
                std::env::var_os("SystemRoot").as_deref(),
                "logman.exe",
            ))
            .args(["stop", SESSION, "-ets"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            {
                log::debug!("could not run logman to clear a stale trace session: {e}");
            }

            let callback = move |record: &EventRecord, locator: &SchemaLocator| {
                let id = record.event_id();
                if id != EVENT_SEND && id != EVENT_RECEIVE {
                    return;
                }
                let udp = if record.version() == 0 {
                    match decode_udp_v4(payload(record)) {
                        Some(udp) if wanted(udp.pid) => udp,
                        _ => return,
                    }
                } else {
                    match parse_with_schema(record, locator, &wanted) {
                        Some(udp) => udp,
                        None => return,
                    }
                };

                sink(Packet {
                    pid: Some(udp.pid),
                    remote: remote_endpoint(udp.daddr, udp.saddr, udp.dport, udp.sport),
                    inbound: id == EVENT_RECEIVE,
                    // The event's own FILETIME timestamp; delivery to this callback is batched.
                    ticks_100ns: record.raw_timestamp(),
                });
            };

            let provider = network_provider().add_callback(callback).build();
            match UserTrace::new().named(SESSION.to_string()).enable(provider).start() {
                Ok((trace, handle)) => {
                    log::info!("network trace started");
                    thread::Builder::new()
                        .name("etw-processor".into())
                        .spawn(move || {
                            if let Err(e) = UserTrace::process_from_handle(handle) {
                                log::warn!("network trace processing ended with an error: {e:?}");
                            }
                        })
                        .expect("spawn thread");
                    let _ = rx.recv();
                    drop(trace);
                }
                Err(e) => {
                    log::error!("couldn't start the network trace: {e:?}");
                    on_status(Status::Failed(format!("couldn't start the network trace (needs administrator): {e:?}")));
                }
            }
        })
        .expect("spawn thread");

    tx
}

#[cfg(test)]
mod tests {
    use super::*;

    // Keyword masks of the manifest events, from `Get-WinEvent -ListProvider Microsoft-Windows-Kernel-Network`.
    const UDP_V4_EVENT_KEYWORDS: u64 = 0x8000_0000_0000_0010;
    const UDP_V6_EVENT_KEYWORDS: u64 = 0x8000_0000_0000_0020;

    fn admits(provider: &Provider, event_keywords: u64) -> bool {
        event_keywords & provider.any() != 0 && event_keywords & provider.all() == provider.all()
    }

    #[test]
    fn the_provider_admits_only_udp_v4_send_and_receive() {
        let provider = network_provider().build();
        match provider.filters() {
            [EventFilter::ByEventIds(ids)] => assert_eq!(ids, &[EVENT_SEND, EVENT_RECEIVE]),
            other => panic!("expected one event id filter, got {other:?}"),
        }
        assert!(admits(&provider, UDP_V4_EVENT_KEYWORDS));
        assert!(!admits(&provider, UDP_V6_EVENT_KEYWORDS));
    }

    fn udp_payload(pid: u32, daddr: u32, saddr: u32, dport: u16, sport: u16) -> Vec<u8> {
        let mut p = Vec::new();
        p.extend_from_slice(&pid.to_le_bytes());
        p.extend_from_slice(&1200u32.to_le_bytes());
        p.extend_from_slice(&daddr.to_le_bytes());
        p.extend_from_slice(&saddr.to_le_bytes());
        p.extend_from_slice(&dport.to_le_bytes());
        p.extend_from_slice(&sport.to_le_bytes());
        p.extend_from_slice(&7u32.to_le_bytes());
        p.extend_from_slice(&9u32.to_le_bytes());
        p
    }

    #[test]
    fn udp_payloads_decode_in_manifest_field_order() {
        let relay = Ipv4Addr::new(155, 133, 226, 1);
        let me = Ipv4Addr::new(192, 168, 1, 5);
        let payload = udp_payload(4242, raw(relay), raw(me), 27015u16.swap_bytes(), 50000u16.swap_bytes());
        let udp = decode_udp_v4(&payload).expect("decodes");
        assert_eq!(udp.pid, 4242);
        let remote = remote_endpoint(udp.daddr, udp.saddr, udp.dport, udp.sport);
        assert_eq!(remote, SocketAddrV4::new(relay, 27015));
    }

    #[test]
    fn a_payload_too_short_for_the_ports_is_not_decoded() {
        let payload = udp_payload(1, 2, 3, 4, 5);
        assert!(decode_udp_v4(&payload[..19]).is_none());
        assert!(decode_udp_v4(&payload[..20]).is_some());
    }

    fn raw(ip: Ipv4Addr) -> u32 {
        u32::from_le_bytes(ip.octets())
    }

    #[test]
    fn inbound_packets_report_the_public_source_as_remote() {
        let relay = Ipv4Addr::new(155, 133, 226, 1);
        let me = Ipv4Addr::new(192, 168, 1, 5);
        let remote = remote_endpoint(raw(me), raw(relay), 50000u16.swap_bytes(), 27015u16.swap_bytes());
        assert_eq!(remote, SocketAddrV4::new(relay, 27015));
    }

    #[test]
    fn outbound_packets_report_the_destination_as_remote() {
        let relay = Ipv4Addr::new(155, 133, 226, 1);
        let me = Ipv4Addr::new(192, 168, 1, 5);
        let remote = remote_endpoint(raw(relay), raw(me), 27015u16.swap_bytes(), 50000u16.swap_bytes());
        assert_eq!(remote, SocketAddrV4::new(relay, 27015));
    }
}
