use std::io;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread;
use std::time::Duration;

use crate::access::{client_allowed, pipe_sddl, ApprovedSids};
use crate::pipe::{self, Pipe};
use crate::sid::pipe_client_sid;

const POLL: Duration = Duration::from_millis(200);

pub type OnClient = Arc<dyn Fn(Pipe, String) + Send + Sync>;

type SddlFor = dyn Fn(&ApprovedSids) -> Option<String>;

pub fn listen(
    name: &str,
    approved: Arc<Mutex<ApprovedSids>>,
    on_client: OnClient,
    stop: Arc<AtomicBool>,
) -> io::Result<()> {
    listen_with(name, &approved, &approved_sddl, &on_client, &stop)
}

fn approved_sddl(approved: &ApprovedSids) -> Option<String> {
    let stored = approved.to_stored();
    let sids: Vec<&str> = stored.iter().map(String::as_str).collect();
    pipe_sddl(&sids)
}

/// Windows applies only the first instance's descriptor to the whole pipe and ignores it on later instances, so a
/// list change reaches the pipe's DACL only on the next start. The SID check at connect time always uses the
/// current list.
fn instance(name: &str, approved: &Mutex<ApprovedSids>, sddl_for: &SddlFor, first: bool) -> io::Result<Pipe> {
    let sddl = sddl_for(&approved.lock().unwrap_or_else(PoisonError::into_inner))
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "no pipe descriptor for the approved list"))?;
    pipe::create(name, &sddl, first)
}

fn listen_with(
    name: &str,
    approved: &Mutex<ApprovedSids>,
    sddl_for: &SddlFor,
    on_client: &OnClient,
    stop: &AtomicBool,
) -> io::Result<()> {
    let mut listening = instance(name, approved, sddl_for, true)?;
    while !stop.load(Ordering::Relaxed) {
        match pipe::accept(&listening, POLL) {
            Ok(()) => {}
            Err(e) if e.kind() == io::ErrorKind::TimedOut => continue,
            Err(e) => {
                // A client that left before the connect finished leaves the instance unusable. The replacement is
                // created before the old one closes, so the name stays held.
                log::debug!("pipe accept failed: {e}");
                listening = instance(name, approved, sddl_for, false)?;
                continue;
            }
        }
        // The next instance must exist before this one is handed off: if the name were ever free, another process
        // could create a first instance and pose as the service.
        let next = instance(name, approved, sddl_for, false)?;
        hand_off(std::mem::replace(&mut listening, next), approved, on_client);
    }
    Ok(())
}

