use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::SocketAddrV4;
use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::{Duration, Instant};

use dp_frames::line::FrameLine;

use crate::op::{self, Op, Reply};
use crate::stream::{self, Incoming};

const EXITED: &str = "the privileged helper exited";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NetEvent {
    Packet { inbound: bool, remote: SocketAddrV4, ticks: i64 },
    Failed(String),
}

pub type NetHandler = Arc<dyn Fn(NetEvent) + Send + Sync>;
pub type FrameHandler = Arc<dyn Fn(FrameLine) + Send + Sync>;

struct State {
    alive: bool,
    waiting: bool,
    reply: Option<Reply>,
    /// Replies still owed to calls that timed out. The server answers every request in order, so these arrive
    /// first and must not be handed to a later call.
    abandoned: usize,
}

struct Shared {
    state: Mutex<State>,
    changed: Condvar,
    net: Mutex<Option<NetHandler>>,
    frames: Mutex<Option<FrameHandler>>,
}

pub struct Session {
    shared: Arc<Shared>,
    writer: Mutex<Box<dyn Write + Send>>,
}

fn lock<T: ?Sized>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

enum Line {
    Eof,
    Skip,
    Text(String),
}

fn read_line(input: &mut impl BufRead) -> io::Result<Line> {
    let mut buf = Vec::new();
    // One byte past the cap tells "exactly at the cap" from "over it" without ever holding more.
    input.by_ref().take(op::MAX_LINE_LEN as u64 + 1).read_until(b'\n', &mut buf)?;
    if buf.is_empty() {
        return Ok(Line::Eof);
    }
    if buf.len() > op::MAX_LINE_LEN {
        if buf.last() != Some(&b'\n') {
            skip_past_newline(input)?;
        }
        return Ok(Line::Skip);
    }
    Ok(String::from_utf8(buf).map_or(Line::Skip, Line::Text))
}

fn skip_past_newline(input: &mut impl BufRead) -> io::Result<()> {
    loop {
        let chunk = input.fill_buf()?;
        if chunk.is_empty() {
            return Ok(());
        }
        if let Some(i) = chunk.iter().position(|&b| b == b'\n') {
            input.consume(i + 1);
            return Ok(());
        }
        let n = chunk.len();
        input.consume(n);
    }
}

/// Marks the session dead even when a handler panics and ends the demux thread, so calls fail at once instead of
/// waiting out their timeout.
struct DeadOnDrop<'a>(&'a Shared);

impl Drop for DeadOnDrop<'_> {
    fn drop(&mut self) {
        self.0.mark_dead();
    }
}

impl Shared {
    fn run(&self, mut input: impl BufRead) {
        let _dead = DeadOnDrop(self);
        loop {
            match read_line(&mut input) {
                Ok(Line::Text(text)) => self.dispatch(&text),
                Ok(Line::Skip) => {}
                Ok(Line::Eof) | Err(_) => break,
            }
        }
        self.mark_dead();
        self.net(NetEvent::Failed(EXITED.into()));
        self.frames(FrameLine::Failed(EXITED.into()));
    }

    fn dispatch(&self, line: &str) {
        match stream::classify(line) {
            Some(Incoming::Reply(reply)) => self.deliver(reply),
            Some(Incoming::Packet { inbound, remote, ticks }) => self.net(NetEvent::Packet { inbound, remote, ticks }),
            Some(Incoming::NetFailed(message)) => self.net(NetEvent::Failed(message)),
            Some(Incoming::Frames(line)) => self.frames(line),
            None => {}
        }
    }

    fn deliver(&self, reply: Reply) {
        let mut state = lock(&self.state);
        if state.abandoned > 0 {
            state.abandoned -= 1;
        } else if state.waiting && state.reply.is_none() {
            state.reply = Some(reply);
            self.changed.notify_all();
        }
    }

    fn mark_dead(&self) {
        lock(&self.state).alive = false;
        self.changed.notify_all();
    }

