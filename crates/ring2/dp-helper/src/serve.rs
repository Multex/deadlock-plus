use std::collections::HashSet;
use std::io::{BufRead, Read, Write};
use std::net::IpAddr;
use std::sync::{Arc, Mutex, PoisonError};

use crate::op::{self, Op, Reply};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Helper,
    Service,
}

pub type Out = Arc<Mutex<dyn Write + Send>>;

/// Returns false when the write fails. A poisoned lock is recovered: a panic elsewhere must not cut the
/// connection, and the writer holds no state a half-finished write could corrupt beyond that one line.
pub fn send(out: &Out, line: &str) -> bool {
    let mut writer = out.lock().unwrap_or_else(PoisonError::into_inner);
    writer.write_all(line.as_bytes()).and_then(|()| writer.flush()).is_ok()
}

enum Line {
    Eof,
    TooLong,
    Text(Vec<u8>),
}

fn read_line(input: &mut impl BufRead) -> std::io::Result<Line> {
    let mut buf = Vec::new();
    // One byte past the cap tells "exactly at the cap" from "over it" without ever holding more.
    input.by_ref().take(op::MAX_LINE_LEN as u64 + 1).read_until(b'\n', &mut buf)?;
    if buf.is_empty() {
        return Ok(Line::Eof);
    }
    if buf.len() <= op::MAX_LINE_LEN || buf.last() == Some(&b'\n') {
        return Ok(if buf.len() > op::MAX_LINE_LEN { Line::TooLong } else { Line::Text(buf) });
    }
    loop {
        let chunk = input.fill_buf()?;
        if chunk.is_empty() {
            break;
        }
        match chunk.iter().position(|&b| b == b'\n') {
            Some(i) => {
                input.consume(i + 1);
                break;
            }
            None => {
                let n = chunk.len();
                input.consume(n);
            }
        }
    }
    Ok(Line::TooLong)
}

fn error(message: impl Into<String>) -> Reply {
    Reply::Error { message: message.into() }
}

fn allowed(op: &Op, mode: Mode) -> Result<(), String> {
    match (op, mode) {
        (Op::Approve {}, Mode::Service) => Err("approve is only accepted by the per-user helper".into()),
        (Op::Revoke {}, Mode::Helper) => Err("revoke is only accepted by the service".into()),
        _ => Ok(()),
    }
}

fn handle(
    line: Vec<u8>,
    mode: Mode,
    relays: &dyn Fn(bool) -> Result<HashSet<IpAddr>, String>,
    exec: &mut dyn FnMut(Op) -> Reply,
) -> Reply {
    let Ok(text) = String::from_utf8(line) else {
        return error("message is not valid UTF-8");
    };
    let op = match op::decode(&text) {
        Ok(op) => op,
        Err(message) => return error(message),
    };
    if let Err(message) = allowed(&op, mode) {
        return error(message);
    }
    if !matches!(op, Op::Block { .. } | Op::RefreshStale { .. }) {
        return match op::validate(&op, &HashSet::new()) {
            Ok(()) => exec(op),
            Err(message) => error(message),
        };
    }
    let checked = relays(false).and_then(|known| match op::validate(&op, &known) {
        Ok(()) => Ok(Ok(())),
        // Valve may have added relays since the set was cached; the cache rate-limits the refetch.
        Err(_) => relays(true).map(|fresh| op::validate(&op, &fresh)),
    });
    match checked {
        Ok(Ok(())) => exec(op),
        Ok(Err(message)) => error(message),
        Err(message) => error(format!("could not load the relay list: {message}")),
    }
}

