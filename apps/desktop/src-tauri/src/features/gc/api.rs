use std::collections::HashSet;

use reqwest::StatusCode;
use serde::de::DeserializeOwned;
use serde::Deserialize;

use dp_gc::friends::{ActiveFriend, HistoryRow};

use crate::features::error::AppError;

const API: &str = "https://api.deadlock-api.com/v1";
const METADATA_CHUNK: usize = 100;
const PLAYERS_CHUNK: usize = 1000;

/// deadlock-api answers 404 for a query that matches nothing, which reads as an empty `T`.
async fn get_json<T: DeserializeOwned + Default>(req: reqwest::RequestBuilder) -> Result<T, AppError> {
    let resp = req.send().await.map_err(AppError::network)?;
    if resp.status() == StatusCode::NOT_FOUND {
        return Ok(T::default());
    }
    resp.error_for_status().map_err(AppError::network)?.json().await.map_err(AppError::network)
}

fn join_ids(ids: &[impl ToString]) -> String {
    ids.iter().map(ToString::to_string).collect::<Vec<_>>().join(",")
}

/// Matches deadlock-api still needs salts for.
pub async fn to_fetch(http: &reqwest::Client) -> Result<Vec<u64>, AppError> {
    get_json(http.get(format!("{API}/matches/to-fetch"))).await
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
    use super::*;

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