    fn net(&self, event: NetEvent) {
        // Cloned out so a handler may replace itself without deadlocking.
        let handler = lock(&self.net).clone();
        if let Some(handler) = handler {
            handler(event);
        }
    }

    fn frames(&self, line: FrameLine) {
        let handler = lock(&self.frames).clone();
        if let Some(handler) = handler {
            handler(line);
        }
    }
}

impl Session {
    pub fn start(reader: impl Read + Send + 'static, writer: impl Write + Send + 'static) -> Arc<Session> {
        let shared = Arc::new(Shared {
            state: Mutex::new(State { alive: true, waiting: false, reply: None, abandoned: 0 }),
            changed: Condvar::new(),
            net: Mutex::new(None),
            frames: Mutex::new(None),
        });
        let demux = Arc::clone(&shared);
        let spawned =
            thread::Builder::new().name("dp-helper-client".into()).spawn(move || demux.run(BufReader::new(reader)));
        if spawned.is_err() {
            shared.mark_dead();
        }
        Arc::new(Session { shared, writer: Mutex::new(Box::new(writer)) })
    }

    /// One call at a time: a second caller waits for the first to finish before its own timeout starts.
    pub fn call(&self, op: &Op, timeout: Duration) -> Result<Reply, String> {
        let mut writer = lock(&self.writer);
        {
            let mut state = lock(&self.shared.state);
            if !state.alive {
                return Err(EXITED.into());
            }
            state.waiting = true;
            state.reply = None;
        }
        if let Err(e) = writer.write_all(op::encode(op).as_bytes()).and_then(|()| writer.flush()) {
            lock(&self.shared.state).waiting = false;
            return Err(format!("could not reach the privileged helper: {e}"));
        }
        let deadline = Instant::now().checked_add(timeout);
        let mut state = lock(&self.shared.state);
        loop {
            if let Some(reply) = state.reply.take() {
                state.waiting = false;
                return Ok(reply);
            }
            if !state.alive {
                state.waiting = false;
                return Err(EXITED.into());
            }
            let left = match deadline {
                Some(deadline) => deadline.saturating_duration_since(Instant::now()),
                None => Duration::MAX,
            };
            if left.is_zero() {
                state.waiting = false;
                state.abandoned += 1;
                return Err("the privileged helper did not answer in time".into());
            }
            state = self.shared.changed.wait_timeout(state, left).unwrap_or_else(PoisonError::into_inner).0;
        }
    }

    pub fn set_net(&self, handler: Option<NetHandler>) {
        *lock(&self.shared.net) = handler;
    }

    pub fn set_frames(&self, handler: Option<FrameHandler>) {
        *lock(&self.shared.frames) = handler;
    }

