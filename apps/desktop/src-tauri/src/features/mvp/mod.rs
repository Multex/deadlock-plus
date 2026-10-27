mod adapter;
mod api;
mod dto;
mod history;
mod queue;
mod retry;
mod run;
mod schedule;
mod store;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use dp_gamedata::{CcSet, GameData};
use dp_mvp::LobbyMetadata;
use dp_sync::LockExt;
use reqwest::Client;
use tauri::{AppHandle, Emitter, Manager};

use crate::features::jobs::{Flow, JobHandle, JobSpec, JobsState, Policy};
use crate::features::postgame::PostgameService;
use crate::http::Http;
use adapter::{lobby_from_detail, parse_lobby};
use queue::{source_from, Source};
use retry::Reply;
use run::{plan_for, run_jobs, Deps, DetailCache};
use store::{freshness, Freshness, GradeRecord, Store, MVP_DIR};

pub use dto::MvpMatchGrade;

/// Runs in game too: re-grades are local and fetches go one match at a time, a second apart.
pub(crate) const JOB: JobSpec =
    JobSpec { id: "match-grades", default_policy: Policy::Always, policy_configurable: false };

const EVENT: &str = "mvp://graded";
const FIRST_RUN_DELAY: Duration = Duration::from_secs(30);
/// The frontend's raw metadata cache, written when a match detail is opened.
const DETAIL_CACHE_DIR: &str = "matches";
const MAX_READ_IDS: usize = 200;

#[derive(Default)]
pub struct MvpService {
    /// Until when the API asked to be left alone (`Retry-After` or backoff).
    blocked_until: Mutex<Option<Instant>>,
    /// A match whose detail was opened without a current grade; the next run grades it first.
    opened: Mutex<Option<u64>>,
    legacy_removed: AtomicBool,
    wake: Arc<tokio::sync::Notify>,
}

impl MvpService {
    fn blocked_for(&self) -> Option<Duration> {
        let until = (*self.blocked_until.lock_or_recover())?;
        until.checked_duration_since(Instant::now()).filter(|d| !d.is_zero())
    }

    fn block(&self, wait: Duration) {
        let until = Instant::now() + wait;
        let mut slot = self.blocked_until.lock_or_recover();
        if slot.is_none_or(|current| current < until) {
            *slot = Some(until);
        }
    }

    /// Notes a `Wait` reply; true when the caller should stop calling the API.
    fn note(&self, reply: Reply) -> bool {
        if let Reply::Wait(wait) = reply {
            self.block(wait);
            return true;
        }
        false
    }

    fn open(&self, match_id: u64) {
        *self.opened.lock_or_recover() = Some(match_id);
        self.wake.notify_one();
    }
}

fn data_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok()
}

fn open_store(app: &AppHandle) -> Option<Store> {
    data_dir(app).map(|dir| Store::new(dir.join(MVP_DIR)))
}

fn client(app: &AppHandle) -> Client {
    app.state::<Http>().0.clone()
}

pub fn start(app: &AppHandle) {
    let wake = app.state::<MvpService>().wake.clone();
    app.state::<JobsState>().registry.on_enabled(Box::new(move |id| {
        if id == JOB.id {
            wake.notify_one();
        }
    }));
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let wake = app.state::<MvpService>().wake.clone();
        let _ = tokio::time::timeout(FIRST_RUN_DELAY, wake.notified()).await;
        loop {
            let next = run_once(&app).await;
            let _ = tokio::time::timeout(next, wake.notified()).await;
        }
    });
}

async fn cc_set(app: &AppHandle) -> Arc<CcSet> {
    let app = app.clone();
    match tauri::async_runtime::spawn_blocking(move || app.state::<GameData>().cc_abilities()).await {
        Ok(cc) => cc,
        Err(e) => {
            log::warn!("could not load the crowd control list: {e}");
            Arc::new(CcSet::bundled())
        }
    }
}

/// The newest list-eligible matches from the API history plus the game-captured ones.
async fn candidate_ids(app: &AppHandle, service: &MvpService, account_id: Option<u32>) -> Vec<u64> {
    let Some(account_id) = account_id else { return Vec::new() };
    let mut ids = Vec::new();
    if service.blocked_for().is_none() {
        let res = api::match_history(&client(app), account_id).await;
        service.note(res.reply);
        ids = history::to_grade(&history::parse_history(&res.body), |_| true);
    }
    ids.extend(app.state::<PostgameService>().matches(app, account_id).iter().map(|m| m.game.match_id));
    ids
}

