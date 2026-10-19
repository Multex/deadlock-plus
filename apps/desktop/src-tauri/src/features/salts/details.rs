use std::future::Future;
use std::path::Path;
use std::time::{Duration, SystemTime};

use dp_ingest::salts::Salts;
use dp_storage::matches;
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::http::Http;

const CACHE_DIR: &str = "matches";
const TIMEOUT: Duration = Duration::from_secs(30);
/// A real `.meta.bz2` is a few megabytes at most.
const MAX_DOWNLOAD_BYTES: usize = 32 * 1024 * 1024;

/// Top-level key on a cached detail Deadlock+ decoded from Valve's file itself. Match History still asks the
/// Deadlock API for a marked entry and lets the API's copy replace it.
pub const LOCAL_MARK: &str = "deadlock_plus_source";
const LOCAL_SOURCE: &str = "replay_cdn";

pub fn meta_url(salts: &Salts) -> Option<String> {
    Some(dp_postgame::replay_meta_url(salts.cluster_id?, salts.match_id, salts.metadata_salt?))
}

/// Fetches and caches one match's details now, for a match Match History finds neither in the Deadlock API nor
/// in the cache.
pub async fn fetch_detail(app: &AppHandle, salts: &Salts) -> Option<Value> {
    let dir = app.path().app_data_dir().ok()?.join(CACHE_DIR);
    let http = app.state::<Http>().0.clone();
    fetch_one(&dir, salts, SystemTime::now(), &mut |url| download(&http, url)).await
}

#[cfg(test)]
async fn fetch_into<F, Fut>(dir: &Path, salts: &[Salts], now: SystemTime, mut get: F) -> Vec<u64>
where
    F: FnMut(String) -> Fut,
    Fut: Future<Output = Option<Vec<u8>>>,
{
    let mut stored = Vec::new();
    for salts in salts {
        if fetch_one(dir, salts, now, &mut get).await.is_some() {
            stored.push(salts.match_id);
        }
    }
    stored
}

/// `None` for a match already cached, with no URL, or that did not download, decode or save.
async fn fetch_one<F, Fut>(dir: &Path, salts: &Salts, now: SystemTime, get: &mut F) -> Option<Value>
where
    F: FnMut(String) -> Fut,
    Fut: Future<Output = Option<Vec<u8>>>,
{
    let match_id = salts.match_id;
    let url = meta_url(salts)?;
    if cached(dir, match_id, now) {
        return None;
    }
    let detail = decode(&get(url).await?, match_id)?;
    let written = serde_json::to_vec(&detail).map_err(std::io::Error::other);
    match written.and_then(|bytes| matches::write(dir, &match_id.to_string(), &bytes, now)) {
        Ok(()) => Some(detail),
        Err(e) => {
            log::warn!("could not save the details of match {match_id}: {e}");
            None
        }
    }
}

async fn download(http: &reqwest::Client, url: String) -> Option<Vec<u8>> {
    let mut resp = match http.get(&url).timeout(TIMEOUT).send().await {
        Ok(resp) if resp.status().is_success() => resp,
        Ok(resp) => {
            log::debug!("{url} answered {}", resp.status());
            return None;
        }
        Err(e) => {
            log::debug!("{url} failed: {e}");
            return None;
        }
    };
    if resp.content_length().is_some_and(|len| len > MAX_DOWNLOAD_BYTES as u64) {
        log::warn!("{url} is larger than {MAX_DOWNLOAD_BYTES} bytes");
        return None;
    }
    let mut body = Vec::new();
    loop {
        match resp.chunk().await {
            Ok(Some(chunk)) if body.len() + chunk.len() <= MAX_DOWNLOAD_BYTES => body.extend_from_slice(&chunk),
            Ok(Some(_)) => {
                log::warn!("{url} is larger than {MAX_DOWNLOAD_BYTES} bytes");
                return None;
            }
            Ok(None) => return Some(body),
            Err(e) => {
                log::debug!("{url} broke off: {e}");
                return None;
            }
        }
    }
}

