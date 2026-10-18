mod api;
mod error;
#[cfg(test)]
mod fake_api;
mod own;

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use serde::de::DeserializeOwned;
use serde::Serialize;
use tauri::{AppHandle, Manager};
use tokio::time::Instant;
use ts_rs::TS;

use dp_gc::auth::{self, AuthContext};
use dp_gc::client::{GcSession, RecoveredSalts};
use dp_gc::error::GcError as SteamGcError;
use dp_gc::friends;
use dp_gc::ledger::{FriendCooldowns, SaltAttempts};
use dp_gc::pass::{fetch_loop, history_loop, with_release, AccountState, Host, GC_BACKOFF_SECS};
use dp_gc::picks::fresh_newest_first;
use dp_gc::quota::SaltQuota;
use dp_ingest::salts::Salts;
use dp_kv::KvStore;
use dp_sync::LockExt;

use super::stop::StopSignal;
use super::toggle::{toggle, Toggle};
use crate::features::error::AppError;
use crate::http::Http;
use error::GcError;
pub use own::{DetailCoverage, LastRun, OwnRecovery};
use own::{KvRunStore, Run, RunEnd, RunStore};

const SALTS_URL: &str = "https://api.deadlock-api.com/v1/matches/salts";
const STORE: &str = "gc-state";
const ACCOUNTS_KEY: &str = "accounts";
const ATTEMPTS_KEY: &str = "salt_attempts";
const COOLDOWNS_KEY: &str = "friend_cooldowns";
const MIN_REQUEST_INTERVAL: Duration = Duration::from_secs(20);
const PASS_INTERVAL: Duration = Duration::from_secs(30 * 60);
const MAX_POST_ATTEMPTS: u32 = 10;
const POST_RETRY_DELAY: Duration = Duration::from_secs(3);
const HTTP_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Serialize, Clone, Default, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct GcStatus {
    pub running: bool,
    pub accounts: u32,
    pub delivered: u64,
    pub last_error: Option<AppError>,
    pub own_recovery: Option<OwnRecovery>,
    pub last_run: Option<LastRun>,
}

/// State the background worker and a recovery run share.
#[derive(Default)]
struct Shared {
    status: Mutex<GcStatus>,
    /// Held by whoever is talking to the GC, so a background pass and a recovery run never sign
    /// in to the same account at once.
    gc_lock: tokio::sync::Mutex<()>,
    /// Recovery drives waiting for or holding `gc_lock`. A background pass stops at its next
    /// request while this is not zero, so a run never waits for a whole pass.
    recovering: AtomicUsize,
    to_fetch: api::ToFetch,
    /// Steam ids of the accounts saved on this PC. Reading them decrypts Steam's login cache, so
    /// the status poll reads them once; a background pass or a recovery drive refreshes them.
    saved_accounts: Mutex<Option<Vec<u64>>>,
}

impl Shared {
    fn saved_steam_ids(&self) -> Vec<u64> {
        self.saved_accounts
            .lock_or_recover()
            .get_or_insert_with(|| steam_accounts().map(|c| steam_ids(&c)).unwrap_or_default())
            .clone()
    }

    fn remember_accounts(&self, contexts: &[AuthContext]) {
        *self.saved_accounts.lock_or_recover() = Some(steam_ids(contexts));
    }
}

fn steam_ids(contexts: &[AuthContext]) -> Vec<u64> {
    contexts.iter().map(|c| c.steam_id64).collect()
}

#[derive(Default)]
pub struct GcService {
    stop: Mutex<Option<Arc<StopSignal>>>,
    shared: Arc<Shared>,
    recovery: OnceLock<Arc<Recovery<AppDriver>>>,
}

impl GcService {
    pub fn set_enabled(&self, enabled: bool, app: AppHandle, http: reqwest::Client) {
        let mut slot = self.stop.lock_or_recover();
        match toggle(enabled, slot.is_some()) {
            Toggle::Keep => return,
            Toggle::Stop => {
                if let Some(stop) = slot.take() {
                    stop.stop();
                }
                log::info!("gc salt recovery disabled");
                self.shared.status.lock_or_recover().running = false;
                return;
            }
            Toggle::Start => log::info!("gc salt recovery enabled"),
        }

        let stop = Arc::new(StopSignal::default());
        *slot = Some(stop.clone());
        let shared = self.shared.clone();
        shared.status.lock_or_recover().running = true;
        std::thread::Builder::new()
            .name("gc-salt-recovery".into())
            .spawn(move || {
                run(&stop, &shared, &app, &http);
                if !stop.is_stopped() {
                    shared.status.lock_or_recover().running = false;
                }
            })
            .expect("spawn thread");
    }

    fn recovery(&self, app: &AppHandle) -> &Arc<Recovery<AppDriver>> {
        self.recovery.get_or_init(|| {
            self.shared.status.lock_or_recover().last_run = own::load_last_run(app);
            let http = app.state::<Http>().0.clone();
            let driver = AppDriver { app: app.clone(), http, shared: self.shared.clone() };
            Recovery::new(Run::restore(own::load_run(app)), driver)
        })
    }

    /// Picks up a run an earlier session left going. Call once from `setup()`.
    pub fn restore(&self, app: &AppHandle) {
        self.recovery(app).continue_run();
    }

