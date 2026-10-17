use std::collections::HashMap;
use std::net::SocketAddrV4;
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, OnceLock, PoisonError};
use std::thread;
use std::time::{Duration, Instant};

use dp_connection::{wire, Config, Packet, Status};
use dp_frames::capture::{start_present_trace, CaptureError, Present};
use dp_frames::line::{self, FrameLine};

use crate::serve::{send, Out};
use crate::sid::process_user_sid;

const OTHERS_EVERY: Duration = Duration::from_secs(1);

/// The caller's own game: a `deadlock.exe` run by another account on this machine is never theirs to trace.
pub fn pick_game_pid(candidates: &[(u32, Option<String>)], caller_sid: &str) -> Option<u32> {
    candidates.iter().find(|(_, owner)| owner.as_deref() == Some(caller_sid)).map(|(pid, _)| *pid)
}

struct GamePids {
    max_age: Duration,
    by_sid: HashMap<String, (Instant, Option<u32>)>,
}

impl GamePids {
    fn new(max_age: Duration) -> Self {
        Self { max_age, by_sid: HashMap::new() }
    }

    fn get(&mut self, sid: &str, now: Instant, lookup: impl FnOnce() -> Option<u32>) -> Option<u32> {
        if let Some((at, pid)) = self.by_sid.get(sid) {
            if now.saturating_duration_since(*at) < self.max_age {
                return *pid;
            }
        }
        let pid = lookup();
        self.by_sid.insert(sid.to_string(), (now, pid));
        pid
    }
}

/// Cached for [`dp_game::MAX_AGE`] per SID, so the trace callbacks that ask on every event walk processes at most
/// that often.
pub fn game_pid_for(sid: &str) -> Option<u32> {
    static CACHE: OnceLock<Mutex<GamePids>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(GamePids::new(dp_game::MAX_AGE)));
    cache.lock().unwrap_or_else(PoisonError::into_inner).get(sid, Instant::now(), || {
        let candidates: Vec<(u32, Option<String>)> =
            dp_game::pids(dp_game::is_process).into_iter().map(|pid| (pid, process_user_sid(pid).ok())).collect();
        pick_game_pid(&candidates, sid)
    })
}

pub fn packet_line(inbound: bool, remote: SocketAddrV4, ticks: i64) -> String {
    wire::encode_packet(inbound, remote, ticks)
}

/// The server holds the rights the trace needs, so a permission status is a failure here, not a prompt.
fn status_line(status: Status) -> String {
    match status {
        Status::Failed(message) => wire::encode_error(&message),
        Status::NeedsPermission => wire::encode_error("the helper lacks the rights to start the network trace"),
    }
}

/// The error's catalog code, so the app can show the same message it shows for its own trace.
fn failed_line(error: CaptureError) -> String {
    let code = serde_json::to_value(error).ok().and_then(|code| code.as_str().map(str::to_string));
    line::encode(&FrameLine::Failed(code.unwrap_or_else(|| format!("{error:?}"))))
}

#[derive(Debug, Default)]
pub struct FrameFilter {
    pub game_pid: Option<u32>,
    pub others: u32,
}

impl FrameFilter {
    /// A frame without a pid cannot be shown to be the caller's game, so it only counts as another process.
    pub fn on_present(&mut self, present: Present) -> Option<FrameLine> {
        match present {
            Present::Frame { pid: Some(pid), ticks } if Some(pid) == self.game_pid => {
                return Some(FrameLine::Present(ticks));
            }
            Present::Frame { .. } => self.others = self.others.saturating_add(1),
            Present::Others(count) => self.others = self.others.saturating_add(count),
        }
        None
    }

    pub fn take_others(&mut self) -> Option<FrameLine> {
        match std::mem::take(&mut self.others) {
            0 => None,
            count => Some(FrameLine::Others(count)),
        }
    }
}

pub fn start_net(out: Out, sid: String) -> Sender<()> {
    let status_out = out.clone();
    dp_connection::start(Config {
        wanted: Arc::new(move |pid| game_pid_for(&sid) == Some(pid)),
        sink: Arc::new(move |packet: Packet| {
            send(&out, &packet_line(packet.inbound, packet.remote, packet.ticks_100ns));
        }),
        remotes: Arc::new(Vec::new),
        on_status: Box::new(move |status| {
            send(&status_out, &status_line(status));
        }),
        prompt: false,
    })
}

