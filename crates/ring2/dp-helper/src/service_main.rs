use std::collections::HashSet;
use std::ffi::c_void;
use std::io::{self, BufReader};
use std::panic::{self, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock, PoisonError, RwLock};
use std::thread;
use std::time::{Duration, Instant};

use windows::core::{HRESULT, PCWSTR, PWSTR};
use windows::Win32::Foundation::{
    ERROR_CALL_NOT_IMPLEMENTED, ERROR_FAILED_SERVICE_CONTROLLER_CONNECT, ERROR_SERVICE_SPECIFIC_ERROR, NO_ERROR,
};
use windows::Win32::System::Services::{
    RegisterServiceCtrlHandlerExW, SetServiceStatus, StartServiceCtrlDispatcherW, SERVICE_ACCEPT_SHUTDOWN,
    SERVICE_ACCEPT_STOP, SERVICE_CONTROL_INTERROGATE, SERVICE_CONTROL_SHUTDOWN, SERVICE_CONTROL_STOP, SERVICE_RUNNING,
    SERVICE_START_PENDING, SERVICE_STATUS, SERVICE_STATUS_CURRENT_STATE, SERVICE_STATUS_HANDLE, SERVICE_STOPPED,
    SERVICE_STOP_PENDING, SERVICE_TABLE_ENTRYW, SERVICE_WIN32_OWN_PROCESS,
};

use crate::access::ApprovedSids;
use crate::args::{SERVICE_NAME, SERVICE_PIPE};
use crate::dispatch::{self, capture_running, Ctx, ServiceCtx, Starters, Traces};
use crate::idle::{self, IdleFacts};
use crate::listener::{self, OnClient};
use crate::op::{Op, Reply};
use crate::pipe::Pipe;
use crate::relays::RelayCache;
use crate::serve::{self, Mode, Out};
use crate::{logfile, paths, store};

pub const EXIT_OK: i32 = 0;
/// The exe was started with `--service` by something other than the service control manager, e.g. a console.
pub const EXIT_NOT_A_SERVICE: i32 = 20;
pub const EXIT_DISPATCHER_FAILED: i32 = 21;

/// The service-specific exit code reported with `ERROR_SERVICE_SPECIFIC_ERROR` for a failure without a Windows code.
pub const SPECIFIC_FAILURE: u32 = 1;

const TICK: Duration = Duration::from_secs(1);
const START_WAIT_HINT_MS: u32 = 10_000;
const STOP_WAIT_HINT_MS: u32 = 5_000;
/// A trace stops on its own thread after the stop message; ETW sessions outlive the process, so the process waits a
/// moment before it exits.
const TRACE_STOP_GRACE: Duration = Duration::from_secs(2);
const STOPPING: &str = "the service is stopping";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct ExitCode {
    win32: u32,
    specific: u32,
}

#[derive(Debug, PartialEq, Eq)]
struct ControlReply {
    code: u32,
    stop: bool,
}

#[derive(Debug, PartialEq, Eq)]
enum Reason {
    Requested,
    Idle,
}

fn dispatcher_exit_code(result: Result<(), HRESULT>) -> i32 {
    match result {
        Ok(()) => EXIT_OK,
        Err(code) if code == ERROR_FAILED_SERVICE_CONTROLLER_CONNECT.to_hresult() => EXIT_NOT_A_SERVICE,
        Err(_) => EXIT_DISPATCHER_FAILED,
    }
}

/// INTERROGATE needs no status report: the SCM already holds the last one.
fn control_reply(control: u32) -> ControlReply {
    match control {
        SERVICE_CONTROL_STOP | SERVICE_CONTROL_SHUTDOWN => ControlReply { code: NO_ERROR.0, stop: true },
        SERVICE_CONTROL_INTERROGATE => ControlReply { code: NO_ERROR.0, stop: false },
        _ => ControlReply { code: ERROR_CALL_NOT_IMPLEMENTED.0, stop: false },
    }
}

