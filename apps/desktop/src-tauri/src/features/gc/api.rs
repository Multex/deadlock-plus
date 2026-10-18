use std::collections::HashSet;
use std::sync::Mutex;

use reqwest::header::{HeaderMap, COOKIE, SET_COOKIE};
use reqwest::StatusCode;
use serde::de::DeserializeOwned;
use serde::Deserialize;

use dp_gc::friends::{ActiveFriend, HistoryRow};

use dp_sync::LockExt;

use crate::features::error::AppError;

const API: &str = "https://api.deadlock-api.com/v1";
const METADATA_CHUNK: usize = 100;
const PLAYERS_CHUNK: usize = 1000;
const CLAIM_COOKIE: &str = "to_fetch_claim";

/// deadlock-api answers 404 for a query that matches nothing, which reads as an empty `T`.
async fn get_json<T: DeserializeOwned + Default>(req: reqwest::RequestBuilder) -> Result<T, AppError> {
    let resp = req.timeout(super::HTTP_TIMEOUT).send().await.map_err(AppError::network)?;
    if resp.status() == StatusCode::NOT_FOUND {
        return Ok(T::default());
    }
    resp.error_for_status().map_err(AppError::network)?.json().await.map_err(AppError::network)
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

/// The subset of `match_ids` deadlock-api already has metadata, and so salts, for.
pub async fn known_match_ids(http: &reqwest::Client, match_ids: &[u64]) -> Result<HashSet<u64>, AppError> {
    let mut known = HashSet::new();
    for chunk in match_ids.chunks(METADATA_CHUNK) {
        let req = http.get(format!("{API}/matches/metadata")).query(&[
            ("match_ids", join_ids(chunk)),
            ("include_info", "true".into()),
            ("limit", METADATA_CHUNK.to_string()),
        ]);
        let rows: Vec<MatchIdRow> = get_json(req).await?;
        known.extend(rows.into_iter().map(|r| r.match_id));
    }
    Ok(known)
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
        players.extend(recent_player_ids(get_json(req).await?));
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
        Request { route: "GET /matches/to-fetch".into(), cookie: cookie.map(Into::into) }
    }

    fn release(cookie: &str) -> Request {
        Request { route: "POST /matches/to-fetch/release".into(), cookie: Some(cookie.into()) }
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