pub fn start_frames(out: Out, sid: String) -> Sender<()> {
    let filter = Arc::new(Mutex::new(FrameFilter::default()));
    let sink_filter = filter.clone();
    let sink_out = out.clone();
    let error_out = out.clone();
    let stop_trace = start_present_trace(
        Arc::new(move |present| {
            let line = {
                let mut filter = sink_filter.lock().unwrap_or_else(PoisonError::into_inner);
                filter.game_pid = game_pid_for(&sid);
                filter.on_present(present)
            };
            if let Some(line) = line {
                send(&sink_out, &line::encode(&line));
            }
        }),
        Box::new(move |error| {
            send(&error_out, &failed_line(error));
        }),
    );
    let (stop, stopped) = mpsc::channel::<()>();
    thread::Builder::new()
        .name("frames-others".into())
        .spawn(move || {
            while let Err(RecvTimeoutError::Timeout) = stopped.recv_timeout(OTHERS_EVERY) {
                let others = filter.lock().unwrap_or_else(PoisonError::into_inner).take_others();
                if let Some(others) = others {
                    send(&out, &line::encode(&others));
                }
            }
            let _ = stop_trace.send(());
        })
        .expect("spawn thread");
    stop
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    const ME: &str = "S-1-5-21-1-2-3-1001";
    const OTHER: &str = "S-1-5-21-1-2-3-1002";

    fn owned(pid: u32, sid: Option<&str>) -> (u32, Option<String>) {
        (pid, sid.map(str::to_string))
    }

    #[test]
    fn only_a_game_owned_by_the_caller_is_picked() {
        let candidates = [owned(4, Some(OTHER)), owned(7, Some(ME)), owned(9, Some(ME))];
        assert_eq!(pick_game_pid(&candidates, ME), Some(7));
        assert_eq!(pick_game_pid(&candidates[..1], ME), None);
        assert_eq!(pick_game_pid(&[], ME), None);
    }

    #[test]
    fn a_game_with_an_unknown_owner_never_matches() {
        assert_eq!(pick_game_pid(&[owned(7, None)], ME), None);
        assert_eq!(pick_game_pid(&[owned(7, None), owned(8, Some(ME))], ME), Some(8));
    }

    #[test]
    fn game_pids_are_reused_while_fresh_and_looked_up_again_once_stale() {
        let mut cache = GamePids::new(Duration::from_secs(2));
        let t0 = Instant::now();
        assert_eq!(cache.get(ME, t0, || Some(7)), Some(7));
        assert_eq!(cache.get(ME, t0 + Duration::from_millis(1999), || panic!("looked up while fresh")), Some(7));
        assert_eq!(cache.get(ME, t0 + Duration::from_secs(2), || None), None);
        assert_eq!(cache.get(ME, t0 + Duration::from_secs(3), || panic!("a missing game is cached too")), None);
    }

    #[test]
    fn game_pids_are_kept_per_sid() {
        let mut cache = GamePids::new(Duration::from_secs(2));
        let t0 = Instant::now();
        assert_eq!(cache.get(ME, t0, || Some(7)), Some(7));
        assert_eq!(cache.get(OTHER, t0, || Some(9)), Some(9));
        assert_eq!(cache.get(ME, t0, || panic!("looked up while fresh")), Some(7));
    }

    #[test]
    fn packet_lines_are_the_wire_format() {
        let remote = SocketAddrV4::new(Ipv4Addr::new(155, 133, 226, 1), 27015);
        assert_eq!(packet_line(true, remote, 42), "P i 155.133.226.1 27015 42\n");
        assert_eq!(wire::decode_packet(&packet_line(false, remote, -5)), Some((false, remote, -5)));
    }

    #[test]
    fn net_statuses_become_error_lines() {
        assert_eq!(status_line(Status::Failed("no session\nhere".into())), "E no session here\n");
        let denied = wire::decode_error(&status_line(Status::NeedsPermission)).unwrap();
        assert!(denied.contains("rights"), "{denied}");
    }

    #[test]
    fn frame_trace_errors_carry_the_error_code() {
        assert_eq!(failed_line(CaptureError::NeedsAdmin), "X diagnostics.frame_trace_needs_admin\n");
        assert_eq!(
            line::decode(&failed_line(CaptureError::ReadFailed)),
            Some(FrameLine::Failed("diagnostics.frames_read_failed".into()))
        );
    }

    #[test]
    fn the_callers_game_frames_are_forwarded() {
        let mut filter = FrameFilter { game_pid: Some(42), others: 0 };
        assert_eq!(filter.on_present(Present::Frame { pid: Some(42), ticks: 7 }), Some(FrameLine::Present(7)));
        assert_eq!(filter.others, 0);
        assert_eq!(filter.take_others(), None);
    }

    #[test]
    fn other_frames_are_only_counted() {
        let mut filter = FrameFilter { game_pid: Some(42), others: 0 };
        assert_eq!(filter.on_present(Present::Frame { pid: Some(7), ticks: 1 }), None);
        assert_eq!(filter.on_present(Present::Frame { pid: None, ticks: 2 }), None);
        assert_eq!(filter.on_present(Present::Others(3)), None);
        assert_eq!(filter.others, 5);
    }

    #[test]
    fn without_a_game_every_frame_is_another_process() {
        let mut filter = FrameFilter::default();
        assert_eq!(filter.on_present(Present::Frame { pid: Some(42), ticks: 1 }), None);
        assert_eq!(filter.on_present(Present::Frame { pid: Some(0), ticks: 2 }), None);
        assert_eq!(filter.take_others(), Some(FrameLine::Others(2)));
    }

    #[test]
    fn others_are_taken_once_then_reset() {
        let mut filter = FrameFilter { game_pid: Some(42), others: 0 };
        filter.on_present(Present::Others(4));
        assert_eq!(filter.take_others(), Some(FrameLine::Others(4)));
        assert_eq!(filter.take_others(), None);
        filter.on_present(Present::Frame { pid: Some(1), ticks: 1 });
        assert_eq!(filter.take_others(), Some(FrameLine::Others(1)));
    }

    #[test]
    fn others_saturate_instead_of_wrapping() {
        let mut filter = FrameFilter { game_pid: Some(42), others: u32::MAX - 1 };
        filter.on_present(Present::Others(5));
        filter.on_present(Present::Frame { pid: Some(1), ticks: 1 });
        assert_eq!(filter.take_others(), Some(FrameLine::Others(u32::MAX)));
    }
}
