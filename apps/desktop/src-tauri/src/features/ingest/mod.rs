pub mod error;
mod steam;

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
use ts_rs::TS;

use notify::event::{CreateKind, ModifyKind};
use notify::{EventKind, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Manager};

use dp_ingest::record::Source;
use dp_ingest::salts::Salts;
use dp_ingest::scan;
use dp_sync::LockExt;

use super::salts::send::send;
use super::toggle::{toggle, Toggle};
use crate::features::error::AppError;

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
    pub fn set_enabled(&self, enabled: bool, app: AppHandle) {
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
                run(&flag, &status, &app);
                if !flag.load(Ordering::Relaxed) {
                    status.lock_or_recover().running = false;
                }
            })
            .expect("spawn thread");
    }

    pub fn enabled(&self) -> bool {
        self.stop.lock_or_recover().is_some()
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

/// The toggle is read here, right before each send, so a scan that finishes after sharing went off sends nothing.
fn share(app: &AppHandle, batch: &[Salts], status: &Mutex<IngestStatus>) {
    if batch.is_empty() || !app.state::<IngestService>().enabled() {
        return;
    }
    let sent = tauri::async_runtime::block_on(send(app, batch, Source::Steam));
    if !sent.salts.is_empty() {
        log::info!("submitted {} match(es) to the Deadlock API", sent.salts.len());
    }
    let mut st = status.lock_or_recover();
    st.submitted += sent.salts.len() as u64;
    if sent.error.is_some() || !sent.salts.is_empty() {
        st.last_error = sent.error;
    }
}

fn initial_scan(cache: &Path, steam_id: Option<u32>) -> Vec<Salts> {
    let mut urls = Vec::new();
    scan::scan_directory(cache, &mut urls);
    urls.iter().filter_map(|u| Salts::from_url(u, steam_id)).collect()
}

fn run(stop: &AtomicBool, status: &Mutex<IngestStatus>, app: &AppHandle) {
    let Some(cache) = steam::httpcache_dir() else {
        log::warn!("Steam http cache not found, ingest has nothing to watch");
        status.lock_or_recover().steam_found = false;
        return;
    };
    status.lock_or_recover().steam_found = true;

    let steam_id = dp_steam::current_steam_id32();
    let initial = initial_scan(&cache, steam_id);
    log::debug!("ingest initial scan found {} candidate(s)", initial.len());
    share(app, &initial, status);

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
            share(app, &batch, status);
        }
    }
}

pub mod commands {
    use tauri::{AppHandle, State};

    use super::{IngestService, IngestStatus};

    #[tauri::command]
    pub fn set_ingest_enabled(enabled: bool, ingest: State<'_, IngestService>, app: AppHandle) {
        ingest.set_enabled(enabled, app);
    }

    #[tauri::command]
    pub fn ingest_status(ingest: State<'_, IngestService>) -> IngestStatus {
        ingest.status()
    }
}
