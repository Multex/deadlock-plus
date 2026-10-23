use std::collections::HashSet;
use std::future::Future;
use std::sync::Mutex;
use std::time::Duration;

use reqwest::header::{HeaderMap, COOKIE, RETRY_AFTER, SET_COOKIE};
use reqwest::StatusCode;
use serde::de::DeserializeOwned;
use serde::Deserialize;

use dp_gc::friends::{ActiveFriend, HistoryRow};

use dp_sync::LockExt;

use crate::features::error::AppError;
use crate::http::retry::{rate_limit_quota, Backoff, Reply};

const API: &str = "https://api.deadlock-api.com/v1";
const API_ROOT: &str = "https://api.deadlock-api.com";
const REPLAY_CHUNK: usize = 10_000;
const METADATA_CHUNK: usize = 100;
const PLAYERS_CHUNK: usize = 1000;
const CLAIM_COOKIE: &str = "to_fetch_claim";

const WAIT_ATTEMPTS: u32 = 4;
/// deadlock-api's quotas are per minute or shorter, so a longer `Retry-After` is not worth holding a run for.
const WAIT_BACKOFF: Backoff = Backoff {
    base: Duration::from_secs(5),
    max: Duration::from_secs(60),
    max_retry_after: Duration::from_secs(60),
    min_retry_after: Duration::from_secs(1),
};

/// deadlock-api answers 404 for a query that matches nothing, which reads as an empty `T`.
async fn get_json<T: DeserializeOwned + Default>(req: reqwest::RequestBuilder) -> Result<T, AppError> {
    get_json_with(req, Patience::FailFast, tokio::time::sleep).await
}

async fn get_json_with<T, S, F>(mut req: reqwest::RequestBuilder, patience: Patience, sleep: S) -> Result<T, AppError>
where
    T: DeserializeOwned + Default,
    S: Fn(Duration) -> F,
    F: Future<Output = ()>,
{
    let attempts = match patience {
        Patience::FailFast => 1,
        Patience::Wait => WAIT_ATTEMPTS,
    };
    let mut attempt = 0;
    loop {
        let again = req.try_clone();
        let resp = req.timeout(super::HTTP_TIMEOUT).send().await.map_err(AppError::network)?;
        let status = resp.status();
        if status == StatusCode::NOT_FOUND {
            return Ok(T::default());
        }
        let retry_after = resp.headers().get(RETRY_AFTER).and_then(|v| v.to_str().ok()).map(str::to_owned);
        let Reply::Wait(wait) = WAIT_BACKOFF.classify(status.as_u16(), retry_after.as_deref(), attempt) else {
            return resp.error_for_status().map_err(AppError::network)?.json().await.map_err(AppError::network);
        };
        let quota = resp.bytes().await.ok().and_then(|body| rate_limit_quota(&body));
        let quota = quota.map(|q| format!(" ({q} quota)")).unwrap_or_default();
        attempt += 1;
        match again {
            Some(next) if attempt < attempts => {
                log::debug!("gc: deadlock-api answered {status}{quota}, retrying in {wait:?}");
                sleep(wait).await;
                req = next;
            }
            _ => return Err(AppError::network(format!("deadlock-api answered {status}{quota}"))),
        }
    }
}

fn join_ids(ids: &[impl ToString]) -> String {
    ids.iter().map(ToString::to_string).collect::<Vec<_>>().join(",")
}

/// The value of a `to_fetch_claim` `Set-Cookie` header. An empty value is the server clearing it.
fn parse_claim(header: &str) -> Option<&str> {
    let (name, value) = header.split(';').next()?.split_once('=')?;
    let value = value.trim();
    (name.trim() == CLAIM_COOKIE && !value.is_empty()).then_some(value)
}

fn claim_from_headers(headers: &HeaderMap) -> Option<String> {
    headers.get_all(SET_COOKIE).iter().filter_map(|v| v.to_str().ok()).find_map(parse_claim).map(str::to_owned)
}

/// The list of matches deadlock-api still needs salts for, and the claim on them. deadlock-api
/// hides a listed match from other workers for 15 min unless the claim cookie comes back, on the
/// next list or on release.
pub struct ToFetch {
    base: String,
    claim: Mutex<Option<String>>,
}

