mod error;
mod steam;

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
use ts_rs::TS;

use notify::event::{CreateKind, ModifyKind};
use notify::{EventKind, RecursiveMode, Watcher};
use serde::Serialize;

use dp_ingest::salts::Salts;
use dp_ingest::scan;
use dp_ingest::seen::Seen;
use dp_sync::LockExt;

use super::toggle::{toggle, Toggle};
use crate::features::error::AppError;
use error::status_error;

const ENDPOINT: &str = "https://api.deadlock-api.com/v1/matches/salts";
const BATCH_SIZE: usize = 1000;
const MAX_RETRIES: u32 = 10;
const RETRY_DELAY: Duration = Duration::from_secs(3);
const POLL: Duration = Duration::from_millis(500);

#[derive(Serialize, Clone, Default, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct IngestStatus {
    pub running: bool,
    pub steam_found: bool,
    pub submitted: u64,
    pub last_error: Option<AppError>,
}

#[derive(Default)]
pub struct IngestService {
    stop: Mutex<Option<Arc<AtomicBool>>>,
    status: Arc<Mutex<IngestStatus>>,
}

impl IngestService {
    pub fn set_enabled(&self, enabled: bool, http: reqwest::Client) {
        let mut slot = self.stop.lock_or_recover();
        match toggle(enabled, slot.is_some()) {
            Toggle::Keep => return,
            Toggle::Stop => {
                if let Some(flag) = slot.take() {
                    flag.store(true, Ordering::Relaxed);
                }
                log::info!("ingest disabled");
                self.status.lock_or_recover().running = false;
                return;
            }
            Toggle::Start => log::info!("ingest enabled"),
        }

        let flag = Arc::new(AtomicBool::new(false));
        *slot = Some(flag.clone());
        let status = self.status.clone();
        status.lock_or_recover().running = true;
        std::thread::Builder::new()
            .name("ingest-watcher".into())
            .spawn(move || {
                run(&flag, &status, &http);
                if !flag.load(Ordering::Relaxed) {
                    status.lock_or_recover().running = false;
                }
            })
            .expect("spawn thread");
    }

    pub fn status(&self) -> IngestStatus {
        self.status.lock_or_recover().clone()
    }

    pub fn stop(&self) {
        if let Some(flag) = self.stop.lock_or_recover().take() {
            flag.store(true, Ordering::Relaxed);
        }
    }
}

fn post(http: &reqwest::Client, salts: &[Salts], stop: &AtomicBool) -> Result<(), AppError> {
    let mut last = String::new();
    let mut last_status = None;
    for attempt in 1..=MAX_RETRIES {
        match tauri::async_runtime::block_on(http.post(ENDPOINT).json(salts).send()) {
            Ok(r) if r.status().is_success() => return Ok(()),
            Ok(r) if r.status().as_u16() == 400 => {
                log::warn!("ingest batch of {} rejected by the API (400)", salts.len());
                return Err(status_error(400));
            }
            Ok(r) => {
                last = format!("HTTP {}", r.status());
                last_status = Some(r.status().as_u16());
            }
            Err(e) => {
                last = e.to_string();
                last_status = None;
            }
        }
        log::debug!("ingest attempt {attempt}/{MAX_RETRIES} failed: {last}");
        if attempt == MAX_RETRIES || stop.load(Ordering::Relaxed) {
            break;
        }
        std::thread::sleep(RETRY_DELAY);
    }
    log::warn!("giving up submitting {} match(es): {last}", salts.len());
    Err(last_status.map_or_else(|| AppError::network(last), status_error))
}

fn submit(http: &reqwest::Client, batch: &[Salts], seen: &mut Seen, status: &Mutex<IngestStatus>, stop: &AtomicBool) {
    submit_with(batch, seen, status, |chunk| post(http, chunk, stop));
}

/// A failed chunk is skipped, not retried here, so the rest still go out; its salts stay unmarked and are
/// offered again on the next scan.
fn submit_with(
    batch: &[Salts],
    seen: &mut Seen,
    status: &Mutex<IngestStatus>,
    mut send: impl FnMut(&[Salts]) -> Result<(), AppError>,
) {
    let fresh: Vec<Salts> = batch.iter().copied().filter(|s| s.is_plausible() && seen.is_new(s)).collect();
    for chunk in fresh.chunks(BATCH_SIZE) {
        match send(chunk) {
            Ok(()) => {
                log::info!("submitted {} match(es) to the Deadlock API", chunk.len());
                chunk.iter().for_each(|s| seen.mark(s));
                let mut st = status.lock_or_recover();
                st.submitted += chunk.len() as u64;
                st.last_error = None;
            }
            Err(e) => status.lock_or_recover().last_error = Some(e),
        }
    }
}