pub fn serve(
    mut input: impl BufRead,
    out: &Out,
    mode: Mode,
    relays: &dyn Fn(bool) -> Result<HashSet<IpAddr>, String>,
    touch: &dyn Fn(),
    exec: &mut dyn FnMut(Op) -> Reply,
) {
    loop {
        let reply = match read_line(&mut input) {
            Ok(Line::Eof) | Err(_) => return,
            Ok(Line::TooLong) => {
                touch();
                error("message too long")
            }
            Ok(Line::Text(bytes)) => {
                touch();
                handle(bytes, mode, relays, exec)
            }
        };
        if !send(out, &op::encode_reply(&reply)) {
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    struct Shared(Arc<Mutex<Vec<u8>>>);

    impl Write for Shared {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(buf);
            Ok(buf.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    struct Broken;

    impl Write for Broken {
        fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
            Err(std::io::Error::other("closed"))
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    fn sink() -> (Out, Arc<Mutex<Vec<u8>>>) {
        let buf = Arc::new(Mutex::new(Vec::new()));
        (Arc::new(Mutex::new(Shared(buf.clone()))), buf)
    }

    fn replies(buf: &Arc<Mutex<Vec<u8>>>) -> Vec<Reply> {
        let text = String::from_utf8(buf.lock().unwrap().clone()).unwrap();
        text.lines().map(|l| op::decode_reply(l).unwrap()).collect()
    }

    fn is_error(r: &Reply) -> bool {
        matches!(r, Reply::Error { .. })
    }

    fn known(_refresh: bool) -> Result<HashSet<IpAddr>, String> {
        Ok(["155.133.226.1".parse().unwrap()].into_iter().collect())
    }

    struct Run {
        replies: Vec<Reply>,
        executed: Vec<String>,
        touches: usize,
        fetches: usize,
    }

    fn run_with(input: &[u8], mode: Mode, fetch: &dyn Fn(bool) -> Result<HashSet<IpAddr>, String>) -> Run {
        let (out, buf) = sink();
        let touches = std::cell::Cell::new(0);
        let fetches = std::cell::Cell::new(0);
        let mut executed = Vec::new();
        serve(
            Cursor::new(input.to_vec()),
            &out,
            mode,
            &|refresh| {
                fetches.set(fetches.get() + 1);
                fetch(refresh)
            },
            &|| touches.set(touches.get() + 1),
            &mut |op| {
                executed.push(serde_json::to_string(&op).unwrap());
                Reply::Ok {}
            },
        );
        Run { replies: replies(&buf), executed, touches: touches.get(), fetches: fetches.get() }
    }

    fn run(input: &str, mode: Mode) -> Run {
        run_with(input.as_bytes(), mode, &known)
    }

    const BLOCK_OK: &str =
        r#"{"op":"block","groups":[{"group_id":"fra","description":"Frankfurt","relay_ips":["155.133.226.1"]}]}"#;
    const BLOCK_UNKNOWN: &str =
        r#"{"op":"block","groups":[{"group_id":"fra","description":"Frankfurt","relay_ips":["8.8.8.8"]}]}"#;

    #[test]
    fn eof_returns_without_replies() {
        let r = run("", Mode::Helper);
        assert!(r.replies.is_empty() && r.executed.is_empty() && r.touches == 0);
    }

    #[test]
    fn valid_request_is_executed_and_answered() {
        let r = run(&format!("{BLOCK_OK}\n"), Mode::Helper);
        assert_eq!(r.executed.len(), 1);
        assert_eq!(r.replies, vec![Reply::Ok {}]);
        assert_eq!(r.touches, 1);
    }

    #[test]
    fn last_line_without_newline_is_served() {
        let r = run(r#"{"op":"start_net_trace"}"#, Mode::Helper);
        assert_eq!(r.executed.len(), 1);
        assert_eq!(r.replies.len(), 1);
    }

    #[test]
    fn bad_json_gets_error_and_serving_continues() {
        let r = run("not json\n{\"op\":\"start_net_trace\"}\n", Mode::Helper);
        assert!(is_error(&r.replies[0]));
        assert_eq!(r.replies[1], Reply::Ok {});
        assert_eq!(r.executed.len(), 1);
    }

    #[test]
    fn invalid_utf8_gets_error_and_serving_continues() {
        let mut input = vec![0xff, 0xfe, b'\n'];
        input.extend_from_slice(b"{\"op\":\"start_net_trace\"}\n");
        let r = run_with(&input, Mode::Helper, &known);
        assert!(is_error(&r.replies[0]));
        assert_eq!(r.replies[1], Reply::Ok {});
    }

    #[test]
    fn blank_line_gets_error() {
        let r = run("\n", Mode::Helper);
        assert!(is_error(&r.replies[0]));
        assert!(r.executed.is_empty());
    }

    #[test]
    fn failed_validation_never_executes() {
        let r = run(&format!("{BLOCK_UNKNOWN}\n"), Mode::Helper);
        assert!(is_error(&r.replies[0]));
        assert!(r.executed.is_empty());
    }

    #[test]
    fn mixed_lines_answer_in_order() {
        let input = format!("{BLOCK_OK}\ngarbage\n{BLOCK_UNKNOWN}\n{{\"op\":\"stop\",\"trace\":\"net\"}}\n");
        let r = run(&input, Mode::Helper);
        assert_eq!(r.replies.len(), 4);
        assert!(!is_error(&r.replies[0]));
        assert!(is_error(&r.replies[1]));
        assert!(is_error(&r.replies[2]));
        assert!(!is_error(&r.replies[3]));
        assert_eq!(r.executed.len(), 2);
        assert_eq!(r.touches, 4);
    }

    #[test]
    fn oversize_line_is_rejected_and_next_line_still_served() {
        let mut input = vec![b'a'; op::MAX_LINE_LEN * 3 + 17];
        input.push(b'\n');
        input.extend_from_slice(b"{\"op\":\"start_net_trace\"}\n");
        let r = run_with(&input, Mode::Helper, &known);
        assert_eq!(r.replies.len(), 2);
        assert!(is_error(&r.replies[0]));
        assert_eq!(r.replies[1], Reply::Ok {});
        assert_eq!(r.executed.len(), 1);
    }

    #[test]
    fn oversize_line_without_newline_ends_at_eof() {
        let input = vec![b'a'; op::MAX_LINE_LEN + 5];
        let r = run_with(&input, Mode::Helper, &known);
        assert_eq!(r.replies.len(), 1);
        assert!(is_error(&r.replies[0]));
    }

    #[test]
    fn line_just_over_the_cap_is_rejected() {
        let mut input = vec![b' '; op::MAX_LINE_LEN];
        input.push(b'\n');
        let r = run_with(&input, Mode::Helper, &known);
        assert_eq!(r.replies.len(), 1);
        assert!(is_error(&r.replies[0]));
        assert!(r.executed.is_empty());
    }

    #[test]
    fn approve_only_in_helper_mode() {
        let line = "{\"op\":\"approve\"}\n";
        let helper = run(line, Mode::Helper);
        assert_eq!(helper.executed.len(), 1);
        let service = run(line, Mode::Service);
        assert!(is_error(&service.replies[0]));
        assert!(service.executed.is_empty());
    }

    #[test]
    fn revoke_only_in_service_mode() {
        let line = "{\"op\":\"revoke\"}\n";
        let service = run(line, Mode::Service);
        assert_eq!(service.executed.len(), 1);
        let helper = run(line, Mode::Helper);
        assert!(is_error(&helper.replies[0]));
        assert!(helper.executed.is_empty());
    }

    #[test]
    fn relays_are_fetched_only_for_block_and_refresh() {
        let input = format!(
            "{BLOCK_OK}\n{{\"op\":\"unblock\",\"group_ids\":[\"fra\"]}}\n{{\"op\":\"start_net_trace\"}}\n{}\n",
            BLOCK_OK.replace("\"block\"", "\"refresh_stale\"")
        );
        let r = run(&input, Mode::Helper);
        assert_eq!(r.fetches, 2);
        assert_eq!(r.executed.len(), 4);
    }

    #[test]
    fn a_relay_missing_from_the_cached_set_asks_once_for_a_fresh_one() {
        let asked_fresh = std::cell::Cell::new(0);
        let fresh = |refresh: bool| {
            let mut set = known(false)?;
            if refresh {
                asked_fresh.set(asked_fresh.get() + 1);
                set.insert("8.8.8.8".parse().unwrap());
            }
            Ok(set)
        };
        let r = run_with(
            format!(
                "{BLOCK_UNKNOWN}
"
            )
            .as_bytes(),
            Mode::Helper,
            &fresh,
        );
        assert_eq!(r.replies, vec![Reply::Ok {}]);
        assert_eq!(r.executed.len(), 1);
        assert_eq!(asked_fresh.get(), 1);
    }

    #[test]
    fn a_relay_still_missing_after_the_refresh_is_refused() {
        let r = run(
            &format!(
                "{BLOCK_UNKNOWN}
"
            ),
            Mode::Helper,
        );
        assert!(is_error(&r.replies[0]));
        assert!(r.executed.is_empty());
        assert_eq!(r.fetches, 2);
    }

    #[test]
    fn relay_fetch_error_becomes_error_reply_and_serving_continues() {
        let input = format!("{BLOCK_OK}\n{{\"op\":\"start_net_trace\"}}\n");
        let r = run_with(input.as_bytes(), Mode::Helper, &|_| Err("offline".into()));
        assert!(matches!(&r.replies[0], Reply::Error { message } if message.contains("offline")));
        assert_eq!(r.replies[1], Reply::Ok {});
        assert_eq!(r.executed.len(), 1);
    }

    #[test]
    fn stops_when_the_reply_cannot_be_written() {
        let out: Out = Arc::new(Mutex::new(Broken));
        let mut calls = 0;
        serve(
            Cursor::new(b"{\"op\":\"start_net_trace\"}\n{\"op\":\"start_net_trace\"}\n".to_vec()),
            &out,
            Mode::Helper,
            &known,
            &|| {},
            &mut |_| {
                calls += 1;
                Reply::Ok {}
            },
        );
        assert_eq!(calls, 1);
    }

    #[test]
    fn send_reports_write_failure() {
        let out: Out = Arc::new(Mutex::new(Broken));
        assert!(!send(&out, "x\n"));
        let (out, buf) = sink();
        assert!(send(&out, "x\n"));
        assert_eq!(buf.lock().unwrap().as_slice(), b"x\n");
    }

    #[test]
    fn send_survives_a_poisoned_lock() {
        let (out, buf) = sink();
        let clone = out.clone();
        let _ = std::thread::spawn(move || {
            let _guard = clone.lock().unwrap();
            panic!("poison");
        })
        .join();
        assert!(out.is_poisoned());
        assert!(send(&out, "ok\n"));
        assert_eq!(buf.lock().unwrap().as_slice(), b"ok\n");
    }
}