impl Default for ToFetch {
    fn default() -> Self {
        Self::at(API)
    }
}

impl ToFetch {
    pub(super) fn at(base: &str) -> Self {
        Self { base: base.to_owned(), claim: Mutex::new(None) }
    }

    fn with_claim(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        let held = self.claim.lock_or_recover().clone();
        match held {
            Some(claim) => req.header(COOKIE, format!("{CLAIM_COOKIE}={claim}")),
            None => req,
        }
    }

    /// Sends back the previous list's claim, so the server releases those matches first.
    pub async fn list(&self, http: &reqwest::Client) -> Result<Vec<u64>, AppError> {
        let req = self.with_claim(http.get(format!("{}/matches/to-fetch", self.base)));
        let resp = req.timeout(super::HTTP_TIMEOUT).send().await.map_err(AppError::network)?;
        if resp.status() == StatusCode::NOT_FOUND {
            *self.claim.lock_or_recover() = None;
            return Ok(Vec::new());
        }
        // A failed list keeps the held claim: releasing one the server already dropped is harmless.
        let resp = resp.error_for_status().map_err(AppError::network)?;
        *self.claim.lock_or_recover() = claim_from_headers(resp.headers());
        resp.json().await.map_err(AppError::network)
    }

    /// Hands the last list's matches back to other workers. Best-effort: an unreleased claim
    /// expires on its own.
    pub async fn release(&self, http: &reqwest::Client) {
        let Some(claim) = self.claim.lock_or_recover().take() else { return };
        let req = http
            .post(format!("{}/matches/to-fetch/release", self.base))
            .header(COOKIE, format!("{CLAIM_COOKIE}={claim}"))
            .timeout(super::HTTP_TIMEOUT);
        match req.send().await {
            Ok(r) if r.status().is_success() => log::debug!("gc: released the to-fetch claim"),
            Ok(r) => log::warn!("gc: to-fetch release answered HTTP {}", r.status()),
            Err(e) => log::warn!("gc: to-fetch release failed: {e}"),
        }
    }
}

#[derive(Deserialize)]
struct MatchIdRow {
    match_id: u64,
}

/// How hard a call to deadlock-api tries when it is rate limited or the server is busy.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Patience {
    /// One attempt. For views: they ask again on their own, and waiting would only hold them up.
    FailFast,
    /// Waits out a few 429s or 5xxs. For background work, which nobody waits on.
    Wait,
}

/// The subset of `match_ids` deadlock-api already has metadata, and so salts, for. Fails fast.
pub async fn known_match_ids(http: &reqwest::Client, match_ids: &[u64]) -> Result<HashSet<u64>, AppError> {
    known_match_ids_with(http, match_ids, Patience::FailFast).await
}

pub async fn known_match_ids_with(
    http: &reqwest::Client,
    match_ids: &[u64],
    patience: Patience,
) -> Result<HashSet<u64>, AppError> {
    known_match_ids_at(API, http, match_ids, patience, tokio::time::sleep).await
}

/// `base` includes `/v1`.
async fn known_match_ids_at<S, F>(
    base: &str,
    http: &reqwest::Client,
    match_ids: &[u64],
    patience: Patience,
    sleep: S,
) -> Result<HashSet<u64>, AppError>
where
    S: Fn(Duration) -> F,
    F: Future<Output = ()>,
{
    let mut known = HashSet::new();
    for chunk in match_ids.chunks(METADATA_CHUNK) {
        let req = http.get(format!("{base}/matches/metadata")).query(&[
            ("match_ids", join_ids(chunk)),
            ("include_info", "true".into()),
            ("limit", METADATA_CHUNK.to_string()),
        ]);
        let rows: Vec<MatchIdRow> = get_json_with(req, patience, &sleep).await?;
        known.extend(rows.into_iter().map(|r| r.match_id));
    }
    Ok(known)
}

