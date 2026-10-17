mod adapter;
mod api;
mod dto;
mod history;
mod retry;
mod sample;
mod schedule;
mod store;

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use dp_mvp::{build, match_eligible, parse_matches, ModelCache, Sample, SampleMatch};
use dp_postgame::StoredMatch;
use dp_sync::LockExt;
use reqwest::Client;
use tauri::{AppHandle, Emitter, Manager};

use crate::features::jobs::{Flow, JobSpec, JobsState, Policy};
use crate::features::postgame::PostgameService;
use crate::http::Http;
use adapter::{
    is_ranked, match_input, parse_metadata, parse_ranks, rank_batches, rank_lookup_ids, Metadata, Ranks, MAX_RANK_IDS,
};
use retry::{page_step, Reply, Step};
use sample::{is_complexity_error, next_cursor, query_body, MAX_PAGES, PAGE_LIMIT, TARGET_MATCHES, TARGET_ROWS};
use store::{needs_grade, Store, StoredGrade, MVP_DIR};

pub use dto::MvpMatchGrade;

/// Runs in game too: the refresh is a few MB once a week and grading is one small request at a time.
pub(crate) const JOB: JobSpec =
    JobSpec { id: "match-grades", default_policy: Policy::Always, policy_configurable: false };

const EVENT: &str = "mvp://graded";
const FIRST_RUN_DELAY: Duration = Duration::from_secs(30);
/// The frontend's raw metadata cache, written when a match detail is opened.
const DETAIL_CACHE_DIR: &str = "matches";
const MAX_READ_IDS: usize = 200;

#[derive(Default)]
pub struct MvpService {
    model: Mutex<Option<Arc<ModelCache>>>,
    loaded: Mutex<bool>,
    /// Serialises metadata fetches so an opened detail and the background run never fetch the same match twice.
    grading: tokio::sync::Mutex<()>,
    /// Until when the API asked to be left alone (`Retry-After` or backoff).
    blocked_until: Mutex<Option<Instant>>,
    /// When the last refresh failed, in Unix seconds.
    last_failed_refresh: Mutex<Option<i64>>,
    wake: Arc<tokio::sync::Notify>,
}

impl MvpService {
    fn model(&self, store: &Store) -> Option<Arc<ModelCache>> {
        let mut loaded = self.loaded.lock_or_recover();
        if !*loaded {
            *loaded = true;
            *self.model.lock_or_recover() = store.load_model().map(Arc::new);
        }
        drop(loaded);
        self.model.lock_or_recover().clone()
    }

    fn set_model(&self, model: ModelCache) {
        *self.loaded.lock_or_recover() = true;
        *self.model.lock_or_recover() = Some(Arc::new(model));
    }

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
}

fn now_secs() -> i64 {
    SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map_or(0, |d| d.as_secs() as i64)
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
        tokio::time::sleep(FIRST_RUN_DELAY).await;
        loop {
            let next = run_once(&app).await;
            let wake = app.state::<MvpService>().wake.clone();
            let _ = tokio::time::timeout(next, wake.notified()).await;
        }
    });
}

/// One background pass: refresh the model if due, then grade new matches. Returns the wait before the next pass.
async fn run_once(app: &AppHandle) -> Duration {
    let service = app.state::<MvpService>();
    let Some(store) = open_store(app) else { return schedule::REFRESH_RETRY };
    if !app.state::<JobsState>().registry.is_enabled(JOB.id) {
        return schedule::GRADE_INTERVAL;
    }
    let mut model = service.model(&store);
    let now = now_secs();
    let plan = schedule::plan(model.as_deref(), now, *service.last_failed_refresh.lock_or_recover());
    if plan.refresh && service.blocked_for().is_none() {
        match refresh(app, &client(app), &store).await {
            Some(fresh) => {
                *service.last_failed_refresh.lock_or_recover() = None;
                service.set_model(fresh);
                model = service.model(&store);
            }
            None => *service.last_failed_refresh.lock_or_recover() = Some(now),
        }
    }
    if let Some(model) = &model {
        grade_recent(app, &store, model).await;
    }
    schedule::next_wake(model.is_some(), service.blocked_for())
}