fn initial_scan(cache: &Path, steam_id: Option<u32>) -> Vec<Salts> {
    let mut urls = Vec::new();
    scan::scan_directory(cache, &mut urls);
    urls.iter().filter_map(|u| Salts::from_url(u, steam_id)).collect()
}

fn run(stop: &AtomicBool, status: &Mutex<IngestStatus>, http: &reqwest::Client) {
    let Some(cache) = steam::httpcache_dir() else {
        log::warn!("Steam http cache not found, ingest has nothing to watch");
        status.lock_or_recover().steam_found = false;
        return;
    };
    status.lock_or_recover().steam_found = true;

    let steam_id = dp_steam::current_steam_id32();
    let mut seen = Seen::default();
    let initial = initial_scan(&cache, steam_id);
    log::debug!("ingest initial scan found {} candidate(s)", initial.len());
    submit(http, &initial, &mut seen, status, stop);

    let mut watch_failing = false;
    while !stop.load(Ordering::Relaxed) {
        let (tx, rx) = mpsc::channel();
        let mut watcher = match notify::recommended_watcher(tx) {
            Ok(w) => w,
            Err(e) => {
                if !watch_failing {
                    log::warn!("could not create the cache watcher, retrying: {e}");
                    watch_failing = true;
                }
                std::thread::sleep(RETRY_DELAY);
                continue;
            }
        };
        if let Err(e) = watcher.watch(&cache, RecursiveMode::Recursive) {
            if !watch_failing {
                log::warn!("could not watch the Steam http cache, retrying: {e}");
                watch_failing = true;
            }
            std::thread::sleep(RETRY_DELAY);
            continue;
        }
        if watch_failing {
            log::info!("cache watcher recovered");
            watch_failing = false;
        }

        while !stop.load(Ordering::Relaxed) {
            let Ok(Ok(event)) = rx.recv_timeout(POLL) else {
                continue;
            };
            let relevant = matches!(
                event.kind,
                EventKind::Modify(ModifyKind::Data(_)) | EventKind::Create(CreateKind::Any | CreateKind::File)
            );
            if !relevant {
                continue;
            }
            let batch: Vec<Salts> = event
                .paths
                .iter()
                .filter(|p| p.is_file())
                .flat_map(|p| scan::extract_replay_urls(p))
                .filter_map(|u| Salts::from_url(&u, steam_id))
                .collect();
            submit(http, &batch, &mut seen, status, stop);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn salts(n: u64) -> Vec<Salts> {
        (1..=n)
            .map(|id| Salts {
                match_id: id,
                cluster_id: Some(1),
                metadata_salt: Some(1),
                replay_salt: None,
                username: None,
            })
            .collect()
    }

    #[test]
    fn splits_2500_salts_into_three_requests() {
        let status = Mutex::new(IngestStatus::default());
        let mut sizes = Vec::new();
        submit_with(&salts(2500), &mut Seen::default(), &status, |c| {
            sizes.push(c.len());
            Ok(())
        });
        assert_eq!(sizes, vec![1000, 1000, 500]);
        assert_eq!(status.lock().unwrap().submitted, 2500);
    }

    #[test]
    fn a_failed_batch_does_not_drop_the_others() {
        let status = Mutex::new(IngestStatus::default());
        let mut seen = Seen::default();
        let mut calls = 0;
        submit_with(&salts(2500), &mut seen, &status, |_| {
            calls += 1;
            if calls == 2 {
                Err(status_error(400))
            } else {
                Ok(())
            }
        });
        assert_eq!(calls, 3);
        assert_eq!(status.lock().unwrap().submitted, 1500);
        assert!(seen.is_new(&salts(1500)[1400]));
        assert!(!seen.is_new(&salts(1)[0]));
    }
}

pub mod commands {
    use tauri::State;

    use super::{IngestService, IngestStatus};
    use crate::http::Http;

    #[tauri::command]
    pub fn set_ingest_enabled(enabled: bool, ingest: State<'_, IngestService>, http: State<'_, Http>) {
        ingest.set_enabled(enabled, http.0.clone());
    }

    #[tauri::command]
    pub fn ingest_status(ingest: State<'_, IngestService>) -> IngestStatus {
        ingest.status()
    }
}
