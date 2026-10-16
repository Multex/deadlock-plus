use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use dp_gamedata::{ArtCache, MinimapError, MINIMAP_RADIUS};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub(super) const MAP_URL: &str = "https://api.deadlock-api.com/v1/assets/map";
const MAX_PNG_BYTES: usize = 16 * 1024 * 1024;
const REMOTE_MAX_AGE: Duration = Duration::from_secs(7 * 24 * 60 * 60);
const PNG_SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum MinimapSource {
    Local,
    Remote,
}

/// The minimap image and the world-space radius it spans, or why neither the game nor the API could
/// supply it. `local` says why the installed game could not; the download has failed too.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum MinimapArtResult {
    Ready { path: String, radius: f32, source: MinimapSource },
    Unavailable { local: MinimapError },
}

#[derive(Debug, Clone, PartialEq)]
struct MapInfo {
    url: String,
    radius: f32,
}

#[derive(Deserialize)]
struct MapBody {
    radius: Option<f32>,
    images: Option<MapImages>,
}

#[derive(Deserialize)]
struct MapImages {
    minimap: Option<String>,
}

fn allowed_image_url(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else { return false };
    parsed.scheme() == "https"
        && parsed.host_str().is_some_and(|h| h == "deadlock-api.com" || h.ends_with(".deadlock-api.com"))
}

fn parse_map(body: &str) -> Option<MapInfo> {
    let parsed: MapBody = serde_json::from_str(body).ok()?;
    let url = parsed.images?.minimap?;
    if !allowed_image_url(&url) {
        return None;
    }
    let radius = parsed.radius.filter(|r| r.is_finite() && *r > 0.0).unwrap_or(MINIMAP_RADIUS);
    Some(MapInfo { url, radius })
}

fn accept_png(bytes: &[u8]) -> bool {
    bytes.len() <= MAX_PNG_BYTES && bytes.starts_with(&PNG_SIGNATURE)
}

fn store_png(dest: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = dest.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = dest.with_extension("png.part");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, dest).inspect_err(|_| {
        let _ = std::fs::remove_file(&tmp);
    })
}

fn is_fresh(path: &Path, now: SystemTime) -> bool {
    let Ok(modified) = std::fs::metadata(path).and_then(|m| m.modified()) else { return false };
    now.duration_since(modified).is_ok_and(|age| age < REMOTE_MAX_AGE)
}

pub(super) async fn get_bytes(http: &reqwest::Client, url: &str) -> Option<Vec<u8>> {
    let res = http.get(url).send().await.ok()?.error_for_status().ok()?;
    if res.content_length().is_some_and(|n| n > MAX_PNG_BYTES as u64) {
        return None;
    }
    Some(res.bytes().await.ok()?.to_vec())
}

/// The cached download when it is fresh, else a new one. A fresh file is served with the radius the
/// API reports now, or the default when the API cannot be reached.
async fn remote_minimap(http: &reqwest::Client, dest: &Path) -> Option<(PathBuf, f32)> {
    let cached = is_fresh(dest, SystemTime::now());
    let info = match get_bytes(http, MAP_URL).await {
        Some(body) => String::from_utf8(body).ok().and_then(|b| parse_map(&b)),
        None => None,
    };
    if cached {
        let radius = info.map_or(MINIMAP_RADIUS, |i| i.radius);
        return Some((dest.to_path_buf(), radius));
    }
    let info = info?;
    let bytes = get_bytes(http, &info.url).await.filter(|b| accept_png(b))?;
    match store_png(dest, &bytes) {
        Ok(()) => Some((dest.to_path_buf(), info.radius)),
        Err(e) => {
            log::debug!("could not cache the minimap: {e}");
            None
        }
    }
}