/// Fetches and builds a new model, saved whole or not at all. `None` keeps the last good one.
async fn refresh(app: &AppHandle, client: &Client, store: &Store) -> Option<ModelCache> {
    let jobs = app.state::<JobsState>();
    let handle = jobs.registry.register(JOB);
    handle.start();
    let fetched = fetch_sample(client, |done, total| {
        handle.progress(done, total, None);
        handle.checkpoint() == Flow::Continue
    })
    .await;
    let built = match fetched {
        Ok((matches, built_at)) => {
            let rows = matches.iter().map(|m| m.players.len()).sum::<usize>();
            log::info!("match grade sample: {} matches, {rows} rows", matches.len());
            tauri::async_runtime::spawn_blocking(move || {
                Sample::from_matches(&matches).and_then(|sample| build(&sample, built_at, TARGET_ROWS))
            })
            .await
            .map_err(|e| e.to_string())
            .and_then(|r| r.map_err(|e| e.to_string()))
        }
        Err(Fetch::Wait(wait)) => {
            app.state::<MvpService>().block(wait);
            Err(format!("API busy, retrying in {}s", wait.as_secs()))
        }
        Err(Fetch::Failed(e)) => Err(e),
        Err(Fetch::Cancelled) => Err("cancelled".into()),
    };
    handle.finish();
    match built {
        Ok(model) => match store.save_model(&model) {
            Ok(()) => {
                log::info!("match grade model rebuilt from {} rows", model.sample.rows);
                Some(model)
            }
            Err(e) => {
                log::warn!("could not save the match grade model: {e}");
                None
            }
        },
        Err(e) => {
            log::warn!("match grade model refresh failed: {e}");
            None
        }
    }
}

enum Fetch {
    Wait(Duration),
    Failed(String),
    Cancelled,
}

/// Keyset pages, newest matches first, until [`TARGET_MATCHES`] were asked for. A complexity error halves the
/// page once. `on_page(done, total)` returns false to cancel.
async fn fetch_sample(
    client: &Client,
    mut on_page: impl FnMut(usize, usize) -> bool,
) -> Result<(Vec<SampleMatch>, i64), Fetch> {
    let (mut limit, mut halved) = (PAGE_LIMIT, false);
    let (mut cursor, mut requested, mut pages) = (None, 0u32, 0usize);
    let mut built_at = None;
    let mut all = Vec::new();
    while requested < TARGET_MATCHES && pages < MAX_PAGES {
        let total = pages + (TARGET_MATCHES - requested).div_ceil(limit) as usize;
        if !on_page(pages, total) {
            return Err(Fetch::Cancelled);
        }
        let mut attempt = 0;
        let res = loop {
            let res = api::graphql(client, query_body(limit, cursor), attempt).await;
            match page_step(res.reply, attempt) {
                Step::Done => break res,
                Step::Retry(wait) => {
                    tokio::time::sleep(wait).await;
                    attempt += 1;
                }
                Step::Stop(Some(wait)) => return Err(Fetch::Wait(wait)),
                Step::Stop(None) => return Err(Fetch::Failed(format!("sample page answered {:?}", res.reply))),
            }
        };
        let body = std::str::from_utf8(&res.body).map_err(|e| Fetch::Failed(e.to_string()))?;
        let page = match parse_matches(body) {
            Ok(page) => page,
            Err(e) if is_complexity_error(&e) && !halved => {
                halved = true;
                limit /= 2;
                continue;
            }
            Err(e) => return Err(Fetch::Failed(e.to_string())),
        };
        built_at = built_at.or(res.date);
        pages += 1;
        requested += limit;
        let Some(next) = next_cursor(&page) else { break };
        cursor = Some(next);
        all.extend(page);
    }
    let built_at = built_at.ok_or_else(|| Fetch::Failed("the sample response had no Date header".into()))?;
    Ok((all, built_at))
}

enum Source {
    Got(Box<Metadata>),
    NotYet,
    Stop,
}

async fn fetch_metadata(service: &MvpService, client: &Client, match_id: u64) -> Source {
    if service.blocked_for().is_some() {
        return Source::Stop;
    }
    let res = api::metadata(client, match_id).await;
    if service.note(res.reply) {
        return Source::Stop;
    }
    match res.reply {
        Reply::Ok => parse_metadata(&res.body).map_or(Source::NotYet, |m| Source::Got(Box::new(m))),
        _ => Source::NotYet,
    }
}

fn provisional_detail(app: &AppHandle, account_id: u32, match_id: u64) -> Option<Metadata> {
    let detail = app.state::<PostgameService>().detail(app, account_id, match_id)?;
    serde_json::from_value(detail).ok()
}