fn hand_off(pipe: Pipe, approved: &Mutex<ApprovedSids>, on_client: &OnClient) {
    let sid = match pipe_client_sid(&pipe) {
        Ok(sid) => sid,
        Err(e) => {
            log::warn!("could not identify a pipe client: {e}");
            return;
        }
    };
    if !client_allowed(&sid, &approved.lock().unwrap_or_else(PoisonError::into_inner)) {
        log::warn!("refused pipe client {sid}: not approved");
        return;
    }
    let on_client = Arc::clone(on_client);
    if let Err(e) = thread::Builder::new().name("dp-helper-client".into()).spawn(move || on_client(pipe, sid)) {
        log::warn!("could not start a client thread: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sid::current_user_sid;
    use std::io::{Read, Write};
    use std::sync::atomic::AtomicU32;
    use std::sync::mpsc::{self, Receiver};
    use std::thread::JoinHandle;
    use std::time::Instant;

    const LONG: Duration = Duration::from_secs(5);
    const SHORT: Duration = Duration::from_millis(600);

    fn unique_name(tag: &str) -> String {
        static NEXT: AtomicU32 = AtomicU32::new(0);
        format!(
            r"\\.\pipe\dp-helper-listener-test-{}-{tag}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        )
    }

    fn me() -> String {
        current_user_sid().unwrap()
    }

    fn approved(sids: &[&str]) -> Arc<Mutex<ApprovedSids>> {
        Arc::new(Mutex::new(ApprovedSids::from_stored(sids.iter().map(|s| s.to_string()).collect())))
    }

    struct Running {
        name: String,
        stop: Arc<AtomicBool>,
        thread: Option<JoinHandle<io::Result<()>>>,
        clients: Receiver<(Pipe, String)>,
    }

    impl Running {
        fn finish(mut self) -> io::Result<()> {
            self.stop.store(true, Ordering::Relaxed);
            self.thread.take().unwrap().join().unwrap()
        }
    }

    impl Drop for Running {
        fn drop(&mut self) {
            self.stop.store(true, Ordering::Relaxed);
        }
    }

    /// The production descriptor gives clients no right to create instances, so an unelevated test process could
    /// not create the second instance. This one also grants the current user full access.
    fn start(tag: &str, list: Arc<Mutex<ApprovedSids>>) -> Running {
        let user = me();
        spawn(tag, list, move |_| Some(format!("D:P(A;;GA;;;BA)(A;;GA;;;{user})")))
    }

    fn start_production(tag: &str, list: Arc<Mutex<ApprovedSids>>) -> Running {
        spawn(tag, list, approved_sddl)
    }

    fn spawn(
        tag: &str,
        list: Arc<Mutex<ApprovedSids>>,
        sddl_for: impl Fn(&ApprovedSids) -> Option<String> + Send + 'static,
    ) -> Running {
        let name = unique_name(tag);
        let stop = Arc::new(AtomicBool::new(false));
        let (tx, clients) = mpsc::channel();
        let on_client: OnClient = Arc::new(move |pipe, sid| {
            let _ = tx.send((pipe, sid));
        });
        let thread = {
            let (name, stop) = (name.clone(), Arc::clone(&stop));
            thread::spawn(move || listen_with(&name, &list, &sddl_for, &on_client, &stop))
        };
        Running { name, stop, thread: Some(thread), clients }
    }

    fn reads_end_of_file(client: &Pipe) -> bool {
        let mut buf = [0u8; 1];
        matches!((&*client).read(&mut buf), Ok(0) | Err(_))
    }

    #[test]
    fn an_approved_client_reaches_on_client_with_its_sid() {
        let running = start("approved", approved(&[&me()]));
        let client = pipe::connect(&running.name, LONG).unwrap();
        let (server, sid) = running.clients.recv_timeout(LONG).unwrap();
        assert_eq!(sid, me());
        (&server).write_all(b"x").unwrap();
        let mut byte = [0u8; 1];
        (&client).read_exact(&mut byte).unwrap();
        assert_eq!(&byte, b"x");
        running.finish().unwrap();
    }

    #[test]
    fn a_client_missing_from_the_list_is_dropped() {
        let running = start("unapproved", approved(&[]));
        let client = pipe::connect(&running.name, LONG).unwrap();
        assert!(reads_end_of_file(&client));
        assert!(running.clients.recv_timeout(SHORT).is_err());
        running.finish().unwrap();
    }

    #[test]
    fn the_list_is_read_when_the_client_connects() {
        let list = approved(&[]);
        let running = start("late-approval", Arc::clone(&list));
        list.lock().unwrap().add(&me());
        let _client = pipe::connect(&running.name, LONG).unwrap();
        let (_server, sid) = running.clients.recv_timeout(LONG).unwrap();
        assert_eq!(sid, me());
        running.finish().unwrap();
    }

    #[test]
    fn with_an_empty_list_an_unelevated_client_cannot_open_the_pipe() {
        if dp_elevation::is_elevated() {
            return;
        }
        let running = start_production("empty", approved(&[]));
        let error = pipe::connect(&running.name, LONG).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied, "{error:?}");
        assert!(running.clients.recv_timeout(SHORT).is_err());
        running.finish().unwrap();
    }

    #[test]
    fn a_client_is_never_handed_off_without_a_next_instance() {
        // Unelevated, the production descriptor denies this process the right to create a second instance.
        if dp_elevation::is_elevated() {
            return;
        }
        let mut running = start_production("no-next", approved(&[&me()]));
        let client = pipe::connect(&running.name, LONG).unwrap();
        assert!(reads_end_of_file(&client));
        assert!(running.clients.recv_timeout(SHORT).is_err());
        let result = running.thread.take().unwrap().join().unwrap();
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::PermissionDenied);
    }

    #[test]
    fn stop_ends_the_loop() {
        let running = start("stop", approved(&[]));
        let _client = pipe::connect(&running.name, LONG).unwrap();
        let begin = Instant::now();
        running.finish().unwrap();
        assert!(begin.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn a_second_client_connects_while_the_first_is_served() {
        let running = start("second", approved(&[&me()]));
        let first = pipe::connect(&running.name, LONG).unwrap();
        let (first_server, _) = running.clients.recv_timeout(LONG).unwrap();
        let second = pipe::connect(&running.name, LONG).unwrap();
        let (second_server, sid) = running.clients.recv_timeout(LONG).unwrap();
        assert_eq!(sid, me());
        (&first_server).write_all(b"1").unwrap();
        (&second_server).write_all(b"2").unwrap();
        let mut byte = [0u8; 1];
        (&first).read_exact(&mut byte).unwrap();
        assert_eq!(&byte, b"1");
        (&second).read_exact(&mut byte).unwrap();
        assert_eq!(&byte, b"2");
        running.finish().unwrap();
    }

    #[test]
    fn the_name_stays_taken_after_a_client_is_served() {
        const OPEN: &str = "D:P(A;;GA;;;AU)";
        let running = start("held", approved(&[&me()]));
        let client = pipe::connect(&running.name, LONG).unwrap();
        let (server, _) = running.clients.recv_timeout(LONG).unwrap();
        drop(server);
        drop(client);
        assert!(pipe::create(&running.name, OPEN, true).is_err());
        running.finish().unwrap();
    }

    #[test]
    fn a_name_someone_else_holds_is_refused() {
        const OPEN: &str = "D:P(A;;GA;;;AU)";
        let name = unique_name("squatted");
        let _squatter = pipe::create(&name, OPEN, true).unwrap();
        let on_client: OnClient = Arc::new(|_, _| panic!("no client expected"));
        let stop = AtomicBool::new(false);
        let sddl_for = |_: &ApprovedSids| Some(OPEN.to_string());
        assert!(listen_with(&name, &approved(&[]), &sddl_for, &on_client, &stop).is_err());
    }

    #[test]
    fn clients_that_leave_at_once_do_not_stop_the_listener() {
        let running = start("leavers", approved(&[&me()]));
        for _ in 0..5 {
            drop(pipe::connect(&running.name, LONG).unwrap());
        }
        let client = pipe::connect(&running.name, LONG).unwrap();
        let deadline = Instant::now() + LONG;
        loop {
            let (server, sid) =
                running.clients.recv_timeout(deadline.saturating_duration_since(Instant::now())).unwrap();
            assert_eq!(sid, me());
            // A write to a client that already closed its end fails, so the first one that works is the live client.
            if (&server).write_all(b"x").is_ok() {
                break;
            }
        }
        let mut byte = [0u8; 1];
        (&client).read_exact(&mut byte).unwrap();
        assert_eq!(&byte, b"x");
        running.finish().unwrap();
    }

    #[test]
    fn an_invalid_descriptor_is_an_error() {
        let on_client: OnClient = Arc::new(|_, _| {});
        let stop = AtomicBool::new(false);
        let sddl_for = |_: &ApprovedSids| None;
        let error = listen_with(&unique_name("no-sddl"), &approved(&[]), &sddl_for, &on_client, &stop).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
    }
}
