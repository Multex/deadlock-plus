mod api;
mod error;
#[cfg(test)]
mod fake_api;
mod own;

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
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
use dp_ingest::salts::Salts;
use dp_kv::KvStore;
use dp_sync::LockExt;

use super::stop::StopSignal;
use super::toggle::{toggle, Toggle};
use crate::features::error::AppError;
use error::GcError;
pub use own::OwnRecovery;

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
}

/// State the background worker and an own-history run share.
#[derive(Default)]
struct Shared {
    status: Mutex<GcStatus>,
    /// Held by whoever is talking to the GC, so a background pass and an own-history run never
    /// sign in to the same account at once.
    gc_lock: tokio::sync::Mutex<()>,
    /// Set while an own-history run waits for or holds `gc_lock`. A background pass stops at its
    /// next request.
    own_active: AtomicBool,
    to_fetch: api::ToFetch,
}

#[derive(Default)]
pub struct GcService {
    stop: Mutex<Option<Arc<StopSignal>>>,
    own_stop: Mutex<Option<Arc<StopSignal>>>,
    shared: Arc<Shared>,
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
                self.cancel_own_recovery();
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

    /// Starts recovering salts for every match in each account's own history. Keeps a run that is
    /// already going.
    pub fn recover_own_matches(&self, app: AppHandle, http: reqwest::Client) -> Result<(), AppError> {
        if self.stop.lock_or_recover().is_none() {
            return Err(GcError::Disabled.into());
        }
        if dp_game::is_running() {
            return Err(GcError::GameRunning.into());
        }
        let mut slot = self.own_stop.lock_or_recover();
        if self.shared.status.lock_or_recover().own_recovery.as_ref().is_some_and(|r| r.running) {
            return Ok(());
        }
        let stop = Arc::new(StopSignal::default());
        *slot = Some(stop.clone());
        let shared = self.shared.clone();
        shared.own_active.store(true, Ordering::Release);
        shared.status.lock_or_recover().own_recovery = Some(OwnRecovery { running: true, ..Default::default() });
        std::thread::Builder::new()
            .name("gc-own-matches".into())
            .spawn(move || own::run(&stop, &shared, &app, &http))
            .expect("spawn thread");
        Ok(())
    }

    pub fn cancel_own_recovery(&self) {
        if let Some(stop) = self.own_stop.lock_or_recover().take() {
            stop.stop();
        }
    }

    pub fn status(&self) -> GcStatus {
        self.shared.status.lock_or_recover().clone()
    }

    pub fn stop(&self) {
        if let Some(stop) = self.stop.lock_or_recover().take() {
            stop.stop();
        }
        self.cancel_own_recovery();
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
    let halted = || stop.load(Ordering::Relaxed) || shared.own_active.load(Ordering::Acquire);
    if halted() {
        return;
    }
    let Ok(_gc) = shared.gc_lock.try_lock() else {
        log::debug!("gc: own match history recovery is running, skipping this pass");
        return;
    };
    let contexts = match steam_accounts() {
        Ok(c) => c,
        Err(e) => {
            log::debug!("gc: no usable Steam session, skipping this pass: {e}");
            let mut st = shared.status.lock_or_recover();
            st.accounts = 0;
            st.last_error = Some(e);
            return;
        }
    };
    log::debug!("gc: {} Steam account(s) available", contexts.len());
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

    use super::{GcService, GcStatus};
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
    pub fn recover_own_matches(
        app: AppHandle,
        gc: State<'_, GcService>,
        http: State<'_, Http>,
    ) -> Result<(), AppError> {
        gc.recover_own_matches(app, http.0.clone())
    }

    #[tauri::command]
    pub fn cancel_own_match_recovery(gc: State<'_, GcService>) {
        gc.cancel_own_recovery();
    }
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
        assert_eq!(serde_json::to_value(s).unwrap()["username"], "ingest-tool:7");
    }
}