fn status(state: SERVICE_STATUS_CURRENT_STATE, checkpoint: u32, exit: ExitCode) -> SERVICE_STATUS {
    let (checkpoint, wait_hint) = match state {
        SERVICE_START_PENDING => (checkpoint, START_WAIT_HINT_MS),
        SERVICE_STOP_PENDING => (checkpoint, STOP_WAIT_HINT_MS),
        _ => (0, 0),
    };
    SERVICE_STATUS {
        dwServiceType: SERVICE_WIN32_OWN_PROCESS,
        dwCurrentState: state,
        dwControlsAccepted: if state == SERVICE_RUNNING { SERVICE_ACCEPT_STOP | SERVICE_ACCEPT_SHUTDOWN } else { 0 },
        dwWin32ExitCode: exit.win32,
        dwServiceSpecificExitCode: exit.specific,
        dwCheckPoint: checkpoint,
        dwWaitHint: wait_hint,
    }
}

fn exit_code(error: Option<&io::Error>) -> ExitCode {
    match error.map(io::Error::raw_os_error) {
        None => ExitCode::default(),
        Some(Some(code)) if code != 0 => ExitCode { win32: code as u32, specific: 0 },
        Some(_) => ExitCode { win32: ERROR_SERVICE_SPECIFIC_ERROR.0, specific: SPECIFIC_FAILURE },
    }
}