    pub fn is_alive(&self) -> bool {
        lock(&self.shared.state).alive
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::op::{self, Trace};
    use dp_connection::wire;
    use dp_frames::line;
    use std::io::{self, BufRead, BufReader, PipeReader, PipeWriter};
    use std::net::Ipv4Addr;
    use std::sync::mpsc::{self, Receiver};
    use std::thread;
    use std::time::Instant;

    const LONG: Duration = Duration::from_secs(10);

    struct Server {
        requests: BufReader<PipeReader>,
        replies: PipeWriter,
    }

    impl Server {
        fn read(&mut self) -> String {
            let mut line = String::new();
            self.requests.read_line(&mut line).unwrap();
            line
        }

        fn write(&mut self, line: &str) {
            self.replies.write_all(line.as_bytes()).unwrap();
            self.replies.flush().unwrap();
        }

        fn reply(&mut self, reply: &Reply) {
            self.write(&op::encode_reply(reply));
        }
    }

    fn connect() -> (Arc<Session>, Server) {
        let (requests, request_writer) = io::pipe().unwrap();
        let (reply_reader, replies) = io::pipe().unwrap();
        (Session::start(reply_reader, request_writer), Server { requests: BufReader::new(requests), replies })
    }

    fn net_events(session: &Session) -> Receiver<NetEvent> {
        let (tx, rx) = mpsc::channel();
        session.set_net(Some(Arc::new(move |event| {
            let _ = tx.send(event);
        })));
        rx
    }

    fn frame_events(session: &Session) -> Receiver<FrameLine> {
        let (tx, rx) = mpsc::channel();
        session.set_frames(Some(Arc::new(move |line| {
            let _ = tx.send(line);
        })));
        rx
    }

    fn remote() -> SocketAddrV4 {
        SocketAddrV4::new(Ipv4Addr::new(155, 133, 226, 1), 27015)
    }

    fn echo(line: &str) -> Reply {
        Reply::Error { message: line.trim_end().to_string() }
    }

    #[test]
    fn a_reply_reaches_call() {
        let (session, mut server) = connect();
        let fake = thread::spawn(move || {
            let request = server.read();
            server.reply(&Reply::Refreshed { updated: vec!["g".into()], failed: vec![] });
            (request, server)
        });
        let reply = session.call(&Op::Approve {}, LONG);
        assert_eq!(reply, Ok(Reply::Refreshed { updated: vec!["g".into()], failed: vec![] }));
        let (request, _server) = fake.join().unwrap();
        assert_eq!(request, op::encode(&Op::Approve {}));
        assert!(session.is_alive());
    }

    #[test]
    fn traces_arrive_while_a_call_waits() {
        let (session, mut server) = connect();
        let net = net_events(&session);
        let frames = frame_events(&session);
        let fake = thread::spawn(move || {
            server.read();
            server.write(&wire::encode_packet(true, remote(), -5));
            // The reply waits until the handler has seen the packet, so delivery cannot depend on the call ending.
            let first = net.recv_timeout(LONG).unwrap();
            server.write(&wire::encode_error("trace\nstopped"));
            server.write(&line::encode(&FrameLine::Present(77)));
            server.write(&line::encode(&FrameLine::Others(3)));
            server.reply(&Reply::Ok {});
            (first, net)
        });
        assert_eq!(session.call(&Op::StartNetTrace {}, LONG), Ok(Reply::Ok {}));
        let (first, net) = fake.join().unwrap();
        assert_eq!(first, NetEvent::Packet { inbound: true, remote: remote(), ticks: -5 });
        assert_eq!(net.recv_timeout(LONG), Ok(NetEvent::Failed("trace stopped".into())));
        assert_eq!(frames.recv_timeout(LONG), Ok(FrameLine::Present(77)));
        assert_eq!(frames.recv_timeout(LONG), Ok(FrameLine::Others(3)));
    }

    #[test]
    fn a_call_times_out_and_its_late_reply_is_not_taken_by_the_next() {
        let (session, mut server) = connect();
        let (go, gate) = mpsc::channel::<()>();
        let fake = thread::spawn(move || {
            server.read();
            gate.recv().unwrap();
            server.reply(&Reply::Error { message: "late".into() });
            let second = server.read();
            server.reply(&Reply::Ok {});
            second
        });
        let started = Instant::now();
        let first = session.call(&Op::Approve {}, Duration::from_millis(100));
        assert!(first.is_err(), "{first:?}");
        assert!(started.elapsed() < Duration::from_secs(5));
        assert!(session.is_alive());
        go.send(()).unwrap();
        assert_eq!(session.call(&Op::Revoke {}, LONG), Ok(Reply::Ok {}));
        assert_eq!(fake.join().unwrap(), op::encode(&Op::Revoke {}));
    }

    #[test]
    fn eof_fails_the_pending_call_and_notifies_the_handlers() {
        let (session, mut server) = connect();
        let net = net_events(&session);
        let frames = frame_events(&session);
        let fake = thread::spawn(move || {
            server.read();
            drop(server);
        });
        let started = Instant::now();
        assert_eq!(session.call(&Op::StartFrameTrace {}, LONG), Err(EXITED.to_string()));
        assert!(started.elapsed() < Duration::from_secs(5));
        fake.join().unwrap();
        assert!(!session.is_alive());
        assert_eq!(net.recv_timeout(LONG), Ok(NetEvent::Failed(EXITED.into())));
        assert_eq!(frames.recv_timeout(LONG), Ok(FrameLine::Failed(EXITED.into())));
        let started = Instant::now();
        assert_eq!(session.call(&Op::Approve {}, LONG), Err(EXITED.to_string()));
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn concurrent_calls_are_serialised() {
        let (session, server) = connect();
        let Server { mut requests, mut replies } = server;
        let (lines, arrivals) = mpsc::channel();
        thread::spawn(move || loop {
            let mut line = String::new();
            if requests.read_line(&mut line).unwrap_or(0) == 0 {
                return;
            }
            lines.send((line, Instant::now())).unwrap();
        });
        let fake = thread::spawn(move || {
            let (first, _) = arrivals.recv_timeout(LONG).unwrap();
            thread::sleep(Duration::from_millis(200));
            let answered = Instant::now();
            replies.write_all(op::encode_reply(&echo(&first)).as_bytes()).unwrap();
            let (second, arrived) = arrivals.recv_timeout(LONG).unwrap();
            replies.write_all(op::encode_reply(&echo(&second)).as_bytes()).unwrap();
            (answered, arrived)
        });
        let callers: Vec<_> = [Trace::Net, Trace::Frames]
            .into_iter()
            .map(|trace| {
                let session = Arc::clone(&session);
                thread::spawn(move || {
                    let op = Op::Stop { trace };
                    (session.call(&op, LONG), echo(&op::encode(&op)))
                })
            })
            .collect();
        for caller in callers {
            let (got, expected) = caller.join().unwrap();
            assert_eq!(got, Ok(expected));
        }
        let (answered, arrived) = fake.join().unwrap();
        assert!(arrived >= answered, "the second request was written before the first reply");
    }

    #[test]
    fn junk_lines_are_ignored() {
        let (session, mut server) = connect();
        let net = net_events(&session);
        let frames = frame_events(&session);
        let fake = thread::spawn(move || {
            server.read();
            for junk in ["hello\n", "\n", "F 1.2.3.4\n", "{\"reply\":\"nope\"}\n", "D x\n", "P i 1.2.3.4 5\n"] {
                server.write(junk);
            }
            server.replies.write_all(b"\xff\xfe\n").unwrap();
            let mut oversize = op::encode_reply(&Reply::Error { message: "x".repeat(op::MAX_LINE_LEN * 2) });
            oversize.insert(0, '{');
            server.write(&oversize);
            server.write(&format!("{}\n", "P".repeat(op::MAX_LINE_LEN + 3)));
            server.reply(&Reply::Ok {});
            server
        });
        assert_eq!(session.call(&Op::Approve {}, LONG), Ok(Reply::Ok {}));
        let _server = fake.join().unwrap();
        assert!(session.is_alive());
        assert!(net.try_recv().is_err());
        assert!(frames.try_recv().is_err());
    }

    #[test]
    fn an_oversize_reply_is_dropped_not_delivered() {
        let (session, mut server) = connect();
        let fake = thread::spawn(move || {
            server.read();
            server.reply(&Reply::Error { message: "x".repeat(op::MAX_LINE_LEN) });
            server.reply(&Reply::Ok {});
        });
        assert_eq!(session.call(&Op::Approve {}, LONG), Ok(Reply::Ok {}));
        fake.join().unwrap();
    }

    #[test]
    fn a_cleared_handler_gets_nothing() {
        let (session, mut server) = connect();
        let net = net_events(&session);
        let frames = frame_events(&session);
        session.set_net(None);
        session.set_frames(None);
        let fake = thread::spawn(move || {
            server.read();
            server.write(&wire::encode_packet(false, remote(), 1));
            server.write(&line::encode(&FrameLine::Present(1)));
            server.reply(&Reply::Ok {});
        });
        assert_eq!(session.call(&Op::Approve {}, LONG), Ok(Reply::Ok {}));
        fake.join().unwrap();
        assert!(net.try_recv().is_err());
        assert!(frames.try_recv().is_err());
    }
}