fn cached_detail(app: &AppHandle, match_id: u64) -> Option<Metadata> {
    let dir = data_dir(app)?.join(DETAIL_CACHE_DIR);
    let bytes = dp_storage::matches::read(&dir, &match_id.to_string(), SystemTime::now()).ok()??;
    parse_metadata(&bytes)
}

/// Grades and stores `meta` unless a non-provisional grade got there first.
fn store_grade(store: &Store, model: &ModelCache, meta: &Metadata, ranks: &Ranks, provisional: bool) -> StoredGrade {
    let match_id = meta.match_info.match_id;
    if let Some(existing) = store.grade(match_id).filter(|s| !s.provisional) {
        return existing;
    }
    let stored = StoredGrade { match_id, provisional, grade: model.grade(&match_input(meta, ranks)) };
    if let Err(e) = store.save_grade(&stored) {
        log::warn!("could not save the grade of match {match_id}: {e}");
    }
    stored
}

/// Whether grading `meta` needs a `/players/rank` call first: an eligible unranked match.
fn needs_ranks(meta: &Metadata) -> bool {
    !is_ranked(meta) && match_eligible(&match_input(meta, &Ranks::new()))
}

/// Grades every match in `fetched`: ranked and ineligible ones at once, unranked ones after one rank call per
/// batch. Unranked matches whose rank call fails stay ungraded for a later run.
async fn grade_fetched(
    service: &MvpService,
    client: &Client,
    store: &Store,
    model: &ModelCache,
    fetched: Vec<(Metadata, bool)>,
) -> Vec<u64> {
    let (unranked, direct): (Vec<_>, Vec<_>) = fetched.into_iter().partition(|(meta, _)| needs_ranks(meta));
    let mut graded: Vec<u64> = direct
        .iter()
        .map(|(meta, provisional)| store_grade(store, model, meta, &Ranks::new(), *provisional).match_id)
        .collect();
    let ids_per_match: Vec<Vec<u32>> = unranked.iter().map(|(meta, _)| rank_lookup_ids(meta)).collect();
    for batch in rank_batches(&ids_per_match, MAX_RANK_IDS) {
        if service.blocked_for().is_some() {
            break;
        }
        let ids: Vec<u32> =
            batch.iter().flat_map(|&i| ids_per_match[i].iter().copied()).collect::<HashSet<_>>().into_iter().collect();
        let res = api::ranks(client, &ids).await;
        if service.note(res.reply) {
            break;
        }
        let Some(ranks) = (res.reply == Reply::Ok).then(|| parse_ranks(&res.body)).flatten() else {
            log::debug!("rank lookup for {} matches failed: {:?}", batch.len(), res.reply);
            continue;
        };
        for i in batch {
            let (meta, provisional) = &unranked[i];
            graded.push(store_grade(store, model, meta, &ranks, *provisional).match_id);
        }
    }
    graded
}

async fn grade_recent(app: &AppHandle, store: &Store, model: &ModelCache) {
    let service = app.state::<MvpService>();
    let Some(account_id) = dp_steam::current_steam_id32() else { return };
    if service.blocked_for().is_some() {
        return;
    }
    let client = client(app);
    let res = api::match_history(&client, account_id).await;
    service.note(res.reply);
    let rows = history::parse_history(&res.body);
    let ids = history::to_grade(&rows, |id| needs_grade(store.grade(id).as_ref()));

    let mut fetched = Vec::new();
    for match_id in ids {
        let _fetching = service.grading.lock().await;
        if !needs_grade(store.grade(match_id).as_ref()) {
            continue;
        }
        match fetch_metadata(&service, &client, match_id).await {
            Source::Got(meta) => fetched.push((*meta, false)),
            Source::NotYet => {}
            Source::Stop => break,
        }
    }

    let listed: HashSet<u64> = rows.iter().map(|r| r.match_id).collect();
    let captured: Vec<StoredMatch> = app.state::<PostgameService>().matches(app, account_id);
    for m in captured.iter().filter(|m| !listed.contains(&m.game.match_id) && store.grade(m.game.match_id).is_none()) {
        if let Some(meta) = provisional_detail(app, account_id, m.game.match_id) {
            fetched.push((meta, true));
        }
    }

    if fetched.is_empty() {
        return;
    }
    let graded = grade_fetched(&service, &client, store, model, fetched).await;
    log::debug!("graded {} matches", graded.len());
    if let Err(e) = app.emit(EVENT, &graded) {
        log::warn!("could not emit {EVENT}: {e}");
    }
}