fn decode(payload: &[u8], match_id: u64) -> Option<Value> {
    let mut detail = match dp_postgame::meta_detail(payload, dp_postgame::MAX_META_BYTES) {
        Ok(detail) => detail,
        Err(e) => {
            log::warn!("the details of match {match_id} did not decode: {e}");
            return None;
        }
    };
    if detail["match_info"]["match_id"].as_u64() != Some(match_id) {
        log::warn!("the details file of match {match_id} names another match");
        return None;
    }
    detail.as_object_mut()?.insert(LOCAL_MARK.into(), LOCAL_SOURCE.into());
    Some(detail)
}

fn cached(dir: &Path, match_id: u64, now: SystemTime) -> bool {
    matches::read(dir, &match_id.to_string(), now).is_ok_and(|bytes| bytes.is_some())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::path::PathBuf;

    /// A `CMsgMatchMetaData` for match 42,000,000 (1,800 s, one player) under bzip2, as the CDN serves it.
    const FIXTURE_BZ2: &[u8] = &[
        0x42, 0x5a, 0x68, 0x39, 0x31, 0x41, 0x59, 0x26, 0x53, 0x59, 0xa6, 0xc6, 0xc1, 0xa8, 0x00, 0x00, 0x06, 0x7d,
        0x7b, 0xbc, 0xe1, 0xdc, 0x40, 0x10, 0x15, 0x40, 0x10, 0x41, 0x00, 0x40, 0x00, 0x48, 0x40, 0x02, 0x50, 0x00,
        0x40, 0x40, 0x02, 0x40, 0x00, 0x00, 0x00, 0x84, 0x10, 0x20, 0x00, 0x50, 0xc3, 0x04, 0xc0, 0x98, 0x08, 0x68,
        0xc9, 0xa6, 0x04, 0x50, 0x03, 0x10, 0x1a, 0x06, 0x4f, 0x29, 0xe9, 0x3d, 0x35, 0x2d, 0x7a, 0xa7, 0xde, 0x11,
        0xea, 0xb8, 0x8f, 0x31, 0x83, 0x59, 0xe9, 0x13, 0xc8, 0xc1, 0xac, 0x8e, 0x42, 0x10, 0x15, 0x6c, 0xc8, 0xe4,
        0x4a, 0x0e, 0x30, 0x49, 0xa3, 0xa9, 0x90, 0x4d, 0x6b, 0x0f, 0xc5, 0xdc, 0x91, 0x4e, 0x14, 0x24, 0x29, 0xb1,
        0xb0, 0x6a, 0x00,
    ];
    const MATCH: u64 = 42_000_000;

    fn salts(match_id: u64, cluster_id: Option<u32>, metadata_salt: Option<u32>) -> Salts {
        Salts { match_id, cluster_id, metadata_salt, replay_salt: None, username: None }
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-salt-details-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn read(dir: &Path, match_id: u64) -> Option<Value> {
        let bytes = matches::read(dir, &match_id.to_string(), SystemTime::now()).unwrap()?;
        Some(serde_json::from_slice(&bytes).unwrap())
    }

    /// Runs `fetch_into` with a CDN that answers every URL with `reply` and records the URLs asked for.
    fn run(dir: &Path, salts: &[Salts], reply: Option<&[u8]>) -> (Vec<u64>, Vec<String>) {
        let asked = RefCell::new(Vec::new());
        let stored = tauri::async_runtime::block_on(fetch_into(dir, salts, SystemTime::now(), |url| {
            asked.borrow_mut().push(url);
            std::future::ready(reply.map(<[u8]>::to_vec))
        }));
        (stored, asked.into_inner())
    }

    #[test]
    fn the_url_is_built_from_cluster_match_and_metadata_salt() {
        assert_eq!(
            meta_url(&salts(MATCH, Some(123), Some(987_654))).as_deref(),
            Some("http://replay123.valve.net/1422450/42000000_987654.meta.bz2")
        );
    }

    #[test]
    fn no_url_without_a_cluster_or_a_metadata_salt() {
        assert_eq!(meta_url(&salts(MATCH, None, Some(987_654))), None);
        assert_eq!(meta_url(&salts(MATCH, Some(123), None)), None);
    }

    #[test]
    fn a_downloaded_match_is_stored_and_reads_back_marked_as_local() {
        let dir = temp_dir("store");
        let (stored, asked) = run(&dir, &[salts(MATCH, Some(123), Some(987_654))], Some(FIXTURE_BZ2));
        assert_eq!(stored, vec![MATCH]);
        assert_eq!(asked, vec!["http://replay123.valve.net/1422450/42000000_987654.meta.bz2".to_owned()]);

        let detail = read(&dir, MATCH).expect("stored");
        assert_eq!(detail["match_info"]["match_id"], MATCH);
        assert_eq!(detail["match_info"]["duration_s"], 1_800);
        assert_eq!(detail["match_info"]["players"].as_array().unwrap().len(), 1);
        assert_eq!(detail[LOCAL_MARK], LOCAL_SOURCE);
    }

    #[test]
    fn one_match_fetched_on_demand_comes_back_and_is_cached() {
        let dir = temp_dir("one");
        let mut get = |_: String| std::future::ready(Some(FIXTURE_BZ2.to_vec()));
        let detail = tauri::async_runtime::block_on(fetch_one(
            &dir,
            &salts(MATCH, Some(123), Some(987_654)),
            SystemTime::now(),
            &mut get,
        ))
        .expect("fetched");
        assert_eq!(detail["match_info"]["match_id"], MATCH);
        assert_eq!(detail[LOCAL_MARK], LOCAL_SOURCE);
        assert_eq!(read(&dir, MATCH), Some(detail));
    }

    #[test]
    fn api_data_already_cached_is_never_downloaded_over() {
        let dir = temp_dir("api-wins");
        let api = br#"{"match_info":{"match_id":42000000,"duration_s":1801}}"#;
        matches::write(&dir, &MATCH.to_string(), api, SystemTime::now()).unwrap();

        let (stored, asked) = run(&dir, &[salts(MATCH, Some(123), Some(987_654))], Some(FIXTURE_BZ2));
        assert!(stored.is_empty());
        assert!(asked.is_empty());
        assert_eq!(read(&dir, MATCH).unwrap()["match_info"]["duration_s"], 1_801);
    }

    #[test]
    fn the_api_copy_replaces_a_local_one() {
        let dir = temp_dir("replaced");
        run(&dir, &[salts(MATCH, Some(123), Some(987_654))], Some(FIXTURE_BZ2));
        assert_eq!(read(&dir, MATCH).unwrap()[LOCAL_MARK], LOCAL_SOURCE);
        let api = br#"{"match_info":{"match_id":42000000,"duration_s":1801}}"#;
        matches::write(&dir, &MATCH.to_string(), api, SystemTime::now()).unwrap();

        let detail = read(&dir, MATCH).unwrap();
        assert_eq!(detail["match_info"]["duration_s"], 1_801);
        assert!(detail.get(LOCAL_MARK).is_none());
    }

    #[test]
    fn a_match_the_cdn_does_not_serve_is_skipped_and_the_rest_still_run() {
        let dir = temp_dir("missing");
        let (stored, asked) = run(&dir, &[salts(1, Some(1), Some(1)), salts(2, Some(1), Some(2))], None);
        assert!(stored.is_empty());
        assert_eq!(asked.len(), 2);
        assert!(read(&dir, 1).is_none());
    }

    #[test]
    fn salts_without_a_url_are_not_asked_for() {
        let dir = temp_dir("no-url");
        let (stored, asked) = run(&dir, &[salts(MATCH, None, Some(987_654))], Some(FIXTURE_BZ2));
        assert!(stored.is_empty());
        assert!(asked.is_empty());
    }

    #[test]
    fn a_file_that_does_not_decode_or_names_another_match_is_not_stored() {
        let dir = temp_dir("bad");
        let (stored, _) = run(&dir, &[salts(MATCH, Some(1), Some(1))], Some(b"<html>error</html>"));
        assert!(stored.is_empty());

        let (stored, _) = run(&dir, &[salts(7, Some(1), Some(1))], Some(FIXTURE_BZ2));
        assert!(stored.is_empty());
        assert!(read(&dir, 7).is_none());
    }
}