/// The subset of `match_ids` deadlock-api serves a replay (`demo_url`) for.
pub async fn replay_match_ids(http: &reqwest::Client, match_ids: &[u64]) -> Result<Vec<u64>, AppError> {
    replay_match_ids_at(API_ROOT, http, match_ids).await
}

#[derive(Deserialize)]
struct GraphqlReply {
    data: Option<MatchSalts>,
    #[serde(default)]
    errors: Vec<GraphqlError>,
}

#[derive(Deserialize)]
struct MatchSalts {
    match_salts: Vec<SaltRow>,
}

#[derive(Deserialize)]
struct SaltRow {
    match_id: u64,
    demo_url: Option<String>,
}

#[derive(Deserialize)]
struct GraphqlError {
    message: String,
}

/// `base` is the host root, without `/v1`.
async fn replay_match_ids_at(base: &str, http: &reqwest::Client, match_ids: &[u64]) -> Result<Vec<u64>, AppError> {
    let mut replays = Vec::new();
    for chunk in match_ids.chunks(REPLAY_CHUNK) {
        let query =
            format!("{{ match_salts(where: {{match_id: {{in: [{}]}}}}) {{ match_id demo_url }} }}", join_ids(chunk));
        let req = http.post(format!("{base}/v1/graphql")).json(&serde_json::json!({ "query": query }));
        let resp = req.timeout(super::HTTP_TIMEOUT).send().await.map_err(AppError::network)?;
        let reply: GraphqlReply =
            resp.error_for_status().map_err(AppError::network)?.json().await.map_err(AppError::network)?;
        if let Some(e) = reply.errors.first() {
            return Err(AppError::network(&e.message));
        }
        let rows = reply.data.ok_or_else(|| AppError::network("graphql reply has no data"))?.match_salts;
        replays.extend(
            rows.into_iter().filter(|r| r.demo_url.as_deref().is_some_and(|u| !u.is_empty())).map(|r| r.match_id),
        );
    }
    Ok(replays)
}

#[derive(Deserialize)]
struct SteamProfileRow {
    account_id: u32,
    #[serde(default)]
    matches_played_last_30d: Option<u64>,
}

fn recent_player_ids(rows: Vec<SteamProfileRow>) -> impl Iterator<Item = u32> {
    rows.into_iter().filter(|r| r.matches_played_last_30d.is_some_and(|n| n > 0)).map(|r| r.account_id)
}

/// Of `account_ids`, the ones deadlock-api has seen play in the last 30 days.
async fn recent_players(http: &reqwest::Client, account_ids: &[u32]) -> Result<Vec<u32>, AppError> {
    let mut players = Vec::new();
    for chunk in account_ids.chunks(PLAYERS_CHUNK) {
        let req = http.get(format!("{API}/players/steam")).query(&[("account_ids", join_ids(chunk))]);
        // Only the background friend pass asks, and a failure here drops the whole pass.
        players.extend(recent_player_ids(get_json_with(req, Patience::Wait, tokio::time::sleep).await?));
    }
    Ok(players)
}

/// Of `friends`, the ones deadlock-api knows play Deadlock, with their stored history. A friend
/// whose stored history cannot be read or is empty is left out.
pub async fn active_friends(http: &reqwest::Client, friends: &[u32]) -> Result<Vec<ActiveFriend>, AppError> {
    let mut active = Vec::new();
    for account_id in recent_players(http, friends).await? {
        let req = http.get(format!("{API}/players/{account_id}/match-history"));
        match get_json::<Vec<HistoryRow>>(req).await {
            Ok(rows) => active.extend(ActiveFriend::from_history(account_id, &rows)),
            Err(e) => log::debug!("gc: stored history for friend {account_id}: {e}"),
        }
    }
    Ok(active)
}

#[cfg(test)]
mod tests {
    use super::super::block_on;
    use super::super::fake_api::{FakeApi, Reply, Request};
    use super::*;

    const CLAIM: &str = "to_fetch_claim=0b6f9c1e-2d4a; Path=/v1/matches/to-fetch; Max-Age=900; HttpOnly; Secure";

    fn get(cookie: Option<&str>) -> Request {
        Request { route: "GET /matches/to-fetch".into(), cookie: cookie.map(Into::into), body: String::new() }
    }