/// One background pass over every match that needs work. Returns the wait before the next pass.
async fn run_once(app: &AppHandle) -> Duration {
    let service = app.state::<MvpService>();
    let Some(store) = open_store(app) else { return schedule::GRADE_INTERVAL };
    if !app.state::<JobsState>().registry.is_enabled(JOB.id) {
        return schedule::GRADE_INTERVAL;
    }
    if !service.legacy_removed.swap(true, Ordering::Relaxed) {
        if let Err(e) = store.remove_legacy_model() {
            log::warn!("could not remove the old match grade model: {e}");
        }
    }
    let cc = cc_set(app).await;
    let version = adapter::grade_version(&cc);
    let account_id = dp_steam::current_steam_id32();
    let extra_ids = candidate_ids(app, &service, account_id).await;
    let opened = service.opened.lock_or_recover().take();
    let jobs = plan_for(opened, &store, &extra_ids, &version);
    if jobs.is_empty() {
        return schedule::next_wake(service.blocked_for());
    }

    let handle = app.state::<JobsState>().registry.register(JOB);
    handle.start();
    let deps = AppDeps {
        app,
        service: &service,
        store: &store,
        cache: data_dir(app).map(|dir| DetailCache { dir: dir.join(DETAIL_CACHE_DIR) }),
        client: client(app),
        handle: &handle,
        account_id,
        started: Instant::now(),
    };
    let end = run_jobs(&deps, &jobs, &cc, &version).await;
    handle.finish();
    log::debug!("match grade run over {} jobs ended: {end:?}", jobs.len());
    schedule::next_wake(service.blocked_for())
}

struct AppDeps<'a> {
    app: &'a AppHandle,
    service: &'a MvpService,
    store: &'a Store,
    cache: Option<DetailCache>,
    client: Client,
    handle: &'a JobHandle,
    account_id: Option<u32>,
    started: Instant,
}

impl Deps for AppDeps<'_> {
    fn record(&self, match_id: u64) -> Option<GradeRecord> {
        self.store.record(match_id)
    }

    fn save(&self, record: &GradeRecord) {
        if let Err(e) = self.store.save_record(record) {
            log::warn!("could not save the grade of match {}: {e}", record.match_id);
            return;
        }
        if let Err(e) = self.app.emit(EVENT, [record.match_id]) {
            log::warn!("could not emit {EVENT}: {e}");
        }
    }

    fn cached(&self, match_id: u64) -> Option<LobbyMetadata> {
        self.cache.as_ref()?.get(match_id)
    }

    fn captured(&self, match_id: u64) -> Option<LobbyMetadata> {
        let detail = self.app.state::<PostgameService>().detail(self.app, self.account_id?, match_id)?;
        lobby_from_detail(detail)
    }

    async fn fetch(&self, match_id: u64) -> Result<LobbyMetadata, Source> {
        if self.service.blocked_for().is_some() {
            return Err(Source::Stop);
        }
        let res = api::metadata(&self.client, match_id).await;
        self.service.note(res.reply);
        match source_from(res.reply) {
            Source::Got => parse_lobby(&res.body).ok_or(Source::Fail),
            failed => Err(failed),
        }
    }

    fn now(&self) -> Duration {
        self.started.elapsed()
    }

    async fn sleep(&self, wait: Duration) {
        tokio::time::sleep(wait).await;
    }

    fn progress(&self, done: usize, total: usize) -> bool {
        self.handle.progress(done, total, None);
        self.handle.checkpoint() == Flow::Continue
    }

    fn interrupted(&self) -> bool {
        self.service.opened.lock_or_recover().is_some()
    }
}

pub mod commands {
    use super::*;
    use crate::command_panics::guarded_infallible;
    use crate::features::error::AppError;

    fn current_grade_version(app: &AppHandle) -> String {
        adapter::grade_version(&app.state::<GameData>().cc_abilities())
    }

    /// Current grades for the given matches; matches without a fresh grade are left out. Never fetches.
    #[tauri::command]
    pub async fn mvp_grades(app: AppHandle, match_ids: Vec<u64>) -> Result<Vec<MvpMatchGrade>, AppError> {
        guarded_infallible(async move {
            let Some(store) = open_store(&app) else { return Vec::new() };
            tauri::async_runtime::spawn_blocking(move || {
                let version = current_grade_version(&app);
                match_ids
                    .into_iter()
                    .take(MAX_READ_IDS)
                    .filter_map(|id| store.record(id))
                    .filter_map(|r| dto::from_record(&r, &version))
                    .collect()
            })
            .await
            .unwrap_or_default()
        })
        .await
    }

    /// The match's current grade. `None` when it is not gradable or has no current grade yet; then the background
    /// run is asked to grade this match first, and `mvp://graded` names it once done.
    #[tauri::command]
    pub async fn mvp_grade_match(app: AppHandle, match_id: u64) -> Result<Option<MvpMatchGrade>, AppError> {
        guarded_infallible(async move {
            let store = open_store(&app)?;
            tauri::async_runtime::spawn_blocking(move || {
                let version = current_grade_version(&app);
                let record = store.record(match_id);
                if freshness(record.as_ref(), &version) != Freshness::Fresh {
                    app.state::<MvpService>().open(match_id);
                }
                record.and_then(|r| dto::from_record(&r, &version))
            })
            .await
            .ok()
            .flatten()
        })
        .await
    }
}