pub async fn minimap_art(art: ArtCache, http: &reqwest::Client) -> MinimapArtResult {
    let local_art = art.clone();
    let local = match tauri::async_runtime::spawn_blocking(move || local_art.minimap_art()).await {
        Ok(result) => result,
        Err(e) => {
            log::debug!("minimap extraction task failed: {e}");
            Err(MinimapError::ExtractFailed)
        }
    };
    let local = match local {
        Ok(path) => return MinimapArtResult::Ready { path, radius: MINIMAP_RADIUS, source: MinimapSource::Local },
        Err(e) => e,
    };
    match remote_minimap(http, &art.remote_minimap_path()).await {
        Some((path, radius)) => {
            MinimapArtResult::Ready { path: path.to_string_lossy().into_owned(), radius, source: MinimapSource::Remote }
        }
        None => MinimapArtResult::Unavailable { local },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dp-minimap-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    const BODY: &str = r#"{"radius":10752,"images":{"minimap":"https://assets-bucket.deadlock-api.com/a/minimap.png","plain":"x"},"objective_positions":{}}"#;

    #[test]
    fn the_map_response_gives_the_minimap_url_and_radius() {
        let info = parse_map(BODY).unwrap();
        assert_eq!(info.url, "https://assets-bucket.deadlock-api.com/a/minimap.png");
        assert_eq!(info.radius, 10752.0);
    }

    #[test]
    fn a_missing_or_bad_radius_falls_back_to_the_default() {
        let body = r#"{"images":{"minimap":"https://assets-bucket.deadlock-api.com/m.png"}}"#;
        assert_eq!(parse_map(body).unwrap().radius, MINIMAP_RADIUS);
        let body = r#"{"radius":-4,"images":{"minimap":"https://assets-bucket.deadlock-api.com/m.png"}}"#;
        assert_eq!(parse_map(body).unwrap().radius, MINIMAP_RADIUS);
    }

    #[test]
    fn a_response_without_a_usable_minimap_url_is_rejected() {
        assert!(parse_map("not json").is_none());
        assert!(parse_map(r#"{"radius":1,"images":{}}"#).is_none());
        assert!(parse_map(r#"{"radius":1}"#).is_none());
        assert!(parse_map(r#"{"images":{"minimap":"http://assets-bucket.deadlock-api.com/m.png"}}"#).is_none());
        assert!(parse_map(r#"{"images":{"minimap":"https://evil.example/m.png"}}"#).is_none());
        assert!(parse_map(r#"{"images":{"minimap":"https://deadlock-api.com.evil.example/m.png"}}"#).is_none());
    }

    #[test]
    fn only_png_bodies_are_kept() {
        let mut png = PNG_SIGNATURE.to_vec();
        png.extend_from_slice(b"rest");
        assert!(accept_png(&png));
        assert!(!accept_png(b"<html>"));
        assert!(!accept_png(&[]));
        let mut huge = PNG_SIGNATURE.to_vec();
        huge.resize(MAX_PNG_BYTES + 1, 0);
        assert!(!accept_png(&huge));
    }

    #[test]
    fn a_stored_download_replaces_the_file_and_leaves_no_part_file() {
        let dir = scratch("store");
        let dest = dir.join("store").join("minimap_remote.png");
        store_png(&dest, b"one").unwrap();
        store_png(&dest, b"two").unwrap();
        assert_eq!(fs::read(&dest).unwrap(), b"two");
        assert_eq!(fs::read_dir(dest.parent().unwrap()).unwrap().count(), 1);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_download_is_fresh_for_a_week() {
        let dir = scratch("fresh");
        let file = dir.join("m.png");
        assert!(!is_fresh(&file, SystemTime::now()));
        fs::write(&file, b"x").unwrap();
        let now = SystemTime::now();
        assert!(is_fresh(&file, now));
        assert!(!is_fresh(&file, now + REMOTE_MAX_AGE + Duration::from_secs(60)));
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn the_result_serialises_with_a_status_tag() {
        let ready = MinimapArtResult::Ready { path: "p".into(), radius: 10752.0, source: MinimapSource::Remote };
        assert_eq!(
            serde_json::to_value(ready).unwrap(),
            serde_json::json!({"status":"ready","path":"p","radius":10752.0,"source":"remote"})
        );
        let gone = MinimapArtResult::Unavailable { local: MinimapError::NoInstall };
        assert_eq!(
            serde_json::to_value(gone).unwrap(),
            serde_json::json!({"status":"unavailable","local":"noInstall"})
        );
    }

    #[test]
    #[ignore = "reaches the live API"]
    fn the_live_map_endpoint_downloads_a_png() {
        let dir = scratch("live");
        let dest = dir.join("minimap_remote.png");
        let (path, radius) = tauri::async_runtime::block_on(remote_minimap(&reqwest::Client::new(), &dest)).unwrap();
        assert!(accept_png(&fs::read(path).unwrap()));
        assert!(radius > 0.0);
        fs::remove_dir_all(dir).ok();
    }
}
