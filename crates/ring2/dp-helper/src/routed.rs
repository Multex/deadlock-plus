use std::io;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::Duration;

use dp_connection::{Config, Packet, Status};
use dp_firewall::{FirewallRuleSpec, RefreshReport};
use dp_frames::capture::{self, CaptureError, OnTraceError, Present, PresentSink};
use dp_frames::line::FrameLine;
use dp_privilege::Outcome;

use crate::client::{NetEvent, Session};
use crate::op::{Op, Reply, Trace};
use crate::route::{self, Route};
use crate::{args, helper_client, pipe, service_client};

const CALL_TIMEOUT: Duration = Duration::from_secs(10);
/// Covers the user reading the UAC prompt, and a demand-start service coming up.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Routed {
    NeedsPermission,
    Failed(String),
}

type Slot = Option<(Route, Arc<Session>)>;

static SESSION: Mutex<Slot> = Mutex::new(None);
/// Held across the UAC prompt instead of `SESSION`, so background work is not stuck behind the user reading it.
static LAUNCH: Mutex<()> = Mutex::new(());
static NET: TraceSlot = TraceSlot::new(Trace::Net);
static FRAMES: TraceSlot = TraceSlot::new(Trace::Frames);

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

fn live(slot: &mut Slot) -> Slot {
    if slot.as_ref().is_some_and(|(_, session)| !session.is_alive()) {
        *slot = None;
    }
    slot.clone()
}

pub fn route_now() -> Route {
    if dp_elevation::is_elevated() {
        return Route::InProcess;
    }
    let helper = matches!(live(&mut lock(&SESSION)), Some((Route::Helper, _)));
    route::route(false, service_client::approved(args::SERVICE_NAME), helper)
}

fn start_session(pipe: pipe::Pipe) -> io::Result<Arc<Session>> {
    let reader = pipe.try_clone()?;
    Ok(Session::start(reader, pipe))
}

fn connect_service(slot: &mut Slot) -> io::Result<Arc<Session>> {
    let pipe = service_client::connect(args::SERVICE_NAME, args::SERVICE_PIPE, CONNECT_TIMEOUT)?;
    let session = start_session(pipe)?;
    *slot = Some((Route::Service, Arc::clone(&session)));
    Ok(session)
}

/// A session with the privileged server, or `None` when the user has not allowed one yet. Never prompts.
fn remote() -> Option<Arc<Session>> {
    let mut slot = lock(&SESSION);
    let current = live(&mut slot);
    if let Some((Route::Service, session)) = current {
        return Some(session);
    }
    let helper = current.map(|(_, session)| session);
    match route::route(false, service_client::approved(args::SERVICE_NAME), helper.is_some()) {
        Route::Service => match connect_service(&mut slot) {
            Ok(session) => Some(session),
            // PermissionDenied: the user was approved after the service started, and Windows keeps a pipe's first
            // access list until the service restarts. Restarting it would end another user's trace.
            Err(e) => {
                log::warn!("could not reach the Deadlock+ service: {e}");
                helper
            }
        },
        Route::Helper => helper,
        Route::InProcess | Route::NeedsPermission => None,
    }
}

/// The live session, or a new helper behind one UAC prompt.
fn session_or_launch() -> Result<(Route, Arc<Session>), Outcome> {
    let _launching = lock(&LAUNCH);
    if let Some(current) = live(&mut lock(&SESSION)) {
        return Ok(current);
    }
    let exe =
        std::env::current_exe().map_err(|e| Outcome::Failed(format!("Could not find the Deadlock+ program: {e}")))?;
    let pipe = helper_client::launch(&exe, CONNECT_TIMEOUT)?;
    let session = start_session(pipe).map_err(|e| Outcome::Failed(format!("Could not use the helper pipe: {e}")))?;
    *lock(&SESSION) = Some((Route::Helper, Arc::clone(&session)));
    Ok((Route::Helper, session))
}

fn reply_unit(reply: Result<Reply, String>) -> Result<(), String> {
    match reply? {
        Reply::Ok {} => Ok(()),
        Reply::Error { message } => Err(message),
        Reply::Refreshed { .. } => Err("the privileged helper sent an unexpected reply".into()),
    }
}