    /// Needs no background toggle: asking for a run is consent for that run.
    pub fn recover_matches(&self, app: &AppHandle, ids: &[u64], with_history: bool) -> Result<(), AppError> {
        self.recovery(app).start(ids, with_history)
    }

    pub fn pause_recovery(&self, app: &AppHandle) {
        self.recovery(app).pause();
    }

    pub fn resume_recovery(&self, app: &AppHandle) {
        self.recovery(app).resume();
    }

    pub fn cancel_recovery(&self, app: &AppHandle) {
        self.recovery(app).cancel();
    }

    pub fn status(&self) -> GcStatus {
        let mut status = self.shared.status.lock_or_recover().clone();
        status.own_recovery = self.recovery.get().and_then(|r| r.status());
        status
    }

    pub fn stop(&self) {
        if let Some(stop) = self.stop.lock_or_recover().take() {
            stop.stop();
        }
        if let Some(recovery) = self.recovery.get() {
            recovery.stop();
        }
    }
}

/// Continues a waiting recovery run once Deadlock closes. The game poller calls it on every change.
pub fn on_game_probe(app: &AppHandle, last: Option<bool>, running: bool) {
    app.state::<GcService>().recovery(app).on_game_probe(last, running);
}

/// What a recovery run needs from the app: Steam, saved state, the clock and threads.
trait Driver: Send + Sync + 'static {
    type Store<'a>: RunStore
    where
        Self: 'a;

    fn store(&self) -> Self::Store<'_>;
    /// Every Steam account saved on this PC, with its daily limit as the background pass keeps it.
    fn saved_accounts(&self) -> Vec<(u32, SaltQuota)>;
    fn game_running(&self) -> bool;
    fn now(&self) -> i64;
    /// Drives `run` until it stops. The caller holds the run's driver slot.
    fn drive(&self, run: &Run, stop: &StopSignal) -> RunEnd;
    /// Blocks until `until` (unix seconds). Returns whether `stop` cut it short.
    fn sleep_until(&self, until: i64, stop: &StopSignal) -> bool;
    fn spawn(&self, name: &str, work: Box<dyn FnOnce() + Send>);
}

struct AppDriver {
    app: AppHandle,
    http: reqwest::Client,
    shared: Arc<Shared>,
}

impl Driver for AppDriver {
    type Store<'a> = KvRunStore<'a>;

    fn store(&self) -> KvRunStore<'_> {
        KvRunStore { app: &self.app, shared: &self.shared }
    }

    fn saved_accounts(&self) -> Vec<(u32, SaltQuota)> {
        let steam_ids = self.shared.saved_steam_ids();
        if steam_ids.is_empty() {
            return Vec::new();
        }
        let ledger: States = load(&self.app, ACCOUNTS_KEY);
        steam_ids
            .into_iter()
            .map(|id| {
                (auth::account_id_of(id), ledger.get(&id.to_string()).map(|s| s.quota.clone()).unwrap_or_default())
            })
            .collect()
    }

    fn game_running(&self) -> bool {
        dp_game::is_running()
    }

    fn now(&self) -> i64 {
        now_secs()
    }

    fn drive(&self, run: &Run, stop: &StopSignal) -> RunEnd {
        self.shared.recovering.fetch_add(1, Ordering::AcqRel);
        let end = own::drive_blocking(run, stop, &self.shared, &self.app, &self.http);
        self.shared.recovering.fetch_sub(1, Ordering::AcqRel);
        end
    }

    fn sleep_until(&self, until: i64, stop: &StopSignal) -> bool {
        let secs = u64::try_from(until - now_secs()).unwrap_or(0);
        stop.wait(Duration::from_secs(secs))
    }

    fn spawn(&self, name: &str, work: Box<dyn FnOnce() + Send>) {
        std::thread::Builder::new().name(name.into()).spawn(work).expect("spawn thread");
    }
}

/// The recovery run and what continues it on its own: Deadlock closing and the daily limit
/// reopening. A paused run only continues on Resume.
struct Recovery<D: Driver> {
    run: Run,
    driver: D,
    /// Stopped when the app exits.
    stop: StopSignal,
    timer: Mutex<Option<Arc<StopSignal>>>,
}

impl<D: Driver> Recovery<D> {
    fn new(run: Run, driver: D) -> Arc<Self> {
        Arc::new(Self { run, driver, stop: StopSignal::default(), timer: Mutex::new(None) })
    }

    fn start(self: &Arc<Self>, ids: &[u64], with_history: bool) -> Result<(), AppError> {
        let under_way = self.status().is_some_and(|s| s.running || s.paused);
        if !under_way && self.driver.game_running() {
            return Err(GcError::GameRunning.into());
        }
        if self.run.start(ids, with_history, &mut self.driver.store()) {
            self.drive();
        }
        Ok(())
    }

    fn pause(&self) {
        self.run.pause(&mut self.driver.store());
    }

    fn resume(self: &Arc<Self>) {
        if self.run.resume(&mut self.driver.store()) {
            self.drive();
        }
    }

    fn cancel(&self) {
        self.run.cancel(&mut self.driver.store(), self.driver.now());
        if let Some(timer) = self.timer.lock_or_recover().take() {
            timer.stop();
        }
    }

    /// Continues a run that is neither paused nor already driving.
    fn continue_run(self: &Arc<Self>) {
        if self.run.claim_driver() {
            self.drive();
        }
    }