/// Grades one match now: the stored grade, else the opened detail's cached metadata, the API, or the game's copy.
async fn grade_one(app: &AppHandle, match_id: u64) -> Option<StoredGrade> {
    let store = open_store(app)?;
    if let Some(stored) = store.grade(match_id) {
        return Some(stored);
    }
    let service = app.state::<MvpService>();
    let model = service.model(&store)?;
    let _fetching = service.grading.lock().await;
    if let Some(stored) = store.grade(match_id) {
        return Some(stored);
    }
    let client = client(app);
    let (meta, provisional) = match cached_detail(app, match_id) {
        Some(meta) => (meta, false),
        None => match fetch_metadata(&service, &client, match_id).await {
            Source::Got(meta) => (*meta, false),
            Source::NotYet | Source::Stop => {
                let account_id = dp_steam::current_steam_id32()?;
                (provisional_detail(app, account_id, match_id)?, true)
            }
        },
    };
    grade_fetched(&service, &client, &store, &model, vec![(meta, provisional)]).await;
    store.grade(match_id)
}

pub mod commands {
    use super::*;

    /// Stored grades for the given matches; matches without a grade are left out. Never fetches.
    #[tauri::command]
    pub async fn mvp_grades(app: AppHandle, match_ids: Vec<u64>) -> Vec<MvpMatchGrade> {
        let Some(store) = open_store(&app) else { return Vec::new() };
        tauri::async_runtime::spawn_blocking(move || {
            match_ids
                .into_iter()
                .take(MAX_READ_IDS)
                .filter_map(|id| store.grade(id))
                .filter_map(|s| dto::to_view(&s))
                .collect()
        })
        .await
        .unwrap_or_default()
    }

    /// The match's grade, grading it first if needed. `None` when it is not gradable or cannot be graded yet.
    #[tauri::command]
    pub async fn mvp_grade_match(app: AppHandle, match_id: u64) -> Option<MvpMatchGrade> {
        grade_one(&app, match_id).await.as_ref().and_then(dto::to_view)
    }
}

#[cfg(test)]
mod live {
    use super::*;

    /// Fetches the real sample, builds the model and grades the newest sample match from its metadata.
    #[test]
    #[ignore = "reaches the live API (about 10 MB, 15 s)"]
    fn the_live_sample_builds_and_grades_a_match() {
        let client = Http::default().0;
        tauri::async_runtime::block_on(async {
            let started = Instant::now();
            let mut pages = Vec::new();
            let (matches, built_at) = match fetch_sample(&client, |done, total| {
                pages.push((done, total, started.elapsed()));
                true
            })
            .await
            {
                Ok(fetched) => fetched,
                Err(Fetch::Wait(w)) => panic!("API asked to wait {w:?}"),
                Err(Fetch::Failed(e)) => panic!("{e}"),
                Err(Fetch::Cancelled) => unreachable!(),
            };
            let fetched_in = started.elapsed();
            let sample = Sample::from_matches(&matches).unwrap();
            let model = build(&sample, built_at, TARGET_ROWS).unwrap();
            let json = serde_json::to_vec(&model).unwrap();
            println!(
                "pages {pages:?}; fetched {} matches in {fetched_in:?}; usable rows {}; built_at {built_at} (now {}); \
                 model {} bytes, {} heroes",
                matches.len(),
                sample.rows.len(),
                now_secs(),
                json.len(),
                model.heroes.len()
            );
            assert!(!model.needs_refresh(now_secs()));

            let newest = matches.iter().map(|m| m.match_id).max().unwrap();
            let res = api::metadata(&client, newest).await;
            println!("metadata {newest}: {:?}, {} bytes", res.reply, res.body.len());
            let meta = parse_metadata(&res.body).expect("metadata parses");
            let ids = rank_lookup_ids(&meta);
            let ranks = if ids.is_empty() {
                Ranks::new()
            } else {
                let res = api::ranks(&client, &ids).await;
                println!("ranks for {} ids: {:?}", ids.len(), res.reply);
                parse_ranks(&res.body).unwrap_or_default()
            };
            let input = match_input(&meta, &ranks);
            let grade = model.grade(&input);
            println!("lobby badge {:?}; grade {:?}", input.lobby_badge, grade.as_ref().map(|g| g.players.len()));
            assert!(grade.is_some_and(|g| !g.players.is_empty()));
        });
    }
}