fn reply_report(reply: Result<Reply, String>) -> Result<RefreshReport, String> {
    match reply? {
        Reply::Refreshed { updated, failed } => Ok(RefreshReport { updated, failed }),
        Reply::Error { message } => Err(message),
        Reply::Ok {} => Err("the privileged helper sent an unexpected reply".into()),
    }
}

fn call_unit(op: Op) -> Result<(), Routed> {
    let session = remote().ok_or(Routed::NeedsPermission)?;
    reply_unit(session.call(&op, CALL_TIMEOUT)).map_err(Routed::Failed)
}

pub fn block_groups(specs: &[FirewallRuleSpec]) -> Result<(), Routed> {
    if dp_elevation::is_elevated() {
        return dp_firewall::block_groups(specs).map_err(Routed::Failed);
    }
    // The server refuses an empty list, and there is nothing to do.
    if specs.is_empty() {
        return Ok(());
    }
    call_unit(Op::Block { groups: specs.to_vec() })
}

pub fn unblock_groups(group_ids: &[String]) -> Result<(), Routed> {
    if dp_elevation::is_elevated() {
        return dp_firewall::unblock_groups(group_ids).map_err(Routed::Failed);
    }
    if group_ids.is_empty() {
        return Ok(());
    }
    call_unit(Op::Unblock { group_ids: group_ids.to_vec() })
}

pub fn remove_rules_by_name(names: &[String]) -> Result<(), Routed> {
    if dp_elevation::is_elevated() {
        return dp_firewall::remove_rules_by_name(names).map_err(Routed::Failed);
    }
    if names.is_empty() {
        return Ok(());
    }
    call_unit(Op::RemoveExternal { names: names.to_vec() })
}

/// Matches `dp_server_picker::sync::Refresh`. Without a privileged server it only reads: the stale groups come back
/// as `failed`, and no prompt is ever raised, whatever `prompt` says.
pub fn refresh_stale_groups(specs: &[FirewallRuleSpec], prompt: bool) -> Result<RefreshReport, String> {
    if dp_elevation::is_elevated() {
        return dp_firewall::refresh_stale_groups(specs, prompt);
    }
    if specs.is_empty() {
        return Ok(RefreshReport::default());
    }
    match remote() {
        Some(session) => reply_report(session.call(&Op::RefreshStale { groups: specs.to_vec() }, CALL_TIMEOUT)),
        None => dp_firewall::stale_groups(specs).map(|failed| RefreshReport { updated: Vec::new(), failed }),
    }
}

/// Lets the first of several failure paths call a one-shot callback.
struct OneShot<F>(Mutex<Option<F>>);

impl<F> OneShot<F> {
    fn new(callback: F) -> Arc<Self> {
        Arc::new(OneShot(Mutex::new(Some(callback))))
    }

    fn take(&self) -> Option<F> {
        lock(&self.0).take()
    }
}

fn report_status(once: &OneShot<dp_connection::OnStatus>, status: Status) {
    if let Some(on_status) = once.take() {
        on_status(status);
    }
}

fn report_error(once: &OneShot<OnTraceError>, error: CaptureError) {
    if let Some(on_error) = once.take() {
        on_error(error);
    }
}

fn net_packet(event: NetEvent) -> Result<Packet, Status> {
    match event {
        // The server already kept only the caller's game.
        NetEvent::Packet { inbound, remote, ticks } => Ok(Packet { pid: None, remote, inbound, ticks_100ns: ticks }),
        NetEvent::Failed(message) => Err(Status::Failed(message)),
    }
}

fn capture_error(code: &str) -> CaptureError {
    [CaptureError::NeedsAdmin, CaptureError::HomeFolderNotFound, CaptureError::ReadFailed]
        .into_iter()
        .find(|error| serde_json::to_value(error).ok().as_ref().and_then(|v| v.as_str()) == Some(code))
        .unwrap_or(CaptureError::NeedsAdmin)
}