    fn on_game_probe(self: &Arc<Self>, last: Option<bool>, running: bool) {
        if last == Some(true) && !running {
            self.continue_run();
        }
    }

    fn drive(self: &Arc<Self>) {
        let this = self.clone();
        self.driver.spawn(
            "gc-match-recovery",
            Box::new(move || {
                if let RunEnd::DailyLimit { until } = this.driver.drive(&this.run, &this.stop) {
                    this.continue_at(until);
                }
            }),
        );
    }

    fn continue_at(self: &Arc<Self>, until: i64) {
        let timer = Arc::new(StopSignal::default());
        if let Some(old) = self.timer.lock_or_recover().replace(timer.clone()) {
            old.stop();
        }
        let this = self.clone();
        self.driver.spawn(
            "gc-match-recovery-timer",
            Box::new(move || {
                if !this.driver.sleep_until(until, &timer) && !this.stop.is_stopped() {
                    this.continue_run();
                }
            }),
        );
    }

    /// None only with no run and no saved Steam account. A run waiting for Deadlock to close or for
    /// the daily limit reads as running: it continues on its own.
    fn status(&self) -> Option<OwnRecovery> {
        let mut s = self.run.status_for(self.driver.now(), &self.driver.saved_accounts());
        s.running |= s.waiting.is_some();
        (s.running || s.paused || s.outcome.is_some() || !s.accounts.is_empty()).then_some(s)
    }

    fn stop(&self) {
        self.stop.stop();
        if let Some(timer) = self.timer.lock_or_recover().take() {
            timer.stop();
        }
    }
}

pub fn to_ingest_salts(salts: RecoveredSalts) -> Salts {
    Salts {
        match_id: salts.match_id,
        cluster_id: salts.cluster_id,
        metadata_salt: salts.metadata_salt,
        replay_salt: salts.replay_salt,
        username: Some(salts.account_id),
    }
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

fn steam_accounts() -> Result<Vec<AuthContext>, AppError> {
    let steam_dir = dp_steam::steam_root().ok_or(GcError::SteamNotFound)?;
    auth::recover_all(&steam_dir).map_err(|e| AppError::new(GcError::NoLogin).detail(e))
}

fn load<T: DeserializeOwned + Default>(app: &AppHandle, key: &str) -> T {
    let Ok(dir) = app.path().app_data_dir() else { return T::default() };
    let value = app.state::<KvStore>().get(&dir, STORE, key).ok().flatten();
    value.and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default()
}

fn save(app: &AppHandle, key: &str, value: &impl Serialize) {
    let Ok(dir) = app.path().app_data_dir() else { return };
    let Ok(value) = serde_json::to_value(value) else { return };
    if let Err(e) = app.state::<KvStore>().set(&dir, STORE, key, value) {
        log::warn!("could not save gc state: {e}");
    }
}

type States = std::collections::HashMap<String, AccountState>;

/// Everything a background pass keeps across restarts.
#[derive(Default)]
struct Ledger {
    accounts: States,
    attempts: SaltAttempts,
    cooldowns: FriendCooldowns,
}

impl Ledger {
    fn load(app: &AppHandle) -> Self {
        Self {
            accounts: load(app, ACCOUNTS_KEY),
            attempts: load(app, ATTEMPTS_KEY),
            cooldowns: load(app, COOLDOWNS_KEY),
        }
    }

    fn save(&self, app: &AppHandle) {
        save(app, ACCOUNTS_KEY, &self.accounts);
        save(app, ATTEMPTS_KEY, &self.attempts);
        save(app, COOLDOWNS_KEY, &self.cooldowns);
    }
}

/// Posts one match's salts, retrying network failures. A 400 is final.
async fn post_salts(http: &reqwest::Client, salts: RecoveredSalts, halted: &impl Fn() -> bool) -> bool {
    let body = [to_ingest_salts(salts)];
    let mut last = String::new();
    for attempt in 1..=MAX_POST_ATTEMPTS {
        match http.post(SALTS_URL).timeout(HTTP_TIMEOUT).json(&body).send().await {
            Ok(r) if r.status().is_success() => {
                log::debug!("gc: submitted match {}", salts.match_id);
                return true;
            }
            Ok(r) if r.status() == reqwest::StatusCode::BAD_REQUEST => {
                log::warn!("gc salt post for {} rejected by the API (400)", salts.match_id);
                return false;
            }
            Ok(r) => last = format!("HTTP {}", r.status()),
            Err(e) => last = e.to_string(),
        }
        if attempt == MAX_POST_ATTEMPTS || halted() {
            break;
        }
        tokio::time::sleep(POST_RETRY_DELAY).await;
    }
    log::warn!("gc salt post for {} failed: {last}", salts.match_id);
    false
}

/// Paces GC requests, stops when told to or when Deadlock starts, and posts what comes back.
struct GcHost<'a, H: Fn() -> bool, D: FnMut()> {
    http: &'a reqwest::Client,
    last_request: &'a mut Option<Instant>,
    halted: H,
    on_delivered: D,
}