    fn release(cookie: &str) -> Request {
        Request { route: "POST /matches/to-fetch/release".into(), cookie: Some(cookie.into()), body: String::new() }
    }

    #[test]
    fn the_claim_is_the_value_of_a_full_set_cookie_header() {
        assert_eq!(parse_claim(CLAIM), Some("0b6f9c1e-2d4a"));
        assert_eq!(parse_claim("to_fetch_claim=abc"), Some("abc"));
    }

    #[test]
    fn an_empty_or_other_cookie_is_no_claim() {
        assert_eq!(parse_claim("to_fetch_claim=; Max-Age=0"), None);
        assert_eq!(parse_claim("to_fetch_claim_old=abc"), None);
        assert_eq!(parse_claim("session=abc; Path=/"), None);
        assert_eq!(parse_claim("garbage"), None);
    }

    #[test]
    fn the_held_claim_goes_back_on_the_next_list() {
        let api = FakeApi::serve(vec![Reply::json("[1,2]").set_cookie(CLAIM), Reply::json("[3]")]);
        let to_fetch = ToFetch::at(&api.url);
        let http = reqwest::Client::new();
        block_on(async {
            assert_eq!(to_fetch.list(&http).await.unwrap(), vec![1, 2]);
            assert_eq!(to_fetch.list(&http).await.unwrap(), vec![3]);
        });
        assert_eq!(api.requests(), vec![get(None), get(Some("to_fetch_claim=0b6f9c1e-2d4a"))]);
    }

    #[test]
    fn release_hands_the_claim_back_once() {
        let api = FakeApi::serve(vec![Reply::json("[1]").set_cookie(CLAIM), Reply::status("204 No Content")]);
        let to_fetch = ToFetch::at(&api.url);
        let http = reqwest::Client::new();
        block_on(async {
            to_fetch.list(&http).await.unwrap();
            to_fetch.release(&http).await;
            to_fetch.release(&http).await;
        });
        assert_eq!(api.requests(), vec![get(None), release("to_fetch_claim=0b6f9c1e-2d4a")]);
    }

    #[test]
    fn an_empty_cookie_drops_the_claim() {
        let api = FakeApi::serve(vec![
            Reply::json("[1]").set_cookie(CLAIM),
            Reply::json("[]").set_cookie("to_fetch_claim=; Max-Age=0"),
            Reply::json("[]"),
        ]);
        let to_fetch = ToFetch::at(&api.url);
        let http = reqwest::Client::new();
        block_on(async {
            to_fetch.list(&http).await.unwrap();
            to_fetch.list(&http).await.unwrap();
            to_fetch.list(&http).await.unwrap();
            to_fetch.release(&http).await;
        });
        assert_eq!(api.requests(), vec![get(None), get(Some("to_fetch_claim=0b6f9c1e-2d4a")), get(None)]);
    }

    #[test]
    fn a_404_drops_the_claim() {
        let api = FakeApi::serve(vec![Reply::json("[1]").set_cookie(CLAIM), Reply::status("404 Not Found")]);
        let to_fetch = ToFetch::at(&api.url);
        let http = reqwest::Client::new();
        block_on(async {
            to_fetch.list(&http).await.unwrap();
            assert_eq!(to_fetch.list(&http).await.unwrap(), Vec::<u64>::new());
            to_fetch.release(&http).await;
        });
        assert_eq!(api.requests(), vec![get(None), get(Some("to_fetch_claim=0b6f9c1e-2d4a"))]);
    }

    #[test]
    fn a_failed_list_keeps_the_claim_for_release() {
        let api = FakeApi::serve(vec![
            Reply::json("[1]").set_cookie(CLAIM),
            Reply::status("500 Internal Server Error"),
            Reply::status("204 No Content"),
        ]);
        let to_fetch = ToFetch::at(&api.url);
        let http = reqwest::Client::new();
        block_on(async {
            to_fetch.list(&http).await.unwrap();
            assert!(to_fetch.list(&http).await.is_err());
            to_fetch.release(&http).await;
        });
        let claim = "to_fetch_claim=0b6f9c1e-2d4a";
        assert_eq!(api.requests(), vec![get(None), get(Some(claim)), release(claim)]);
    }