fn frame_present(line: FrameLine) -> Result<Present, CaptureError> {
    match line {
        FrameLine::Present(ticks) => Ok(Present::Frame { pid: None, ticks }),
        FrameLine::Others(count) => Ok(Present::Others(count)),
        FrameLine::Failed(code) => Err(capture_error(&code)),
    }
}

fn launch_status(outcome: Outcome) -> Status {
    match outcome {
        Outcome::Failed(message) => Status::Failed(message),
        Outcome::Applied | Outcome::Cancelled => Status::NeedsPermission,
    }
}

struct Running {
    id: u64,
    session: Arc<Session>,
}

/// One trace kind on the privileged server, which runs one per kind. The stop of a previous caller runs on its own
/// thread and can arrive after the next start, so a start stops whatever ran before and a late stop is ignored.
struct TraceSlot {
    trace: Trace,
    running: Mutex<Option<Running>>,
    next: AtomicU64,
}

impl TraceSlot {
    const fn new(trace: Trace) -> Self {
        TraceSlot { trace, running: Mutex::new(None), next: AtomicU64::new(0) }
    }

    fn begin(&self, session: Arc<Session>, install: impl FnOnce(&Session)) -> Result<u64, String> {
        let mut running = lock(&self.running);
        if let Some(old) = running.take() {
            self.end(&old.session);
        }
        install(&session);
        let start = match self.trace {
            Trace::Net => Op::StartNetTrace {},
            Trace::Frames => Op::StartFrameTrace {},
        };
        match reply_unit(session.call(&start, CALL_TIMEOUT)) {
            Ok(()) => {
                let id = self.next.fetch_add(1, Ordering::Relaxed);
                *running = Some(Running { id, session });
                Ok(id)
            }
            Err(e) => {
                // A start that timed out may still have begun on the server.
                self.end(&session);
                Err(e)
            }
        }
    }

    fn finish(&self, id: u64) {
        let mut running = lock(&self.running);
        if running.as_ref().is_some_and(|r| r.id == id) {
            if let Some(old) = running.take() {
                self.end(&old.session);
            }
        }
    }

    fn end(&self, session: &Session) {
        match self.trace {
            Trace::Net => session.set_net(None),
            Trace::Frames => session.set_frames(None),
        }
        if let Err(e) = reply_unit(session.call(&Op::Stop { trace: self.trace }, CALL_TIMEOUT)) {
            log::debug!("could not stop the {:?} trace: {e}", self.trace);
        }
    }
}

/// Matches `dp_connection::Start`. Sending on, or dropping, the returned channel stops the trace.
pub fn start_net(config: Config) -> Sender<()> {
    if dp_elevation::is_elevated() {
        return dp_connection::start(config);
    }
    let (stop, stopped) = mpsc::channel();
    thread::Builder::new().name("dp-helper-net".into()).spawn(move || run_net(config, stopped)).expect("spawn thread");
    stop
}

fn run_net(config: Config, stopped: Receiver<()>) {
    let Config { sink, on_status, prompt, .. } = config;
    let on_status = OneShot::new(on_status);
    let session = match remote() {
        Some(session) => session,
        None if prompt => match session_or_launch() {
            Ok((_, session)) => session,
            Err(outcome) => return report_status(&on_status, launch_status(outcome)),
        },
        None => return report_status(&on_status, Status::NeedsPermission),
    };
    let handler_status = Arc::clone(&on_status);
    let install = move |session: &Session| {
        session.set_net(Some(Arc::new(move |event| match net_packet(event) {
            Ok(packet) => sink(packet),
            Err(status) => report_status(&handler_status, status),
        })))
    };
    match NET.begin(session, install) {
        Ok(id) => {
            let _ = stopped.recv();
            NET.finish(id);
        }
        Err(e) => report_status(&on_status, Status::Failed(e)),
    }
}

/// Matches `dp_frames::capture::PresentSource`. Never prompts: a missing grant reports `NeedsAdmin`.
pub fn start_frames(sink: PresentSink, on_error: OnTraceError) -> Sender<()> {
    if dp_elevation::is_elevated() {
        return capture::start_present_trace(sink, on_error);
    }
    let (stop, stopped) = mpsc::channel();
    thread::Builder::new()
        .name("dp-helper-frames".into())
        .spawn(move || run_frames(sink, on_error, stopped))
        .expect("spawn thread");
    stop
}