impl<H: Fn() -> bool, D: FnMut()> Host for GcHost<'_, H, D> {
    async fn before_request(&mut self) -> bool {
        if let Some(prev) = *self.last_request {
            tokio::time::sleep_until(prev + MIN_REQUEST_INTERVAL).await;
        }
        *self.last_request = Some(Instant::now());
        // Steam routes GC traffic to the game's own pipe while it runs.
        !(self.halted)() && !dp_game::is_running()
    }

    async fn deliver(&mut self, salts: RecoveredSalts) -> bool {
        let ok = post_salts(self.http, salts, &self.halted).await;
        if ok {
            (self.on_delivered)();
        }
        ok
    }

    fn now(&self) -> i64 {
        now_secs()
    }
}

/// Matches deadlock-api is missing salts for, newest first, from the histories of friends who
/// most likely played since the API last saw them. Any failure just yields fewer matches.
async fn friend_matches(
    session: &GcSession,
    state: &mut AccountState,
    ledger_attempts: &mut SaltAttempts,
    cooldowns: &mut FriendCooldowns,
    http: &reqwest::Client,
    host: &mut impl Host,
    processed: &HashSet<u64>,
) -> Vec<u64> {
    let now = now_secs();
    let budget = state.history_budget(now);
    let due: Vec<u32> = session.friends.iter().copied().filter(|&id| cooldowns.is_due(id, now)).collect();
    if budget == 0 || due.is_empty() {
        return Vec::new();
    }
    let (candidates, personas) = futures::join!(api::active_friends(http, &due), session.request_personas(&due));
    let candidates = match candidates {
        Ok(c) => c,
        Err(e) => {
            log::warn!("gc: friend lookup failed: {e}");
            return Vec::new();
        }
    };
    let picks = friends::pick(now, &candidates, &personas, budget);
    log::debug!(
        "gc: {} friend(s), {} recently active, {} likely with new matches",
        session.friends.len(),
        candidates.len(),
        picks.len()
    );
    if picks.is_empty() {
        return Vec::new();
    }

    let found = history_loop(session, host, picks, state, cooldowns).await;
    let mut ids = fresh_newest_first(found, processed, usize::MAX);
    if ids.is_empty() {
        return ids;
    }
    match api::known_match_ids(http, &ids).await {
        Ok(known) => {
            ids.retain(|id| !known.contains(id));
            ledger_attempts.forget(&known);
        }
        Err(e) => log::warn!("gc: could not check which friend matches are known: {e}"),
    }
    log::debug!("gc: found {} new friend match(es)", ids.len());
    ids
}

/// Whether a pass goes on to the next account.
#[derive(Debug, PartialEq, Eq)]
enum Flow {
    Next,
    /// The user's own Steam client needs the game.
    Stop,
}

async fn run_account(
    ctx: &AuthContext,
    ledger: &mut Ledger,
    to_fetch: &api::ToFetch,
    http: &reqwest::Client,
    host: &mut impl Host,
    processed: &mut HashSet<u64>,
) -> Result<Flow, AppError> {
    let now = now_secs();
    let Ledger { accounts, attempts, cooldowns } = ledger;
    let state = accounts.entry(ctx.steam_id64.to_string()).or_default();
    if state.backed_off(now) {
        log::debug!("gc: account {} is backed off, skipping", ctx.account_id());
        return Ok(Flow::Next);
    }
    if state.quota.remaining(now) == 0 {
        log::debug!("gc: account {} has used its 24h quota", ctx.account_id());
        return Ok(Flow::Next);
    }

    // A failed to-fetch read only empties that phase; friends' matches can still be fetched.
    let (to_fetch, to_fetch_error) = match to_fetch.list(http).await {
        Ok(ids) => (ids, None),
        Err(e) => {
            log::warn!("gc: could not read the to-fetch list: {e}");
            (Vec::new(), Some(e))
        }
    };
    if to_fetch.iter().all(|id| processed.contains(id)) && state.history_budget(now) == 0 {
        log::debug!("gc: nothing to fetch for account {}", ctx.account_id());
        return to_fetch_error.map_or(Ok(Flow::Next), Err);
    }

    // A failed handshake repeats identically on every pass, for example when the account does
    // not own the game, so the account is left alone for a day.
    let session = match GcSession::connect(ctx).await {
        Ok(s) => {
            state.backoff_until = None;
            s
        }
        Err(SteamGcError::Yielded) => {
            state.yield_to_user(now);
            return Ok(Flow::Stop);
        }
        Err(e) => {
            log::warn!("gc: account {} cannot reach the GC: {e}", ctx.account_id());
            state.backoff_until = Some(now + GC_BACKOFF_SECS);
            return Ok(Flow::Next);
        }
    };

    let (outcome, yielded) = with_release(session, async |session| {
        let mut ids = friend_matches(session, state, attempts, cooldowns, http, host, processed).await;
        ids.extend(fresh_newest_first(to_fetch, processed, usize::MAX));
        let outcome = fetch_loop(session, host, ids, state, processed, attempts).await;
        (outcome, session.yielded())
    })
    .await;
    if yielded {
        state.yield_to_user(now_secs());
        return Ok(Flow::Stop);
    }
    if outcome.rate_limited {
        log::warn!("gc: account {} was rate-limited by Steam", ctx.account_id());
    }
    log::debug!("gc: account {} delivered {} match(es)", ctx.account_id(), outcome.delivered);
    to_fetch_error.map_or(Ok(Flow::Next), Err)
}