fn exit_reason(stop_requested: bool, facts: &IdleFacts) -> Option<Reason> {
    if stop_requested {
        Some(Reason::Requested)
    } else if idle::should_exit(facts) {
        Some(Reason::Idle)
    } else {
        None
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

/// Shared by every connection of one service run.
struct Shared {
    approved: Arc<Mutex<ApprovedSids>>,
    stop: Arc<AtomicBool>,
    traces: Arc<Mutex<Traces>>,
    starters: Starters,
    relays: Mutex<RelayCache>,
    last_request: Mutex<Instant>,
    next_conn: AtomicU64,
    active: Mutex<HashSet<u64>>,
    /// Requests hold it for reading while they run, so once `close` holds it for writing no trace can start.
    closing: RwLock<bool>,
}

impl Shared {
    fn new(approved: ApprovedSids, stop: Arc<AtomicBool>, starters: Starters) -> Self {
        Self {
            approved: Arc::new(Mutex::new(approved)),
            stop,
            traces: Arc::new(Mutex::new(Traces::default())),
            starters,
            relays: Mutex::new(RelayCache::new()),
            last_request: Mutex::new(Instant::now()),
            next_conn: AtomicU64::new(1),
            active: Mutex::new(HashSet::new()),
            closing: RwLock::new(false),
        }
    }

    fn connect(&self, sid: String, out: Out) -> Ctx {
        let conn = self.next_conn.fetch_add(1, Ordering::Relaxed);
        lock(&self.active).insert(conn);
        Ctx {
            mode: Mode::Service,
            sid,
            out,
            conn,
            traces: Arc::clone(&self.traces),
            starters: self.starters,
            service: Some(ServiceCtx { approved: Arc::clone(&self.approved), stop: Arc::clone(&self.stop) }),
        }
    }

    fn disconnect(&self, ctx: &Ctx) {
        dispatch::connection_closed(ctx);
        lock(&self.active).remove(&ctx.conn);
    }

    fn touch(&self) {
        *lock(&self.last_request) = Instant::now();
    }

    fn exec(&self, ctx: &Ctx, op: Op) -> Reply {
        let closing = self.closing.read().unwrap_or_else(PoisonError::into_inner);
        if *closing {
            return Reply::Error { message: STOPPING.into() };
        }
        let reply = dispatch::exec(ctx, op);
        if let Reply::Error { message } = &reply {
            log::warn!("connection {}: request refused: {message}", ctx.conn);
        }
        reply
    }

    fn idle_facts(&self) -> IdleFacts {
        IdleFacts {
            since_last_request: lock(&self.last_request).elapsed(),
            capture_running: capture_running(&lock(&self.traces)),
            owner_alive: None,
        }
    }

    /// Stops every trace and refuses later requests. Returns whether a trace was running.
    fn close(&self) -> bool {
        self.stop.store(true, Ordering::SeqCst);
        *self.closing.write().unwrap_or_else(PoisonError::into_inner) = true;
        let had_capture = capture_running(&lock(&self.traces));
        let active: Vec<u64> = lock(&self.active).iter().copied().collect();
        for conn in active {
            let out: Out = Arc::new(Mutex::new(io::sink()));
            dispatch::connection_closed(&Ctx {
                mode: Mode::Service,
                sid: String::new(),
                out,
                conn,
                traces: Arc::clone(&self.traces),
                starters: self.starters,
                service: None,
            });
        }
        had_capture
    }
}

fn serve_client(shared: &Shared, pipe: Pipe, sid: String) {
    let writer = match pipe.try_clone() {
        Ok(writer) => writer,
        Err(e) => {
            log::warn!("could not open the reply side of a connection: {e}");
            return;
        }
    };
    let out: Out = Arc::new(Mutex::new(writer));
    let ctx = shared.connect(sid, Arc::clone(&out));
    log::info!("connection {} opened for {}", ctx.conn, ctx.sid);
    serve::serve(
        BufReader::new(&pipe),
        &out,
        Mode::Service,
        &|refresh| lock(&shared.relays).get(refresh),
        &|| shared.touch(),
        &mut |op| shared.exec(&ctx, op),
    );
    shared.disconnect(&ctx);
    log::info!("connection {} closed", ctx.conn);
}

/// Waits for STOP, SHUTDOWN, a revoke that deleted the service, the idle timeout or a listener failure.
fn watch(shared: &Shared, listen_done: &Receiver<io::Result<()>>) -> Option<io::Error> {
    loop {
        match listen_done.recv_timeout(TICK) {
            Ok(Ok(())) => return None,
            Ok(Err(e)) => {
                log::error!("the service pipe failed: {e}");
                return Some(e);
            }
            Err(RecvTimeoutError::Disconnected) => {
                log::error!("the pipe listener ended without a result");
                return Some(io::Error::other("the pipe listener ended without a result"));
            }
            Err(RecvTimeoutError::Timeout) => {}
        }
        if let Some(reason) = exit_reason(shared.stop.load(Ordering::SeqCst), &shared.idle_facts()) {
            log::info!("service stopping: {reason:?}");
            return None;
        }
    }
}

fn stop_flag() -> &'static Arc<AtomicBool> {
    static STOP: OnceLock<Arc<AtomicBool>> = OnceLock::new();
    STOP.get_or_init(Arc::default)
}

extern "system" fn on_control(control: u32, _event: u32, _data: *mut c_void, _context: *mut c_void) -> u32 {
    let reply = control_reply(control);
    if reply.stop {
        stop_flag().store(true, Ordering::SeqCst);
    }
    reply.code
}

struct Reporter {
    handle: SERVICE_STATUS_HANDLE,
    checkpoint: u32,
}

impl Reporter {
    fn report(&mut self, state: SERVICE_STATUS_CURRENT_STATE, exit: ExitCode) {
        self.checkpoint += 1;
        let status = status(state, self.checkpoint, exit);
        // SAFETY: `handle` came from RegisterServiceCtrlHandlerExW for this service; `status` outlives the call.
        if let Err(e) = unsafe { SetServiceStatus(self.handle, &status) } {
            log::warn!("could not report the service state: {e}");
        }
    }
}

fn init_logging() {
    let Some(path) = paths::program_data().and_then(|dir| logfile::default_path(Some(dir.into_os_string()))) else {
        return;
    };
    if logfile::init(&path) {
        log::info!("service starting");
    }
}

fn serve_until_stopped(reporter: &mut Reporter) -> ExitCode {
    let approved = match store::load(SERVICE_NAME) {
        Ok(approved) => approved,
        Err(e) => {
            log::error!("could not read the approved accounts: {e}");
            return exit_code(Some(&e));
        }
    };
    let shared = Arc::new(Shared::new(approved, Arc::clone(stop_flag()), Starters::REAL));
    let (done_tx, listen_done) = mpsc::channel();
    let spawned = {
        let shared = Arc::clone(&shared);
        thread::Builder::new().name("dp-helper-listen".into()).spawn(move || {
            let on_client: OnClient = {
                let shared = Arc::clone(&shared);
                Arc::new(move |pipe, sid| serve_client(&shared, pipe, sid))
            };
            let result =
                listener::listen(SERVICE_PIPE, Arc::clone(&shared.approved), on_client, Arc::clone(&shared.stop));
            let _ = done_tx.send(result);
        })
    };
    if let Err(e) = spawned {
        log::error!("could not start the pipe listener: {e}");
        return exit_code(Some(&e));
    }
    reporter.report(SERVICE_RUNNING, ExitCode::default());
    log::info!("service running");
    let failure = watch(&shared, &listen_done);
    reporter.report(SERVICE_STOP_PENDING, ExitCode::default());
    if shared.close() {
        thread::sleep(TRACE_STOP_GRACE);
    }
    exit_code(failure.as_ref())
}

extern "system" fn service_main(_argc: u32, _argv: *mut PWSTR) {
    init_logging();
    let name = wide(SERVICE_NAME);
    // SAFETY: `name` is NUL-terminated and outlives the call; `on_control` has the handler signature and reads no
    // context, so none is passed.
    let handle = match unsafe { RegisterServiceCtrlHandlerExW(PCWSTR(name.as_ptr()), Some(on_control), None) } {
        Ok(handle) => handle,
        Err(e) => {
            log::error!("could not register the service control handler: {e}");
            return;
        }
    };
    let mut reporter = Reporter { handle, checkpoint: 0 };
    reporter.report(SERVICE_START_PENDING, ExitCode::default());
    // A panic must still end in SERVICE_STOPPED: without it the dispatcher in `run` never returns.
    let exit = panic::catch_unwind(AssertUnwindSafe(|| serve_until_stopped(&mut reporter))).unwrap_or_else(|_| {
        log::error!("the service stopped on a panic");
        ExitCode { win32: ERROR_SERVICE_SPECIFIC_ERROR.0, specific: SPECIFIC_FAILURE }
    });
    log::info!("service stopped");
    reporter.report(SERVICE_STOPPED, exit);
}

/// Hands the main thread to the service control manager until the service stops. Started any other way it returns
/// [`EXIT_NOT_A_SERVICE`] at once.
pub fn run() -> i32 {
    let mut name = wide(SERVICE_NAME);
    let table = [
        SERVICE_TABLE_ENTRYW { lpServiceName: PWSTR(name.as_mut_ptr()), lpServiceProc: Some(service_main) },
        SERVICE_TABLE_ENTRYW::default(),
    ];
    // SAFETY: the table ends with an all-null entry, and it and `name` outlive the call, which returns only after
    // the service has stopped.
    let result = unsafe { StartServiceCtrlDispatcherW(table.as_ptr()) }.map_err(|e| e.code());
    if let Err(code) = result {
        // The file logger is installed only once the SCM runs the service, so a console start never creates the
        // log folder in ProgramData.
        eprintln!("not started by the service control manager: {code}");
    }
    dispatcher_exit_code(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::{channel, Sender};

    use windows::Win32::Foundation::{ERROR_ACCESS_DENIED, ERROR_FILE_NOT_FOUND};
    use windows::Win32::System::Services::SERVICE_CONTROL_PAUSE;

    #[test]
    fn run_from_a_test_process_returns_the_console_code_promptly() {
        let begin = Instant::now();
        assert_eq!(run(), EXIT_NOT_A_SERVICE);
        assert!(begin.elapsed() < Duration::from_secs(5), "{:?}", begin.elapsed());
    }

    #[test]
    fn dispatcher_exit_codes() {
        assert_eq!(dispatcher_exit_code(Ok(())), EXIT_OK);
        assert_eq!(dispatcher_exit_code(Err(ERROR_FAILED_SERVICE_CONTROLLER_CONNECT.to_hresult())), EXIT_NOT_A_SERVICE);
        assert_eq!(dispatcher_exit_code(Err(ERROR_ACCESS_DENIED.to_hresult())), EXIT_DISPATCHER_FAILED);
    }

    #[test]
    fn exit_codes_are_distinct() {
        assert_ne!(EXIT_OK, EXIT_NOT_A_SERVICE);
        assert_ne!(EXIT_OK, EXIT_DISPATCHER_FAILED);
        assert_ne!(EXIT_NOT_A_SERVICE, EXIT_DISPATCHER_FAILED);
    }

    #[test]
    fn control_replies() {
        let stop = ControlReply { code: NO_ERROR.0, stop: true };
        assert_eq!(control_reply(SERVICE_CONTROL_STOP), stop);
        assert_eq!(control_reply(SERVICE_CONTROL_SHUTDOWN), stop);
        assert_eq!(control_reply(SERVICE_CONTROL_INTERROGATE), ControlReply { code: NO_ERROR.0, stop: false });
        assert_eq!(
            control_reply(SERVICE_CONTROL_PAUSE),
            ControlReply { code: ERROR_CALL_NOT_IMPLEMENTED.0, stop: false }
        );
        assert_eq!(control_reply(0xdead), ControlReply { code: ERROR_CALL_NOT_IMPLEMENTED.0, stop: false });
    }

    #[test]
    fn only_running_accepts_stop_and_shutdown() {
        let none = ExitCode::default();
        assert_eq!(status(SERVICE_RUNNING, 3, none).dwControlsAccepted, SERVICE_ACCEPT_STOP | SERVICE_ACCEPT_SHUTDOWN);
        for state in [SERVICE_START_PENDING, SERVICE_STOP_PENDING, SERVICE_STOPPED] {
            assert_eq!(status(state, 3, none).dwControlsAccepted, 0, "{state:?}");
        }
    }

    #[test]
    fn only_pending_states_carry_a_checkpoint_and_wait_hint() {
        let none = ExitCode::default();
        let start = status(SERVICE_START_PENDING, 2, none);
        assert_eq!((start.dwCheckPoint, start.dwWaitHint), (2, START_WAIT_HINT_MS));
        let stop = status(SERVICE_STOP_PENDING, 5, none);
        assert_eq!((stop.dwCheckPoint, stop.dwWaitHint), (5, STOP_WAIT_HINT_MS));
        for state in [SERVICE_RUNNING, SERVICE_STOPPED] {
            let s = status(state, 7, none);
            assert_eq!((s.dwCheckPoint, s.dwWaitHint), (0, 0), "{state:?}");
        }
    }

    #[test]
    fn status_carries_the_exit_code_and_own_process_type() {
        let exit = ExitCode { win32: ERROR_SERVICE_SPECIFIC_ERROR.0, specific: SPECIFIC_FAILURE };
        let s = status(SERVICE_STOPPED, 1, exit);
        assert_eq!(s.dwServiceType, SERVICE_WIN32_OWN_PROCESS);
        assert_eq!(s.dwCurrentState, SERVICE_STOPPED);
        assert_eq!(
            (s.dwWin32ExitCode, s.dwServiceSpecificExitCode),
            (ERROR_SERVICE_SPECIFIC_ERROR.0, SPECIFIC_FAILURE)
        );
    }

    #[test]
    fn exit_code_mapping() {
        assert_eq!(exit_code(None), ExitCode::default());
        let os = io::Error::from_raw_os_error(ERROR_FILE_NOT_FOUND.0 as i32);
        assert_eq!(exit_code(Some(&os)), ExitCode { win32: ERROR_FILE_NOT_FOUND.0, specific: 0 });
        let plain = io::Error::new(io::ErrorKind::InvalidData, "no pipe descriptor");
        assert_eq!(
            exit_code(Some(&plain)),
            ExitCode { win32: ERROR_SERVICE_SPECIFIC_ERROR.0, specific: SPECIFIC_FAILURE }
        );
        let zero = io::Error::from_raw_os_error(0);
        assert_eq!(exit_code(Some(&zero)).win32, ERROR_SERVICE_SPECIFIC_ERROR.0);
    }

    fn facts(secs: u64, capture_running: bool) -> IdleFacts {
        IdleFacts { since_last_request: Duration::from_secs(secs), capture_running, owner_alive: None }
    }

    #[test]
    fn exit_reasons() {
        assert_eq!(exit_reason(false, &facts(0, false)), None);
        assert_eq!(exit_reason(false, &facts(299, false)), None);
        assert_eq!(exit_reason(false, &facts(300, false)), Some(Reason::Idle));
        assert_eq!(exit_reason(false, &facts(3600, true)), None);
        assert_eq!(exit_reason(true, &facts(0, true)), Some(Reason::Requested));
        assert_eq!(exit_reason(true, &facts(3600, false)), Some(Reason::Requested));
    }

    fn fake_start(_: Out, _: String) -> Sender<()> {
        channel().0
    }

    const FAKE: Starters = Starters { net: fake_start, frames: fake_start };
    const SID: &str = "S-1-5-21-1-2-3-1001";

    fn shared() -> Shared {
        Shared::new(ApprovedSids::from_stored(vec![SID.into()]), Arc::default(), FAKE)
    }

    fn sink() -> Out {
        Arc::new(Mutex::new(io::sink()))
    }

    #[test]
    fn connections_get_distinct_ids_and_the_service_ctx() {
        let s = shared();
        let a = s.connect(SID.into(), sink());
        let b = s.connect(SID.into(), sink());
        assert_ne!(a.conn, b.conn);
        assert_eq!(a.mode, Mode::Service);
        assert!(a.service.is_some());
        assert_eq!(*lock(&s.active), HashSet::from([a.conn, b.conn]));
        s.disconnect(&a);
        assert_eq!(*lock(&s.active), HashSet::from([b.conn]));
    }

    #[test]
    fn disconnect_stops_only_that_connections_trace() {
        let s = shared();
        let a = s.connect(SID.into(), sink());
        let b = s.connect(SID.into(), sink());
        assert_eq!(s.exec(&a, Op::StartNetTrace {}), Reply::Ok {});
        assert_eq!(s.exec(&b, Op::StartFrameTrace {}), Reply::Ok {});
        s.disconnect(&a);
        assert!(s.idle_facts().capture_running);
        s.disconnect(&b);
        assert!(!s.idle_facts().capture_running);
    }

    #[test]
    fn close_stops_every_trace_and_refuses_later_requests() {
        let s = shared();
        let a = s.connect(SID.into(), sink());
        let b = s.connect(SID.into(), sink());
        s.exec(&a, Op::StartNetTrace {});
        s.exec(&b, Op::StartFrameTrace {});
        assert!(s.close());
        assert!(s.stop.load(Ordering::SeqCst));
        assert!(!s.idle_facts().capture_running);
        assert_eq!(s.exec(&a, Op::StartNetTrace {}), Reply::Error { message: STOPPING.into() });
        assert!(!s.idle_facts().capture_running);
    }

    #[test]
    fn close_without_a_trace_reports_none() {
        let s = shared();
        let _a = s.connect(SID.into(), sink());
        assert!(!s.close());
    }

    #[test]
    fn touch_resets_the_shared_idle_clock() {
        let s = shared();
        *lock(&s.last_request) = Instant::now() - Duration::from_secs(400);
        assert!(s.idle_facts().since_last_request >= Duration::from_secs(400));
        s.touch();
        assert!(s.idle_facts().since_last_request < Duration::from_secs(5));
        assert_eq!(s.idle_facts().owner_alive, None);
    }
}
