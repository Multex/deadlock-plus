use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use crate::access::{self, ApprovedSids};
use crate::args::{self, SERVICE_NAME};
use crate::op::{Op, Reply, Trace, NEEDS_INSTALLED_APP, SERVICE_INSTALL_FAILED};
use crate::serve::{Mode, Out};
use crate::{paths, scm, store, trace};

const SERVICE_DISPLAY: &str = "Deadlock+ helper";

struct Running {
    owner: u64,
    stop: Sender<()>,
}

#[derive(Default)]
pub struct Traces {
    net: Option<Running>,
    frames: Option<Running>,
}

impl Traces {
    fn slot(&mut self, kind: Trace) -> &mut Option<Running> {
        match kind {
            Trace::Net => &mut self.net,
            Trace::Frames => &mut self.frames,
        }
    }
}

pub fn capture_running(traces: &Traces) -> bool {
    traces.net.is_some() || traces.frames.is_some()
}

#[derive(Clone, Copy)]
pub struct Starters {
    pub net: fn(Out, String) -> Sender<()>,
    pub frames: fn(Out, String) -> Sender<()>,
}

impl Starters {
    pub const REAL: Starters = Starters { net: trace::start_net, frames: trace::start_frames };
}

/// Present only in the service: the approved accounts it serves and the flag that asks it to stop.
pub struct ServiceCtx {
    pub approved: Arc<Mutex<ApprovedSids>>,
    pub stop: Arc<AtomicBool>,
}