/// Runs `account` for each context until one says stop, then hands back the to-fetch list's
/// claim, whatever the accounts returned.
async fn each_account<C>(
    contexts: &[C],
    to_fetch: &api::ToFetch,
    http: &reqwest::Client,
    mut account: impl AsyncFnMut(&C) -> Flow,
) {
    for ctx in contexts {
        if account(ctx).await == Flow::Stop {
            break;
        }
    }
    to_fetch.release(http).await;
}

async fn pass(stop: &AtomicBool, shared: &Shared, app: &AppHandle, http: &reqwest::Client) {
    if dp_game::is_running() {
        log::debug!("gc: Deadlock is running, skipping this pass");
        return;
    }
    let halted = || stop.load(Ordering::Relaxed) || shared.recovering.load(Ordering::Acquire) > 0;
    if halted() {
        return;
    }
    let Ok(_gc) = shared.gc_lock.try_lock() else {
        log::debug!("gc: match recovery is running, skipping this pass");
        return;
    };
    let contexts = match steam_accounts() {
        Ok(c) => c,
        Err(e) => {
            log::debug!("gc: no usable Steam session, skipping this pass: {e}");
            shared.remember_accounts(&[]);
            let mut st = shared.status.lock_or_recover();
            st.accounts = 0;
            st.last_error = Some(e);
            return;
        }
    };
    log::debug!("gc: {} Steam account(s) available", contexts.len());
    shared.remember_accounts(&contexts);
    shared.status.lock_or_recover().accounts = u32::try_from(contexts.len()).unwrap_or(u32::MAX);

    let mut ledger = Ledger::load(app);
    let mut processed = HashSet::new();
    let mut last_request = None;
    each_account(&contexts, &shared.to_fetch, http, async |ctx| {
        if halted() || dp_game::is_running() {
            return Flow::Stop;
        }
        let mut host = GcHost {
            http,
            last_request: &mut last_request,
            halted,
            on_delivered: || shared.status.lock_or_recover().delivered += 1,
        };
        let flow = match run_account(ctx, &mut ledger, &shared.to_fetch, http, &mut host, &mut processed).await {
            Ok(flow) => {
                shared.status.lock_or_recover().last_error = None;
                flow
            }
            Err(e) => {
                log::warn!("gc: account {} pass failed: {e}", ctx.account_id());
                shared.status.lock_or_recover().last_error = Some(e);
                Flow::Next
            }
        };
        ledger.save(app);
        flow
    })
    .await;
}

/// Runs GC work on the app's shared runtime. The HTTP client pools connections as tasks on the
/// runtime that opened them, so a runtime of its own that idles between passes would strand
/// those connections and hang the next request that picks one up.
fn block_on<F: std::future::Future>(fut: F) -> F::Output {
    tauri::async_runtime::block_on(fut)
}

fn run(stop: &StopSignal, shared: &Shared, app: &AppHandle, http: &reqwest::Client) {
    while !stop.is_stopped() {
        block_on(pass(stop.flag(), shared, app, http));
        if stop.wait(PASS_INTERVAL) {
            break;
        }
    }
}

pub mod commands {
    use tauri::{AppHandle, State};

    use super::{api, coverage, DetailCoverage, GcService, GcStatus};
    use crate::features::error::AppError;
    use crate::http::Http;

    #[tauri::command]
    pub fn set_gc_recovery_enabled(enabled: bool, app: AppHandle, gc: State<'_, GcService>, http: State<'_, Http>) {
        gc.set_enabled(enabled, app, http.0.clone());
    }

    #[tauri::command]
    pub fn gc_status(gc: State<'_, GcService>) -> GcStatus {
        gc.status()
    }

    #[tauri::command]
    pub async fn match_detail_coverage(match_ids: Vec<u64>, http: State<'_, Http>) -> Result<DetailCoverage, AppError> {
        let http = http.0.clone();
        let (known, replays) =
            futures::join!(api::known_match_ids(&http, &match_ids), api::replay_match_ids(&http, &match_ids));
        Ok(coverage(&match_ids, &known?, replays?))
    }

    #[tauri::command]
    pub fn recover_matches(
        match_ids: Vec<u64>,
        with_history: bool,
        app: AppHandle,
        gc: State<'_, GcService>,
    ) -> Result<(), AppError> {
        gc.recover_matches(&app, &match_ids, with_history)
    }

    #[tauri::command]
    pub fn pause_match_recovery(app: AppHandle, gc: State<'_, GcService>) {
        gc.pause_recovery(&app);
    }

    #[tauri::command]
    pub fn resume_match_recovery(app: AppHandle, gc: State<'_, GcService>) {
        gc.resume_recovery(&app);
    }

    #[tauri::command]
    pub fn cancel_match_recovery(app: AppHandle, gc: State<'_, GcService>) {
        gc.cancel_recovery(&app);
    }
}

