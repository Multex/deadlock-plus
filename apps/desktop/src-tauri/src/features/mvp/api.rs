use std::time::Duration;

use reqwest::header::RETRY_AFTER;
use reqwest::{Client, RequestBuilder};

use super::retry::{classify, transport_failure, Reply};

const API: &str = "https://api.deadlock-api.com/v1";
const TIMEOUT: Duration = Duration::from_secs(30);

pub struct Response {
    pub reply: Reply,
    /// The body whatever the status: a rate-limited match history still carries the stored rows.
    pub body: Vec<u8>,
}

async fn send(request: RequestBuilder, attempt: u32) -> Response {
    let failed = |e: reqwest::Error| {
        log::debug!("deadlock api request failed: {e}");
        Response { reply: transport_failure(attempt), body: Vec::new() }
    };
    let res = match request.timeout(TIMEOUT).send().await {
        Ok(res) => res,
        Err(e) => return failed(e),
    };
    let status = res.status().as_u16();
    let header = |name| res.headers().get(name).and_then(|v| v.to_str().ok()).map(str::to_owned);
    let retry_after = header(RETRY_AFTER);
    match res.bytes().await {
        Ok(body) => Response { reply: classify(status, retry_after.as_deref(), attempt), body: body.to_vec() },
        Err(e) => failed(e),
    }
}

pub async fn match_history(client: &Client, account_id: u32) -> Response {
    send(client.get(format!("{API}/players/{account_id}/match-history")), 0).await
}

/// `disable_steam` makes a match the API has not stored fail fast instead of being fetched from Steam.
pub async fn metadata(client: &Client, match_id: u64) -> Response {
    send(client.get(format!("{API}/matches/{match_id}/metadata?disable_steam=true")), 0).await
}

#[cfg(test)]
mod tests {
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;

    use crate::http::Http;

    /// A match's metadata is up to about 1 MB decoded and the API ignores gzip for it, so the app's shared client
    /// must ask for brotli.
    #[test]
    fn the_shared_client_asks_for_brotli() {
        let accept = accept_encoding(Http::default().0);
        assert!(accept.split(',').any(|e| e.trim() == "br"), "{accept}");
        let without = accept_encoding(reqwest::Client::builder().no_brotli().build().unwrap());
        assert!(!without.split(',').any(|e| e.trim() == "br"), "the check tells the two apart: {without}");
    }

    /// The `Accept-Encoding` value `client` sends, read by a one-shot local server.
    fn accept_encoding(client: reqwest::Client) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut headers = Vec::new();
            loop {
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                if line.trim().is_empty() {
                    break;
                }
                headers.push(line.trim().to_ascii_lowercase());
            }
            let mut stream = stream;
            stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}").unwrap();
            headers
        });
        let status = tauri::async_runtime::block_on(async { client.get(url).send().await.unwrap().status() });
        assert_eq!(status, 200);
        let headers = server.join().unwrap();
        headers
            .iter()
            .find_map(|h| h.strip_prefix("accept-encoding:"))
            .map(|v| v.trim().to_string())
            .unwrap_or_default()
    }
}