fn run_frames(sink: PresentSink, on_error: OnTraceError, stopped: Receiver<()>) {
    let on_error = OneShot::new(on_error);
    let Some(session) = remote() else {
        return report_error(&on_error, CaptureError::NeedsAdmin);
    };
    let handler_error = Arc::clone(&on_error);
    let install = move |session: &Session| {
        session.set_frames(Some(Arc::new(move |line| match frame_present(line) {
            Ok(present) => sink(present),
            Err(error) => report_error(&handler_error, error),
        })))
    };
    match FRAMES.begin(session, install) {
        Ok(id) => {
            let _ = stopped.recv();
            FRAMES.finish(id);
        }
        Err(e) => report_error(&on_error, capture_error(&e)),
    }
}

/// Callers check `dp_privilege::may_prompt` first. "Always allow" keeps the helper when the service cannot be set up,
/// so the user is simply asked again next time.
pub fn allow(always: bool) -> Outcome {
    if dp_elevation::is_elevated() {
        return Outcome::Applied;
    }
    let (route, session) = match session_or_launch() {
        Ok(current) => current,
        Err(outcome) => return outcome,
    };
    if !always || route == Route::Service {
        return Outcome::Applied;
    }
    match reply_unit(session.call(&Op::Approve {}, CALL_TIMEOUT)) {
        Ok(()) => Outcome::Applied,
        Err(message) => Outcome::Failed(message),
    }
}

