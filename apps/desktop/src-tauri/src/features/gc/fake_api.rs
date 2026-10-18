use std::collections::VecDeque;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Request {
    /// For example `GET /matches/to-fetch`.
    pub route: String,
    pub cookie: Option<String>,
    pub body: String,
}

pub struct Reply {
    status: &'static str,
    set_cookie: Option<&'static str>,
    body: &'static str,
}

impl Reply {
    pub fn json(body: &'static str) -> Self {
        Self { status: "200 OK", set_cookie: None, body }
    }

    pub fn status(status: &'static str) -> Self {
        Self { status, set_cookie: None, body: "" }
    }

    pub fn set_cookie(mut self, header: &'static str) -> Self {
        self.set_cookie = Some(header);
        self
    }
}

/// A deadlock-api stand-in that answers requests in order with `replies`, then with 404, and
/// records what it was asked.
pub struct FakeApi {
    pub url: String,
    requests: Arc<Mutex<Vec<Request>>>,
}

impl FakeApi {
    pub fn serve(replies: Vec<Reply>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(Vec::new()));
        let log = requests.clone();
        std::thread::spawn(move || {
            let mut replies = VecDeque::from(replies);
            for mut conn in listener.incoming().flatten() {
                let Some(request) = read_request(&mut conn) else { continue };
                log.lock().unwrap().push(request);
                let reply = replies.pop_front().unwrap_or(Reply::status("404 Not Found"));
                let cookie = reply.set_cookie.map(|c| format!("Set-Cookie: {c}\r\n")).unwrap_or_default();
                let head = format!(
                    "HTTP/1.1 {}\r\n{cookie}Content-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    reply.status,
                    reply.body.len()
                );
                let _ = conn.write_all(head.as_bytes());
                let _ = conn.write_all(reply.body.as_bytes());
            }
        });
        Self { url, requests }
    }

    pub fn requests(&self) -> Vec<Request> {
        self.requests.lock().unwrap().clone()
    }
}

fn read_request(conn: &mut impl Read) -> Option<Request> {
    let mut raw = Vec::new();
    let mut buf = [0u8; 1024];
    let head_end = loop {
        if let Some(i) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
            break i + 4;
        }
        let n = conn.read(&mut buf).ok().filter(|&n| n > 0)?;
        raw.extend_from_slice(&buf[..n]);
    };
    let head = String::from_utf8_lossy(&raw[..head_end]).into_owned();
    let mut lines = head.lines();
    let mut start = lines.next()?.split(' ');
    let route = format!("{} {}", start.next()?, start.next()?);
    let header = |wanted: &str| {
        head.lines().find_map(|l| {
            let (name, value) = l.split_once(':')?;
            name.eq_ignore_ascii_case(wanted).then(|| value.trim().to_owned())
        })
    };
    let length: usize = header("content-length").and_then(|v| v.parse().ok()).unwrap_or(0);
    while raw.len() < head_end + length {
        let n = conn.read(&mut buf).ok().filter(|&n| n > 0)?;
        raw.extend_from_slice(&buf[..n]);
    }
    let body = String::from_utf8_lossy(&raw[head_end..head_end + length]).into_owned();
    Some(Request { route, cookie: header("cookie"), body })
}