    fn ask(api: &FakeApi, ids: &[u64]) -> Result<Vec<u64>, AppError> {
        block_on(replay_match_ids_at(&api.url, &reqwest::Client::new(), ids))
    }

    #[test]
    fn replay_ids_are_sent_as_a_match_salts_query() {
        let api = FakeApi::serve(vec![Reply::json(r#"{"data":{"match_salts":[]}}"#)]);
        ask(&api, &[7, 8]).unwrap();
        let requests = api.requests();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].route, "POST /v1/graphql");
        let body: serde_json::Value = serde_json::from_str(&requests[0].body).unwrap();
        assert_eq!(body["query"], "{ match_salts(where: {match_id: {in: [7,8]}}) { match_id demo_url } }");
    }

    #[test]
    fn only_matches_with_a_demo_url_have_a_replay() {
        let api = FakeApi::serve(vec![Reply::json(
            r#"{"data":{"match_salts":[
                {"match_id":1,"demo_url":"http://replay1.valve.net/1.dem.bz2"},
                {"match_id":2,"demo_url":null},
                {"match_id":3,"demo_url":""},
                {"match_id":4}]}}"#,
        )]);
        assert_eq!(ask(&api, &[1, 2, 3, 4, 5]).unwrap(), vec![1]);
    }

    #[test]
    fn an_empty_reply_has_no_replays() {
        let api = FakeApi::serve(vec![Reply::json(r#"{"data":{"match_salts":[]}}"#)]);
        assert_eq!(ask(&api, &[1]).unwrap(), Vec::<u64>::new());
    }

    #[test]
    fn no_ids_send_no_request() {
        let api = FakeApi::serve(vec![]);
        assert_eq!(ask(&api, &[]).unwrap(), Vec::<u64>::new());
        assert!(api.requests().is_empty());
    }

    #[test]
    fn ten_thousand_and_one_ids_take_two_requests() {
        let api = FakeApi::serve(vec![
            Reply::json(r#"{"data":{"match_salts":[{"match_id":10000,"demo_url":"u"}]}}"#),
            Reply::json(r#"{"data":{"match_salts":[{"match_id":10001,"demo_url":"u"}]}}"#),
        ]);
        let ids: Vec<u64> = (1..=10_001).collect();
        assert_eq!(ask(&api, &ids).unwrap(), vec![10000, 10001]);
        let requests = api.requests();
        assert_eq!(requests.len(), 2);
        assert!(requests[0].body.contains("[1,2,"));
        assert!(requests[0].body.contains(",10000]"));
        assert!(requests[1].body.contains("in: [10001]"));
        assert!(requests.iter().all(|r| r.route == "POST /v1/graphql"));
    }

    #[test]
    fn a_server_error_fails_the_lookup() {
        let api = FakeApi::serve(vec![Reply::status("503 Service Unavailable")]);
        assert!(ask(&api, &[1]).is_err());
    }

    #[test]
    fn a_graphql_error_fails_the_lookup() {
        let api = FakeApi::serve(vec![Reply::json(r#"{"errors":[{"message":"rate limited"}]}"#)]);
        assert!(ask(&api, &[1]).is_err());
    }

    const RATE_LIMITED: &str =
        r#"{"type":"ip","quota":{"limit":30,"period":60},"requests":31,"remaining":0,"next_request_in":2000}"#;
    const KNOWN_5: &str = r#"[{"match_id":5}]"#;

    fn limited() -> Reply {
        Reply::status("429 Too Many Requests").body(RATE_LIMITED)
    }

    /// The lookup's result and the waits it asked for, which never sleep.
    fn known(api: &FakeApi, ids: &[u64], patience: Patience) -> (Result<HashSet<u64>, AppError>, Vec<Duration>) {
        let waits = Mutex::new(Vec::new());
        let result = block_on(known_match_ids_at(&api.url, &reqwest::Client::new(), ids, patience, |wait| {
            waits.lock().unwrap().push(wait);
            std::future::ready(())
        }));
        (result, waits.into_inner().unwrap())
    }

    fn secs(s: u64) -> Duration {
        Duration::from_secs(s)
    }

    #[test]
    fn a_429_with_retry_after_waits_then_succeeds() {
        let api = FakeApi::serve(vec![limited().retry_after("2"), Reply::json(KNOWN_5)]);
        let (result, waits) = known(&api, &[5, 6], Patience::Wait);
        assert_eq!(result.unwrap(), HashSet::from([5]));
        assert_eq!(waits, vec![secs(2)]);
        assert_eq!(api.requests().len(), 2);
    }

    #[test]
    fn a_429_without_retry_after_backs_off() {
        let api = FakeApi::serve(vec![limited(), limited(), Reply::json(KNOWN_5)]);
        let (result, waits) = known(&api, &[5], Patience::Wait);
        assert_eq!(result.unwrap(), HashSet::from([5]));
        assert_eq!(waits, vec![secs(5), secs(10)]);
    }

    #[test]
    fn a_busy_database_waits_like_a_rate_limit() {
        let api = FakeApi::serve(vec![Reply::status("503 Service Unavailable").retry_after("5"), Reply::json(KNOWN_5)]);
        let (result, waits) = known(&api, &[5], Patience::Wait);
        assert_eq!(result.unwrap(), HashSet::from([5]));
        assert_eq!(waits, vec![secs(5)]);
    }

    #[test]
    fn a_zero_retry_after_still_waits_a_second() {
        let api = FakeApi::serve(vec![limited().retry_after("0"), Reply::json(KNOWN_5)]);
        let (_, waits) = known(&api, &[5], Patience::Wait);
        assert_eq!(waits, vec![secs(1)]);
    }

    #[test]
    fn a_long_retry_after_is_clamped_to_a_minute() {
        let api = FakeApi::serve(vec![limited().retry_after("3600"), Reply::json(KNOWN_5)]);
        let (_, waits) = known(&api, &[5], Patience::Wait);
        assert_eq!(waits, vec![secs(60)]);
    }

    #[test]
    fn attempts_are_capped() {
        let api = FakeApi::serve((0..6).map(|_| limited().retry_after("1")).collect());
        let (result, waits) = known(&api, &[5], Patience::Wait);
        assert!(result.is_err());
        assert_eq!(api.requests().len(), 4);
        assert_eq!(waits.len(), 3);
    }

    #[test]
    fn failing_fast_makes_one_attempt() {
        let api = FakeApi::serve(vec![limited().retry_after("2"), Reply::json(KNOWN_5)]);
        let (result, waits) = known(&api, &[5], Patience::FailFast);
        assert!(result.is_err());
        assert_eq!(api.requests().len(), 1);
        assert!(waits.is_empty());
    }

    #[test]
    fn a_rate_limit_error_names_the_quota() {
        let api = FakeApi::serve(vec![limited().retry_after("2")]);
        let (result, _) = known(&api, &[5], Patience::FailFast);
        let error = result.unwrap_err().to_string();
        assert!(error.contains("ip quota"), "{error}");
    }

    #[test]
    fn a_client_error_is_not_retried() {
        let api = FakeApi::serve(vec![Reply::status("400 Bad Request"), Reply::json(KNOWN_5)]);
        let (result, waits) = known(&api, &[5], Patience::Wait);
        assert!(result.is_err());
        assert_eq!(api.requests().len(), 1);
        assert!(waits.is_empty());
    }

    #[test]
    fn ids_are_comma_separated() {
        assert_eq!(join_ids(&[1u64, 22, 333]), "1,22,333");
    }

    #[test]
    fn only_players_with_recent_matches_count() {
        let rows: Vec<SteamProfileRow> = serde_json::from_str(
            r#"[{"account_id":1,"matches_played_last_30d":3},{"account_id":2,"matches_played_last_30d":0},
                {"account_id":3},{"account_id":4,"matches_played_last_30d":null}]"#,
        )
        .unwrap();
        assert_eq!(recent_player_ids(rows).collect::<Vec<_>>(), vec![1]);
    }
}