pub struct Ctx {
    pub mode: Mode,
    pub sid: String,
    pub out: Out,
    pub conn: u64,
    pub traces: Arc<Mutex<Traces>>,
    pub starters: Starters,
    pub service: Option<ServiceCtx>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum RevokePlan {
    NotApproved,
    Keep(ApprovedSids),
    Delete,
}

pub fn revoke_plan(approved: &ApprovedSids, sid: &str) -> RevokePlan {
    let mut remaining = approved.clone();
    if !remaining.remove(sid) {
        RevokePlan::NotApproved
    } else if remaining.is_empty() {
        RevokePlan::Delete
    } else {
        RevokePlan::Keep(remaining)
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

fn error(message: impl Into<String>) -> Reply {
    Reply::Error { message: message.into() }
}

fn unit(result: Result<(), String>) -> Reply {
    match result {
        Ok(()) => Reply::Ok {},
        Err(message) => Reply::Error { message },
    }
}

fn start(ctx: &Ctx, kind: Trace) -> Reply {
    // The lock is held across the start so two connections cannot both pass the "none running" check.
    let mut traces = lock(&ctx.traces);
    let slot = traces.slot(kind);
    if slot.is_some() {
        return error("busy");
    }
    let starter = match kind {
        Trace::Net => ctx.starters.net,
        Trace::Frames => ctx.starters.frames,
    };
    let stop = starter(ctx.out.clone(), ctx.sid.clone());
    *slot = Some(Running { owner: ctx.conn, stop });
    Reply::Ok {}
}

fn stop(ctx: &Ctx, kind: Trace) -> Reply {
    let mut traces = lock(&ctx.traces);
    let slot = traces.slot(kind);
    match slot.take() {
        Some(running) if running.owner == ctx.conn => {
            let _ = running.stop.send(());
            Reply::Ok {}
        }
        Some(running) => {
            *slot = Some(running);
            error("that trace belongs to another connection")
        }
        None => error("that trace is not running"),
    }
}

fn service_sddl(sids: &ApprovedSids) -> Result<String, String> {
    let stored = sids.to_stored();
    let refs: Vec<&str> = stored.iter().map(String::as_str).collect();
    access::service_sddl(&refs).ok_or_else(|| "an approved account is not a valid SID".to_string())
}

/// The service runs this exe as SYSTEM, so it must be one normal users cannot replace. Only the installer's copy in
/// Common Files qualifies: Program Files alone is not enough, since the app's install folder may be user-writable.
fn may_become_service(exe: &Path, roots: &[&Path], installed: Option<&Path>) -> bool {
    args::is_protected_install(exe, roots) && installed.is_some_and(|installed| args::same_path(exe, installed))
}

fn approve(ctx: &Ctx) -> Reply {
    let roots = paths::program_files_roots();
    let roots: Vec<&Path> = roots.iter().map(PathBuf::as_path).collect();
    let installed = paths::installed_helper();
    match std::env::current_exe() {
        Ok(exe) if may_become_service(&exe, &roots, installed.as_deref()) => match install_service(&exe, &ctx.sid) {
            Ok(()) => Reply::Ok {},
            Err(detail) => error(format!("{SERVICE_INSTALL_FAILED}{detail}")),
        },
        _ => error(NEEDS_INSTALLED_APP),
    }
}

fn install_service(exe: &Path, sid: &str) -> Result<(), String> {
    if !access::is_valid_sid(sid) {
        return Err("the app's account is not a valid SID".into());
    }
    let mut sids = store::load(SERVICE_NAME).map_err(|e| format!("read approved accounts: {e}"))?;
    sids.add(sid);
    let command_line = args::service_command_line(exe).ok_or("the app path cannot be quoted")?;
    scm::install_or_update(SERVICE_NAME, SERVICE_DISPLAY, &command_line, &service_sddl(&sids)?)?;
    store::save(SERVICE_NAME, &sids).map_err(|e| format!("save approved accounts: {e}"))
}

fn revoke(ctx: &Ctx) -> Reply {
    let Some(service) = &ctx.service else {
        return error("revoke is only accepted by the service");
    };
    // Held through the registry and SCM calls so two revokes cannot both plan from the same list.
    let mut approved = lock(&service.approved);
    match revoke_plan(&approved, &ctx.sid) {
        RevokePlan::NotApproved => error("this account is not approved"),
        RevokePlan::Keep(remaining) => {
            if let Err(e) = store::save(SERVICE_NAME, &remaining) {
                return error(format!("save approved accounts: {e}"));
            }
            let result = service_sddl(&remaining).and_then(|sddl| scm::set_dacl(SERVICE_NAME, &sddl));
            *approved = remaining;
            unit(result)
        }
        RevokePlan::Delete => {
            if let Err(e) = scm::delete(SERVICE_NAME) {
                return error(e);
            }
            *approved = ApprovedSids::default();
            service.stop.store(true, Ordering::SeqCst);
            Reply::Ok {}
        }
    }
}

pub fn exec(ctx: &Ctx, op: Op) -> Reply {
    match op {
        Op::Block { groups } => unit(dp_firewall::block_groups(&groups)),
        Op::Unblock { group_ids } => unit(dp_firewall::unblock_groups(&group_ids)),
        Op::RemoveExternal { names } => unit(dp_firewall::remove_rules_by_name(&names)),
        Op::RefreshStale { groups } => match dp_firewall::refresh_stale_groups(&groups, false) {
            Ok(report) => Reply::Refreshed { updated: report.updated, failed: report.failed },
            Err(message) => Reply::Error { message },
        },
        Op::StartNetTrace {} => start(ctx, Trace::Net),
        Op::StartFrameTrace {} => start(ctx, Trace::Frames),
        Op::Stop { trace } => stop(ctx, trace),
        Op::Approve {} => approve(ctx),
        Op::Revoke {} => revoke(ctx),
    }
}

pub fn connection_closed(ctx: &Ctx) {
    let mut traces = lock(&ctx.traces);
    for kind in [Trace::Net, Trace::Frames] {
        let slot = traces.slot(kind);
        if slot.as_ref().is_some_and(|running| running.owner == ctx.conn) {
            if let Some(running) = slot.take() {
                let _ = running.stop.send(());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::{channel, Receiver};
    use std::sync::Mutex as StdMutex;

    use dp_firewall::FirewallRuleSpec;

    use crate::service_client;

    static STARTED: StdMutex<Vec<&'static str>> = StdMutex::new(Vec::new());
    static RECEIVERS: StdMutex<Vec<(&'static str, Receiver<()>)>> = StdMutex::new(Vec::new());
    static SERIAL: StdMutex<()> = StdMutex::new(());

    fn fake(kind: &'static str) -> Sender<()> {
        let (tx, rx) = channel();
        STARTED.lock().unwrap().push(kind);
        RECEIVERS.lock().unwrap().push((kind, rx));
        tx
    }

    fn fake_net(_: Out, _: String) -> Sender<()> {
        fake("net")
    }

    fn fake_frames(_: Out, _: String) -> Sender<()> {
        fake("frames")
    }

    fn reset() {
        STARTED.lock().unwrap().clear();
        RECEIVERS.lock().unwrap().clear();
    }

    fn stopped(kind: &str) -> bool {
        let receivers = RECEIVERS.lock().unwrap();
        receivers.iter().any(|(k, rx)| *k == kind && rx.try_recv().is_ok())
    }

    fn started() -> Vec<&'static str> {
        STARTED.lock().unwrap().clone()
    }

    fn ctx(conn: u64, traces: &Arc<Mutex<Traces>>) -> Ctx {
        Ctx {
            mode: Mode::Service,
            sid: "S-1-5-21-1-2-3-1001".into(),
            out: Arc::new(Mutex::new(Vec::<u8>::new())),
            conn,
            traces: traces.clone(),
            starters: Starters { net: fake_net, frames: fake_frames },
            service: None,
        }
    }

    fn is_error(reply: &Reply) -> bool {
        matches!(reply, Reply::Error { .. })
    }

    #[test]
    fn start_net_starts_once_and_marks_capture_running() {
        let _g = SERIAL.lock().unwrap_or_else(PoisonError::into_inner);
        reset();
        let traces = Arc::new(Mutex::new(Traces::default()));
        let c = ctx(1, &traces);
        assert!(!capture_running(&traces.lock().unwrap()));
        assert_eq!(exec(&c, Op::StartNetTrace {}), Reply::Ok {});
        assert_eq!(started(), vec!["net"]);
        assert!(capture_running(&traces.lock().unwrap()));
    }

    #[test]
    fn second_start_of_a_kind_is_busy_even_for_the_owner() {
        let _g = SERIAL.lock().unwrap_or_else(PoisonError::into_inner);
        reset();
        let traces = Arc::new(Mutex::new(Traces::default()));
        let a = ctx(1, &traces);
        let b = ctx(2, &traces);
        assert_eq!(exec(&a, Op::StartFrameTrace {}), Reply::Ok {});
        assert_eq!(exec(&a, Op::StartFrameTrace {}), Reply::Error { message: "busy".into() });
        assert_eq!(exec(&b, Op::StartFrameTrace {}), Reply::Error { message: "busy".into() });
        assert_eq!(started(), vec!["frames"]);
    }

    #[test]
    fn net_and_frames_run_side_by_side() {
        let _g = SERIAL.lock().unwrap_or_else(PoisonError::into_inner);
        reset();
        let traces = Arc::new(Mutex::new(Traces::default()));
        let a = ctx(1, &traces);
        let b = ctx(2, &traces);
        assert_eq!(exec(&a, Op::StartNetTrace {}), Reply::Ok {});
        assert_eq!(exec(&b, Op::StartFrameTrace {}), Reply::Ok {});
        assert_eq!(started(), vec!["net", "frames"]);
    }

    #[test]
    fn only_the_owner_stops_a_trace() {
        let _g = SERIAL.lock().unwrap_or_else(PoisonError::into_inner);
        reset();
        let traces = Arc::new(Mutex::new(Traces::default()));
        let a = ctx(1, &traces);
        let b = ctx(2, &traces);
        exec(&a, Op::StartNetTrace {});
        assert!(is_error(&exec(&b, Op::Stop { trace: Trace::Net })));
        assert!(!stopped("net"));
        assert!(capture_running(&traces.lock().unwrap()));
        assert_eq!(exec(&a, Op::Stop { trace: Trace::Net }), Reply::Ok {});
        assert!(stopped("net"));
        assert!(!capture_running(&traces.lock().unwrap()));
    }

    #[test]
    fn stopping_what_is_not_running_is_an_error() {
        let _g = SERIAL.lock().unwrap_or_else(PoisonError::into_inner);
        reset();
        let traces = Arc::new(Mutex::new(Traces::default()));
        assert!(is_error(&exec(&ctx(1, &traces), Op::Stop { trace: Trace::Frames })));
    }

    #[test]
    fn a_stopped_trace_can_start_again() {
        let _g = SERIAL.lock().unwrap_or_else(PoisonError::into_inner);
        reset();
        let traces = Arc::new(Mutex::new(Traces::default()));
        let a = ctx(1, &traces);
        let b = ctx(2, &traces);
        exec(&a, Op::StartNetTrace {});
        exec(&a, Op::Stop { trace: Trace::Net });
        assert_eq!(exec(&b, Op::StartNetTrace {}), Reply::Ok {});
        assert_eq!(started(), vec!["net", "net"]);
    }

    #[test]
    fn closing_a_connection_stops_only_its_traces() {
        let _g = SERIAL.lock().unwrap_or_else(PoisonError::into_inner);
        reset();
        let traces = Arc::new(Mutex::new(Traces::default()));
        let a = ctx(1, &traces);
        let b = ctx(2, &traces);
        exec(&a, Op::StartNetTrace {});
        exec(&b, Op::StartFrameTrace {});
        connection_closed(&a);
        assert!(stopped("net"));
        assert!(!stopped("frames"));
        let t = traces.lock().unwrap();
        assert!(t.net.is_none());
        assert!(t.frames.is_some());
        assert!(capture_running(&t));
    }

    const A: &str = "S-1-5-21-1-2-3-1001";
    const B: &str = "S-1-5-21-1-2-3-1002";

    fn list(sids: &[&str]) -> ApprovedSids {
        ApprovedSids::from_stored(sids.iter().map(|s| s.to_string()).collect())
    }

    #[test]
    fn revoke_plan_table() {
        let cases: [(&[&str], &str, RevokePlan); 6] = [
            (&[A, B], A, RevokePlan::Keep(list(&[B]))),
            (&[A, B], B, RevokePlan::Keep(list(&[A]))),
            (&[A], A, RevokePlan::Delete),
            (&[A], B, RevokePlan::NotApproved),
            (&[], A, RevokePlan::NotApproved),
            (&[A, B], "garbage", RevokePlan::NotApproved),
        ];
        for (stored, sid, expected) in cases {
            assert_eq!(revoke_plan(&list(stored), sid), expected, "{stored:?} {sid}");
        }
    }

    fn service_exists(service: &str) -> bool {
        use windows::core::PCWSTR;
        use windows::Win32::Foundation::ERROR_SERVICE_DOES_NOT_EXIST;
        use windows::Win32::System::Services::{
            CloseServiceHandle, OpenSCManagerW, OpenServiceW, SC_MANAGER_CONNECT, SERVICE_QUERY_STATUS,
        };
        let name: Vec<u16> = service.encode_utf16().chain(Some(0)).collect();
        // SAFETY: null machine and database names select the local active database.
        let manager = unsafe { OpenSCManagerW(PCWSTR::null(), PCWSTR::null(), SC_MANAGER_CONNECT) }.unwrap();
        // SAFETY: `manager` is open and `name` is NUL-terminated; both outlive the call.
        let opened = unsafe { OpenServiceW(manager, PCWSTR(name.as_ptr()), SERVICE_QUERY_STATUS) };
        let exists = match &opened {
            Ok(handle) => {
                // SAFETY: `handle` was opened above and is closed once.
                let _ = unsafe { CloseServiceHandle(*handle) };
                true
            }
            Err(e) => e.code() != ERROR_SERVICE_DOES_NOT_EXIST.to_hresult(),
        };
        // SAFETY: `manager` was opened above and is closed once.
        let _ = unsafe { CloseServiceHandle(manager) };
        exists
    }

    #[test]
    fn approve_from_outside_program_files_is_refused_and_installs_nothing() {
        if dp_elevation::is_elevated() || service_exists(SERVICE_NAME) {
            return;
        }
        let traces = Arc::new(Mutex::new(Traces::default()));
        let c = Ctx { mode: Mode::Helper, ..ctx(1, &traces) };
        assert_eq!(exec(&c, Op::Approve {}), Reply::Error { message: "always_allow_needs_installed_app".into() });
        assert!(!service_exists(SERVICE_NAME));
        assert_eq!(scm::query_pid(SERVICE_NAME), None);
        assert!(!service_client::approved(SERVICE_NAME));
    }

    const INSTALLED: &str = r"C:\Program Files\Common Files\Deadlock+\deadlock-plus-helper.exe";
    const PROGRAM_FILES: &str = r"C:\Program Files";

    fn may_become(exe: &str, installed: Option<&str>) -> bool {
        may_become_service(Path::new(exe), &[Path::new(PROGRAM_FILES)], installed.map(Path::new))
    }

    #[test]
    fn only_the_installed_helper_may_become_the_service() {
        assert!(may_become(INSTALLED, Some(INSTALLED)));
        assert!(may_become(&INSTALLED.to_uppercase(), Some(INSTALLED)));
        assert!(!may_become(r"C:\Program Files\Deadlock+\deadlock-plus.exe", Some(INSTALLED)));
        assert!(!may_become(r"C:\Program Files\Deadlock+\deadlock-plus-helper.exe", Some(INSTALLED)));
        assert!(!may_become(r"D:\Programs\Deadlock+\deadlock-plus-helper.exe", Some(INSTALLED)));
        assert!(!may_become(INSTALLED, None));
    }

    #[test]
    fn the_installed_helper_outside_program_files_is_refused() {
        let installed = r"D:\Common Files\Deadlock+\deadlock-plus-helper.exe";
        assert!(!may_become(installed, Some(installed)));
    }

    #[test]
    fn revoke_without_a_service_ctx_is_an_error() {
        let traces = Arc::new(Mutex::new(Traces::default()));
        assert!(is_error(&exec(&ctx(1, &traces), Op::Revoke {})));
    }

    #[test]
    fn revoke_of_an_unapproved_account_changes_nothing() {
        let traces = Arc::new(Mutex::new(Traces::default()));
        let approved = Arc::new(Mutex::new(list(&[B])));
        let stop = Arc::new(AtomicBool::new(false));
        let c = Ctx {
            sid: A.into(),
            service: Some(ServiceCtx { approved: approved.clone(), stop: stop.clone() }),
            ..ctx(1, &traces)
        };
        assert!(is_error(&exec(&c, Op::Revoke {})));
        assert_eq!(*approved.lock().unwrap(), list(&[B]));
        assert!(!stop.load(std::sync::atomic::Ordering::SeqCst));
    }

    #[test]
    fn block_with_a_test_group_fails_and_creates_nothing() {
        if dp_elevation::is_elevated() {
            return;
        }
        let traces = Arc::new(Mutex::new(Traces::default()));
        let c = ctx(1, &traces);
        let id = "dp-helper-dispatch-test-group";
        let spec =
            FirewallRuleSpec { group_id: id.into(), description: "test".into(), relay_ips: vec!["192.0.2.1".into()] };
        assert!(is_error(&exec(&c, Op::Block { groups: vec![spec] })));
        assert_eq!(dp_firewall::list_blocked(&[id.to_string()]).unwrap(), Vec::<String>::new());
    }

    #[test]
    fn unblock_and_remove_of_unknown_names_do_not_panic() {
        if dp_elevation::is_elevated() {
            return;
        }
        let traces = Arc::new(Mutex::new(Traces::default()));
        let c = ctx(1, &traces);
        let _ = exec(&c, Op::Unblock { group_ids: vec!["dp-helper-dispatch-test-group".into()] });
        let _ = exec(&c, Op::RemoveExternal { names: vec!["dp-helper-dispatch-test-rule".into()] });
    }
}