/// The `ids` the API has details for, in order, and the ones it has a replay for.
fn coverage(ids: &[u64], known: &HashSet<u64>, with_replay: Vec<u64>) -> DetailCoverage {
    DetailCoverage { with_details: ids.iter().copied().filter(|id| known.contains(id)).collect(), with_replay }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc;

    /// An HTTP server that keeps every connection open, so the client pools it.
    fn keep_alive_server() -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/", listener.local_addr().unwrap());
        std::thread::spawn(move || {
            for mut conn in listener.incoming().flatten() {
                std::thread::spawn(move || {
                    let mut buf = [0u8; 4096];
                    while matches!(conn.read(&mut buf), Ok(n) if n > 0) {
                        let _ = conn.write_all(
                            b"HTTP/1.1 200 OK
Content-Length: 2

[]",
                        );
                    }
                });
            }
        });
        url
    }

    #[test]
    fn a_request_works_after_another_worker_used_the_client_and_went_idle() {
        let url = keep_alive_server();
        let http = reqwest::Client::new();
        let (done_tx, done_rx) = mpsc::channel();
        let (exit_tx, exit_rx) = mpsc::channel::<()>();
        let first = {
            let (http, url) = (http.clone(), url.clone());
            std::thread::spawn(move || {
                block_on(async { http.get(&url).send().await.unwrap().bytes().await.unwrap() });
                done_tx.send(()).unwrap();
                // Idle like a worker waiting for its next pass.
                let _ = exit_rx.recv();
            })
        };
        done_rx.recv().unwrap();
        let second = std::thread::spawn(move || {
            block_on(async { tokio::time::timeout(Duration::from_secs(5), http.get(&url).send()).await })
        });
        let result = second.join().unwrap();
        exit_tx.send(()).unwrap();
        first.join().unwrap();
        assert!(matches!(result, Ok(Ok(ref r)) if r.status().is_success()), "request hung: {result:?}");
    }

    #[test]
    fn a_pass_releases_the_claim_once_after_its_accounts_even_a_failed_one() {
        use fake_api::{FakeApi, Reply};
        let api = FakeApi::serve(vec![
            Reply::json("[1]").set_cookie("to_fetch_claim=a; Max-Age=900"),
            Reply::status("500 Internal Server Error"),
            Reply::status("204 No Content"),
        ]);
        let to_fetch = api::ToFetch::at(&api.url);
        let http = reqwest::Client::new();
        block_on(each_account(&[(), ()], &to_fetch, &http, async |_| {
            let _ = to_fetch.list(&http).await;
            Flow::Next
        }));
        let routes: Vec<_> = api.requests().into_iter().map(|r| (r.route, r.cookie)).collect();
        assert_eq!(
            routes,
            vec![
                ("GET /matches/to-fetch".into(), None),
                ("GET /matches/to-fetch".into(), Some("to_fetch_claim=a".into())),
                ("POST /matches/to-fetch/release".into(), Some("to_fetch_claim=a".into())),
            ]
        );
    }

    #[test]
    fn a_stopped_pass_still_releases_the_claim() {
        use fake_api::{FakeApi, Reply};
        let api = FakeApi::serve(vec![
            Reply::json("[1]").set_cookie("to_fetch_claim=a; Max-Age=900"),
            Reply::status("204 No Content"),
        ]);
        let to_fetch = api::ToFetch::at(&api.url);
        let http = reqwest::Client::new();
        block_on(each_account(&[(), ()], &to_fetch, &http, async |_| {
            let _ = to_fetch.list(&http).await;
            Flow::Stop
        }));
        let routes: Vec<_> = api.requests().into_iter().map(|r| r.route).collect();
        assert_eq!(routes, vec!["GET /matches/to-fetch", "POST /matches/to-fetch/release"]);
    }

    #[test]
    fn recovered_salts_are_tagged_with_the_account() {
        let s = to_ingest_salts(RecoveredSalts {
            match_id: 5,
            cluster_id: Some(404),
            metadata_salt: Some(1),
            replay_salt: None,
            account_id: 7,
        });
        assert_eq!(s.username, Some(7));
        assert_eq!((s.match_id, s.cluster_id, s.metadata_salt, s.replay_salt), (5, Some(404), Some(1), None));
        assert_eq!(serde_json::to_value(s).unwrap()["username"], "deadlockplus:7");
    }

    mod recovery {
        use std::collections::VecDeque;
        use std::sync::atomic::AtomicI64;

        use dp_gc::pass::{Release, SaltFetcher};
        use dp_gc::quota::{FETCH_QUOTA_LIMIT, FETCH_QUOTA_WINDOW_SECS};

        use super::super::own::{
            AccountProgress, History, LastRun, OwnRecoveryOutcome, RecoveryWait, RunEnv, SavedRun,
        };
        use super::super::*;

        const T0: i64 = 1_000_000;
        const ACCOUNT: u32 = 7;
        const OTHER: u32 = 9;

        type Work = Box<dyn FnOnce() + Send>;

        /// Runs spawned work only when the test asks, and moves the clock instead of sleeping.
        #[derive(Default)]
        struct FakeDriver {
            game: AtomicBool,
            game_opens_on_drive: AtomicBool,
            clock: AtomicI64,
            quota: Mutex<SaltQuota>,
            saved: Mutex<Vec<u32>>,
            drives: AtomicUsize,
            delivered: Mutex<Vec<u64>>,
            sleeps: Mutex<Vec<i64>>,
            spawned: Mutex<VecDeque<Work>>,
        }

        struct NoStore;

        impl RunStore for NoStore {
            fn save_run(&mut self, _: &SavedRun) {}
            fn save_last_run(&mut self, _: LastRun) {}
        }

        impl Driver for FakeDriver {
            type Store<'a> = NoStore;

            fn store(&self) -> NoStore {
                NoStore
            }

            fn saved_accounts(&self) -> Vec<(u32, SaltQuota)> {
                let quota = self.quota.lock_or_recover().clone();
                let saved = self.saved.lock_or_recover();
                saved.iter().map(|&id| (id, if id == ACCOUNT { quota.clone() } else { SaltQuota::default() })).collect()
            }

            fn game_running(&self) -> bool {
                self.game.load(Ordering::SeqCst)
            }

            fn now(&self) -> i64 {
                self.clock.load(Ordering::SeqCst)
            }

            fn drive(&self, run: &Run, _: &StopSignal) -> RunEnd {
                self.drives.fetch_add(1, Ordering::SeqCst);
                if self.game_opens_on_drive.swap(false, Ordering::SeqCst) {
                    self.game.store(true, Ordering::SeqCst);
                }
                block_on(own::drive(run, &mut TestEnv { fake: self }))
            }

            fn sleep_until(&self, until: i64, _: &StopSignal) -> bool {
                self.sleeps.lock_or_recover().push(until);
                self.clock.store(until, Ordering::SeqCst);
                false
            }

            fn spawn(&self, _: &str, work: Work) {
                self.spawned.lock_or_recover().push_back(work);
            }
        }

        impl FakeDriver {
            fn drives(&self) -> usize {
                self.drives.load(Ordering::SeqCst)
            }

            fn delivered(&self) -> Vec<u64> {
                self.delivered.lock_or_recover().clone()
            }
        }

        struct TestEnv<'a> {
            fake: &'a FakeDriver,
        }

        struct TestSession(u32);

        impl SaltFetcher for TestSession {
            async fn fetch_match_salts(&self, match_id: u64) -> Result<RecoveredSalts, SteamGcError> {
                Ok(RecoveredSalts {
                    match_id,
                    cluster_id: Some(1),
                    metadata_salt: Some(2),
                    replay_salt: None,
                    account_id: self.0,
                })
            }
        }

        impl Release for TestSession {
            async fn release(&self) {}
        }

        impl Host for TestEnv<'_> {
            async fn before_request(&mut self) -> bool {
                !self.fake.game_running()
            }

            async fn deliver(&mut self, salts: RecoveredSalts) -> bool {
                self.fake.delivered.lock_or_recover().push(salts.match_id);
                true
            }

            fn now(&self) -> i64 {
                self.fake.now()
            }
        }

        impl RunStore for TestEnv<'_> {
            fn save_run(&mut self, _: &SavedRun) {}
            fn save_last_run(&mut self, _: LastRun) {}
        }

        impl RunEnv for TestEnv<'_> {
            type Session = TestSession;

            fn game_running(&self) -> bool {
                self.fake.game_running()
            }

            fn accounts(&mut self) -> Result<Vec<u32>, AppError> {
                Ok(vec![ACCOUNT])
            }

            async fn connect(&mut self, account_id: u32) -> Result<TestSession, SteamGcError> {
                Ok(TestSession(account_id))
            }

            async fn history(&mut self, _: &TestSession, _: u32) -> Result<History, SteamGcError> {
                Ok(History::default())
            }

            fn quota(&self, _: u32) -> SaltQuota {
                self.fake.quota.lock_or_recover().clone()
            }

            fn save_quota(&mut self, _: u32, quota: &SaltQuota) {
                *self.fake.quota.lock_or_recover() = quota.clone();
            }

            fn attempts(&self) -> SaltAttempts {
                SaltAttempts::default()
            }

            fn save_attempts(&mut self, _: &SaltAttempts) {}

            fn report(&mut self, _: OwnRecovery) {}
        }

        fn recovery() -> Arc<Recovery<FakeDriver>> {
            let driver = FakeDriver::default();
            driver.clock.store(T0, Ordering::SeqCst);
            Recovery::new(Run::default(), driver)
        }

        fn settle(r: &Recovery<FakeDriver>) {
            loop {
                let work = r.driver.spawned.lock_or_recover().pop_front();
                match work {
                    Some(work) => work(),
                    None => return,
                }
            }
        }

        fn spend_the_daily_limit(r: &Recovery<FakeDriver>) {
            *r.driver.quota.lock_or_recover() = SaltQuota::from_hits(vec![T0; FETCH_QUOTA_LIMIT]);
        }

        /// A run started with Deadlock closed that finds it open when the drive begins.
        fn waiting_for_the_game(r: &Arc<Recovery<FakeDriver>>) {
            r.driver.game_opens_on_drive.store(true, Ordering::SeqCst);
            r.start(&[1, 2], false).unwrap();
            settle(r);
            assert_eq!(r.status().unwrap().waiting, Some(RecoveryWait::GameOpen));
        }

        #[test]
        fn deadlock_closing_continues_a_waiting_run() {
            let r = recovery();
            waiting_for_the_game(&r);
            r.driver.game.store(false, Ordering::SeqCst);
            r.on_game_probe(Some(true), false);
            settle(&r);
            assert_eq!(r.driver.drives(), 2);
            assert_eq!(r.driver.delivered(), [1, 2]);
        }

        #[test]
        fn only_deadlock_closing_continues_a_run() {
            let r = recovery();
            waiting_for_the_game(&r);
            r.driver.game.store(false, Ordering::SeqCst);
            r.on_game_probe(None, false);
            r.on_game_probe(Some(false), true);
            settle(&r);
            assert_eq!(r.driver.drives(), 1);
        }

        #[test]
        fn a_paused_run_never_continues_when_deadlock_closes() {
            let r = recovery();
            waiting_for_the_game(&r);
            r.pause();
            r.driver.game.store(false, Ordering::SeqCst);
            r.on_game_probe(Some(true), false);
            r.continue_run();
            settle(&r);
            assert_eq!(r.driver.drives(), 1);
            assert!(r.driver.delivered().is_empty());
            assert!(r.status().unwrap().paused);
        }

        #[test]
        fn the_run_continues_when_the_daily_limit_reopens() {
            let r = recovery();
            spend_the_daily_limit(&r);
            r.start(&[1, 2], false).unwrap();
            settle(&r);
            let until = T0 + FETCH_QUOTA_WINDOW_SECS;
            assert_eq!(*r.driver.sleeps.lock_or_recover(), [until]);
            assert_eq!(r.driver.drives(), 2);
            assert_eq!(r.driver.delivered(), [1, 2]);
            assert_eq!(r.status().unwrap().outcome, Some(OwnRecoveryOutcome::Done));
        }

        #[test]
        fn a_paused_run_never_continues_when_the_daily_limit_reopens() {
            let r = recovery();
            spend_the_daily_limit(&r);
            r.start(&[1, 2], false).unwrap();
            let drive = r.driver.spawned.lock_or_recover().pop_front().unwrap();
            drive();
            r.pause();
            settle(&r);
            assert_eq!(r.driver.drives(), 1);
            assert!(r.driver.delivered().is_empty());
        }

        #[test]
        fn starting_while_deadlock_runs_and_no_run_is_going_is_refused() {
            let r = recovery();
            r.driver.game.store(true, Ordering::SeqCst);
            let err = r.start(&[1], false).unwrap_err();
            assert_eq!(err.code(), "gc.game_running");
            settle(&r);
            assert_eq!(r.driver.drives(), 0);
            assert!(r.status().is_none());
        }

        #[test]
        fn starting_while_deadlock_runs_adds_to_a_waiting_run() {
            let r = recovery();
            waiting_for_the_game(&r);
            r.start(&[3], false).unwrap();
            settle(&r);
            r.driver.game.store(false, Ordering::SeqCst);
            r.on_game_probe(Some(true), false);
            settle(&r);
            assert_eq!(r.driver.delivered(), [3, 1, 2]);
        }

        /// Pressing Recover is consent for that run (the background toggle has no say).
        #[test]
        fn a_run_starts_and_drives_without_the_background_worker() {
            let r = recovery();
            r.start(&[4, 5], false).unwrap();
            settle(&r);
            assert_eq!(r.driver.delivered(), [4, 5]);
        }

        #[test]
        fn a_waiting_run_reads_as_running() {
            let r = recovery();
            assert!(r.status().is_none());
            waiting_for_the_game(&r);
            assert!(r.status().unwrap().running);
        }

        #[test]
        fn an_idle_status_lists_every_saved_account_with_its_daily_use() {
            let r = recovery();
            *r.driver.saved.lock_or_recover() = vec![OTHER, ACCOUNT];
            *r.driver.quota.lock_or_recover() = SaltQuota::from_hits(vec![T0 - 60; 7]);
            let s = r.status().expect("saved accounts show with no run");
            assert!(!s.running && !s.paused);
            assert_eq!((s.waiting, s.outcome, s.total), (None, None, 0));
            assert_eq!(
                s.accounts,
                [
                    AccountProgress { account_id: ACCOUNT, delivered: 0, used_today: 7, rate_limited: false },
                    AccountProgress { account_id: OTHER, delivered: 0, used_today: 0, rate_limited: false },
                ]
            );
        }

        #[test]
        fn after_a_run_the_daily_use_follows_the_ledger_and_keeps_the_runs_deliveries() {
            let r = recovery();
            *r.driver.saved.lock_or_recover() = vec![ACCOUNT, OTHER];
            r.start(&[1, 2], false).unwrap();
            settle(&r);
            *r.driver.quota.lock_or_recover() = SaltQuota::from_hits(vec![T0; 5]);
            let s = r.status().unwrap();
            assert_eq!(s.outcome, Some(OwnRecoveryOutcome::Done));
            assert_eq!(
                s.accounts,
                [
                    AccountProgress { account_id: ACCOUNT, delivered: 2, used_today: 5, rate_limited: false },
                    AccountProgress { account_id: OTHER, delivered: 0, used_today: 0, rate_limited: false },
                ]
            );
        }

        #[test]
        fn an_account_no_longer_saved_drops_out() {
            let r = recovery();
            *r.driver.saved.lock_or_recover() = vec![ACCOUNT];
            r.start(&[1], false).unwrap();
            settle(&r);
            *r.driver.saved.lock_or_recover() = vec![OTHER];
            let ids: Vec<u32> = r.status().unwrap().accounts.iter().map(|a| a.account_id).collect();
            assert_eq!(ids, [OTHER]);
        }

        #[test]
        fn coverage_keeps_the_asked_order() {
            let got = coverage(&[3, 1, 2], &HashSet::from([2, 3]), vec![2]);
            assert_eq!(got, DetailCoverage { with_details: vec![3, 2], with_replay: vec![2] });
        }
    }
}