pub fn revoke() -> Result<(), String> {
    if dp_elevation::is_elevated() {
        return Err("Deadlock+ is running as administrator, so it cannot reach the Deadlock+ service.".into());
    }
    let session = {
        let mut slot = lock(&SESSION);
        match live(&mut slot) {
            Some((Route::Service, session)) => session,
            _ if service_client::approved(args::SERVICE_NAME) => {
                connect_service(&mut slot).map_err(|e| format!("Could not reach the Deadlock+ service: {e}"))?
            }
            _ => return Err("Always allow is not turned on.".into()),
        }
    };
    reply_unit(session.call(&Op::Revoke {}, CALL_TIMEOUT))?;
    let mut slot = lock(&SESSION);
    if slot.as_ref().is_some_and(|(_, current)| Arc::ptr_eq(current, &session)) {
        *slot = None;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use dp_frames::line;
    use std::io::{BufRead, BufReader, PipeReader, PipeWriter, Write};
    use std::net::{Ipv4Addr, SocketAddrV4};
    use std::path::Path;
    use std::process::{Command, Stdio};

    const LONG: Duration = Duration::from_secs(10);

    fn remote_addr() -> SocketAddrV4 {
        SocketAddrV4::new(Ipv4Addr::new(155, 133, 226, 1), 27015)
    }

    #[test]
    fn unit_replies_map_to_results() {
        assert_eq!(reply_unit(Ok(Reply::Ok {})), Ok(()));
        assert_eq!(reply_unit(Ok(Reply::Error { message: "busy".into() })), Err("busy".into()));
        assert!(reply_unit(Ok(Reply::Refreshed { updated: vec![], failed: vec![] })).is_err());
        assert_eq!(reply_unit(Err("gone".into())), Err("gone".into()));
    }

    #[test]
    fn refresh_replies_map_to_reports() {
        let report =
            reply_report(Ok(Reply::Refreshed { updated: vec!["a".into()], failed: vec!["b".into()] })).unwrap();
        assert_eq!((report.updated, report.failed), (vec!["a".to_string()], vec!["b".to_string()]));
        assert!(reply_report(Ok(Reply::Ok {})).is_err());
        assert_eq!(reply_report(Ok(Reply::Error { message: "no".into() })).unwrap_err(), "no");
        assert_eq!(reply_report(Err("gone".into())).unwrap_err(), "gone");
    }

    #[test]
    fn capture_error_codes_round_trip_and_unknown_codes_need_admin() {
        for error in [CaptureError::NeedsAdmin, CaptureError::HomeFolderNotFound, CaptureError::ReadFailed] {
            let code = serde_json::to_value(error).unwrap();
            assert_eq!(capture_error(code.as_str().unwrap()), error);
        }
        assert_eq!(capture_error("busy"), CaptureError::NeedsAdmin);
        assert_eq!(capture_error(""), CaptureError::NeedsAdmin);
    }

    #[test]
    fn frame_lines_map_to_presents() {
        assert_eq!(frame_present(FrameLine::Present(77)), Ok(Present::Frame { pid: None, ticks: 77 }));
        assert_eq!(frame_present(FrameLine::Others(3)), Ok(Present::Others(3)));
        assert_eq!(
            frame_present(FrameLine::Failed("diagnostics.frames_read_failed".into())),
            Err(CaptureError::ReadFailed)
        );
        assert_eq!(
            frame_present(FrameLine::Failed("the privileged helper exited".into())),
            Err(CaptureError::NeedsAdmin)
        );
    }

    #[test]
    fn net_events_map_to_packets_without_a_pid() {
        let Ok(packet) = net_packet(NetEvent::Packet { inbound: true, remote: remote_addr(), ticks: -5 }) else {
            panic!("a packet was not delivered");
        };
        assert_eq!((packet.pid, packet.remote, packet.inbound, packet.ticks_100ns), (None, remote_addr(), true, -5));
        assert!(matches!(net_packet(NetEvent::Failed("x".into())), Err(Status::Failed(m)) if m == "x"));
    }

    #[test]
    fn a_dismissed_prompt_still_needs_permission() {
        assert!(matches!(launch_status(Outcome::Cancelled), Status::NeedsPermission));
        assert!(matches!(launch_status(Outcome::Failed("no".into())), Status::Failed(m) if m == "no"));
    }

    struct Server {
        requests: BufReader<PipeReader>,
        replies: PipeWriter,
    }

    impl Server {
        fn expect(&mut self, op: &Op) {
            let mut line = String::new();
            self.requests.read_line(&mut line).unwrap();
            assert_eq!(line, crate::op::encode(op));
        }

        fn reply(&mut self, reply: &Reply) {
            self.replies.write_all(crate::op::encode_reply(reply).as_bytes()).unwrap();
        }

        fn write(&mut self, line: &str) {
            self.replies.write_all(line.as_bytes()).unwrap();
        }
    }

    fn fake_session() -> (Arc<Session>, Server) {
        let (requests, request_writer) = io::pipe().unwrap();
        let (reply_reader, replies) = io::pipe().unwrap();
        (Session::start(reply_reader, request_writer), Server { requests: BufReader::new(requests), replies })
    }

    fn counting_install(tx: mpsc::Sender<FrameLine>) -> impl FnOnce(&Session) {
        move |session: &Session| {
            session.set_frames(Some(Arc::new(move |line| {
                let _ = tx.send(line);
            })))
        }
    }

    #[test]
    fn a_trace_starts_delivers_and_stops_once() {
        let slot = TraceSlot::new(Trace::Frames);
        let (session, mut server) = fake_session();
        let (tx, rx) = mpsc::channel();
        let fake = thread::spawn(move || {
            server.expect(&Op::StartFrameTrace {});
            server.write(&line::encode(&FrameLine::Present(5)));
            server.reply(&Reply::Ok {});
            server.expect(&Op::Stop { trace: Trace::Frames });
            server.reply(&Reply::Ok {});
            server
        });
        let id = slot.begin(Arc::clone(&session), counting_install(tx)).unwrap();
        assert_eq!(rx.recv_timeout(LONG), Ok(FrameLine::Present(5)));
        slot.finish(id);
        slot.finish(id);
        let mut server = fake.join().unwrap();
        server.write(&line::encode(&FrameLine::Present(6)));
        server.reply(&Reply::Ok {});
        assert_eq!(session.call(&Op::Approve {}, LONG), Ok(Reply::Ok {}));
        assert!(rx.try_recv().is_err(), "the handler was not cleared");
    }

    #[test]
    fn a_new_start_stops_the_previous_trace_and_its_late_stop_is_ignored() {
        let slot = TraceSlot::new(Trace::Net);
        let (session, mut server) = fake_session();
        let fake = thread::spawn(move || {
            server.expect(&Op::StartNetTrace {});
            server.reply(&Reply::Ok {});
            server.expect(&Op::Stop { trace: Trace::Net });
            server.reply(&Reply::Ok {});
            server.expect(&Op::StartNetTrace {});
            server.reply(&Reply::Ok {});
            server.expect(&Op::Stop { trace: Trace::Net });
            server.reply(&Reply::Ok {});
        });
        let first = slot.begin(Arc::clone(&session), |_| {}).unwrap();
        let second = slot.begin(Arc::clone(&session), |_| {}).unwrap();
        slot.finish(first);
        assert_eq!(lock(&slot.running).as_ref().map(|r| r.id), Some(second), "a late stop ended the new trace");
        slot.finish(second);
        fake.join().unwrap();
    }

    #[test]
    fn a_refused_start_is_reported_and_stopped() {
        let slot = TraceSlot::new(Trace::Frames);
        let (session, mut server) = fake_session();
        let fake = thread::spawn(move || {
            server.expect(&Op::StartFrameTrace {});
            server.reply(&Reply::Error { message: "busy".into() });
            server.expect(&Op::Stop { trace: Trace::Frames });
            server.reply(&Reply::Error { message: "not running".into() });
        });
        let (tx, _rx) = mpsc::channel();
        assert_eq!(slot.begin(session, counting_install(tx)), Err("busy".into()));
        fake.join().unwrap();
    }

    /// These act through the real routing, so they only run where nothing could be granted.
    fn unprivileged() -> bool {
        if dp_elevation::is_elevated() {
            return false;
        }
        let root = std::env::var_os("SystemRoot").expect("SystemRoot");
        let status = Command::new(Path::new(&root).join("System32").join("sc.exe"))
            .args(["query", args::SERVICE_NAME])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap();
        // ERROR_SERVICE_DOES_NOT_EXIST
        status.code() == Some(1060)
    }

    fn test_spec() -> FirewallRuleSpec {
        FirewallRuleSpec {
            group_id: "dp-helper-routed-test".into(),
            description: "Deadlock+ routed test".into(),
            relay_ips: vec!["155.133.226.1".into()],
        }
    }

    #[test]
    fn without_a_grant_the_route_needs_permission() {
        if !unprivileged() {
            return;
        }
        assert_eq!(route_now(), Route::NeedsPermission);
    }

    #[test]
    fn blocking_without_a_grant_needs_permission_and_launches_nothing() {
        if !unprivileged() {
            return;
        }
        assert_eq!(block_groups(&[test_spec()]), Err(Routed::NeedsPermission));
        assert!(lock(&SESSION).is_none());
        assert_eq!(route_now(), Route::NeedsPermission);
    }

    #[test]
    fn refreshing_without_a_grant_only_reads() {
        if !unprivileged() {
            return;
        }
        let report = refresh_stale_groups(&[test_spec()], true).unwrap();
        assert!(report.updated.is_empty() && report.failed.is_empty(), "{report:?}");
        assert!(lock(&SESSION).is_none());
    }

    #[test]
    fn a_net_trace_without_a_grant_reports_needs_permission() {
        if !unprivileged() {
            return;
        }
        let (tx, rx) = mpsc::channel();
        let config = Config {
            wanted: Arc::new(|_| true),
            sink: Arc::new(|_| {}),
            remotes: Arc::new(Vec::new),
            on_status: Box::new(move |status| {
                let _ = tx.send(matches!(status, Status::NeedsPermission));
            }),
            prompt: false,
        };
        let _stop = start_net(config);
        assert_eq!(rx.recv_timeout(LONG), Ok(true));
    }

    #[test]
    fn a_frame_trace_without_a_grant_needs_admin() {
        if !unprivileged() {
            return;
        }
        let (tx, rx) = mpsc::channel();
        let _stop = start_frames(
            Arc::new(|_| {}),
            Box::new(move |error| {
                let _ = tx.send(error);
            }),
        );
        assert_eq!(rx.recv_timeout(LONG), Ok(CaptureError::NeedsAdmin));
    }
}
