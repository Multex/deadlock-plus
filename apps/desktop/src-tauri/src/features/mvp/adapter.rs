use std::collections::{HashMap, HashSet};

use dp_mvp::{lobby_badge_from_ranks, LastStats, MatchInput, PlayerInput};
use serde::de::IgnoredAny;
use serde::Deserialize;

const MATCH_MODE_RANKED: u32 = 4;
/// `/v1/players/rank` is today's rank; one whose last ranked match is older than this says little about the lobby.
const RANK_FRESH_S: i64 = 30 * 86_400;

/// The parts of a `/v1/matches/{id}/metadata` body (or a game-captured detail in the same shape) that grading
/// reads. Everything else, the paths' coordinates included, is skipped while parsing.
#[derive(Debug, Clone, Deserialize)]
pub struct Metadata {
    pub match_info: MatchInfo,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MatchInfo {
    pub match_id: u64,
    #[serde(default)]
    pub start_time: Option<i64>,
    #[serde(default)]
    pub duration_s: Option<u32>,
    #[serde(default)]
    pub match_outcome: Option<u32>,
    #[serde(default)]
    pub game_mode: Option<u32>,
    #[serde(default)]
    pub match_mode: Option<u32>,
    #[serde(default)]
    pub not_scored: Option<bool>,
    #[serde(default)]
    pub low_pri_pool: Option<bool>,
    #[serde(default)]
    pub players: Option<Vec<MetaPlayer>>,
    #[serde(default)]
    pub match_paths: Option<MatchPaths>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MetaPlayer {
    #[serde(default)]
    pub account_id: Option<u32>,
    #[serde(default)]
    pub player_slot: Option<u32>,
    #[serde(default)]
    pub hero_id: Option<u32>,
    #[serde(default)]
    pub abandon_match_time_s: Option<u32>,
    #[serde(default)]
    pub player_match_outcome: Option<u32>,
    #[serde(default)]
    pub kills: Option<f64>,
    #[serde(default)]
    pub deaths: Option<f64>,
    #[serde(default)]
    pub assists: Option<f64>,
    #[serde(default)]
    pub net_worth: Option<f64>,
    #[serde(default)]
    pub stats: Option<Vec<MetaStats>>,
    #[serde(default)]
    pub player_rank_data: Option<RankData>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MetaStats {
    #[serde(default)]
    pub player_damage: Option<f64>,
    #[serde(default)]
    pub boss_damage: Option<f64>,
    #[serde(default)]
    pub player_healing: Option<f64>,
    #[serde(default)]
    pub teammate_healing: Option<f64>,
    #[serde(default)]
    pub teammate_barriering: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RankData {
    #[serde(default)]
    pub initial_display_rank: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MatchPaths {
    #[serde(default)]
    pub interval_s: Option<f64>,
    #[serde(default)]
    pub paths: Option<Vec<MetaPath>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MetaPath {
    #[serde(default)]
    pub player_slot: Option<u32>,
    #[serde(default)]
    pub x_pos: Option<Vec<IgnoredAny>>,
}

/// A row of `/v1/players/rank`. Opted-out accounts are absent.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct PlayerRank {
    pub account_id: u32,
    #[serde(default)]
    pub badge: Option<u32>,
    #[serde(default)]
    pub last_match: Option<RankLastMatch>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct RankLastMatch {
    #[serde(default)]
    pub start_time: Option<i64>,
}

pub type Ranks = HashMap<u32, PlayerRank>;

pub fn parse_metadata(body: &[u8]) -> Option<Metadata> {
    serde_json::from_slice(body).ok()
}

pub fn parse_ranks(body: &[u8]) -> Option<Ranks> {
    let rows: Vec<PlayerRank> = serde_json::from_slice(body).ok()?;
    Some(rows.into_iter().map(|r| (r.account_id, r)).collect())
}

pub fn is_ranked(meta: &Metadata) -> bool {
    meta.match_info.match_mode == Some(MATCH_MODE_RANKED)
}

fn players(meta: &Metadata) -> &[MetaPlayer] {
    meta.match_info.players.as_deref().unwrap_or_default()
}

/// The accounts whose current rank an unranked match needs; empty for a ranked one, whose players carry their rank.
pub fn rank_lookup_ids(meta: &Metadata) -> Vec<u32> {
    if is_ranked(meta) {
        return Vec::new();
    }
    players(meta).iter().filter_map(|p| p.account_id).filter(|&id| id != 0).collect()
}

/// One rank per player for the lobby badge: the rank the match recorded when ranked, else the player's current
/// rank from `ranks` when their last ranked match is recent enough.
pub fn lobby_ranks(meta: &Metadata, ranks: &Ranks) -> Vec<Option<u32>> {
    if is_ranked(meta) {
        return players(meta)
            .iter()
            .map(|p| p.player_rank_data.as_ref().and_then(|r| r.initial_display_rank))
            .collect();
    }
    let start = meta.match_info.start_time;
    players(meta)
        .iter()
        .map(|p| {
            let rank = ranks.get(&p.account_id?)?;
            let last = rank.last_match.as_ref()?.start_time?;
            (last >= start? - RANK_FRESH_S).then_some(rank.badge).flatten()
        })
        .collect()
}

/// At most this many account ids per `/v1/players/rank` call.
pub const MAX_RANK_IDS: usize = 1000;

/// Groups matches, by index, so each group's distinct account ids fit one rank call.
pub fn rank_batches(ids_per_match: &[Vec<u32>], max_ids: usize) -> Vec<Vec<usize>> {
    let mut batches: Vec<Vec<usize>> = Vec::new();
    let mut ids: HashSet<u32> = HashSet::new();
    for (i, match_ids) in ids_per_match.iter().enumerate() {
        let added = match_ids.iter().filter(|id| !ids.contains(*id)).collect::<HashSet<_>>().len();
        if batches.is_empty() || ids.len() + added > max_ids {
            batches.push(Vec::new());
            ids.clear();
        }
        ids.extend(match_ids);
        batches.last_mut().expect("pushed above").push(i);
    }
    batches
}

/// The single place a metadata body becomes a grading input. `ranks` is only read for an unranked match.
pub fn match_input(meta: &Metadata, ranks: &Ranks) -> MatchInput {
    let info = &meta.match_info;
    let interval_s = info.match_paths.as_ref().and_then(|p| p.interval_s).unwrap_or(1.0);
    let paths = info.match_paths.as_ref().and_then(|p| p.paths.as_deref()).unwrap_or_default();
    let path_len = |slot: Option<u32>| {
        let path = paths.iter().find(|p| slot.is_some() && p.player_slot == slot)?;
        Some((path.x_pos.as_ref().map_or(0, Vec::len) as f64 * interval_s).round() as u32)
    };
    MatchInput {
        match_id: info.match_id,
        game_mode: info.game_mode.unwrap_or(0),
        match_mode: info.match_mode.unwrap_or(0),
        match_outcome: info.match_outcome.unwrap_or(0),
        not_scored: info.not_scored.unwrap_or(false),
        low_pri_pool: info.low_pri_pool.unwrap_or(false),
        duration_s: info.duration_s.unwrap_or(0),
        lobby_badge: lobby_badge_from_ranks(&lobby_ranks(meta, ranks)),
        players: players(meta)
            .iter()
            .map(|p| PlayerInput {
                account_id: p.account_id.unwrap_or(0),
                player_slot: p.player_slot.unwrap_or(0),
                hero_id: p.hero_id.unwrap_or(0),
                abandon_match_time_s: p.abandon_match_time_s.unwrap_or(0),
                player_match_outcome: p.player_match_outcome.unwrap_or(0),
                kills: count(p.kills),
                deaths: count(p.deaths),
                assists: count(p.assists),
                net_worth: count(p.net_worth),
                last_stats: p.stats.as_deref().and_then(<[MetaStats]>::last).map(last_stats),
                path_len: path_len(p.player_slot),
            })
            .collect(),
    }
}

fn count(value: Option<f64>) -> u32 {
    value.unwrap_or(0.0).round() as u32
}

fn last_stats(stats: &MetaStats) -> LastStats {
    LastStats {
        player_damage: count(stats.player_damage),
        boss_damage: count(stats.boss_damage),
        player_healing: count(stats.player_healing),
        teammate_healing: count(stats.teammate_healing),
        teammate_barriering: count(stats.teammate_barriering),
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub(crate) const RANKED: &str =
        include_str!("../../../../../../packages/match/src/fixtures/golden/ranked-118339116.json");
    pub(crate) const UNRANKED: &str =
        include_str!("../../../../../../packages/match/src/fixtures/golden/unranked-118340050.json");
    pub(crate) const LEAVER: &str =
        include_str!("../../../../../../packages/match/src/fixtures/golden/leaver-118343128.json");

    fn meta(body: &str) -> Metadata {
        parse_metadata(body.as_bytes()).expect("fixture parses")
    }

    #[test]
    fn a_ranked_golden_match_becomes_a_full_input() {
        let input = match_input(&meta(RANKED), &Ranks::new());
        assert_eq!((input.match_id, input.game_mode, input.match_mode, input.match_outcome), (118339116, 1, 4, 0));
        assert_eq!((input.not_scored, input.low_pri_pool, input.duration_s), (false, false, 1439));
        assert_eq!(input.players.len(), 12);
        assert!(dp_mvp::match_eligible(&input));
        let slot8 = input.players.iter().find(|p| p.player_slot == 8).unwrap();
        assert_eq!(
            *slot8,
            PlayerInput {
                account_id: 294396321,
                player_slot: 8,
                hero_id: 65,
                abandon_match_time_s: 0,
                player_match_outcome: 1,
                kills: 8,
                deaths: 0,
                assists: 5,
                net_worth: 37973,
                last_stats: Some(LastStats {
                    player_damage: 23505,
                    boss_damage: 14764,
                    player_healing: 4709,
                    teammate_healing: 0,
                    teammate_barriering: 0,
                }),
                path_len: Some(1440),
            }
        );
    }

    #[test]
    fn a_ranked_lobby_reads_the_ranks_the_match_recorded() {
        let m = meta(RANKED);
        let expected = [Some(0), Some(72), Some(71), Some(72), Some(72), Some(74)];
        assert_eq!(lobby_ranks(&m, &Ranks::new())[..6], expected);
        assert!(rank_lookup_ids(&m).is_empty(), "a ranked match needs no rank call");
        let input = match_input(&m, &Ranks::new());
        assert_eq!(input.lobby_badge, lobby_badge_from_ranks(&lobby_ranks(&m, &Ranks::new())));
    }

    fn rank(account_id: u32, badge: u32, last_start: Option<i64>) -> PlayerRank {
        PlayerRank {
            account_id,
            badge: Some(badge),
            last_match: last_start.map(|s| RankLastMatch { start_time: Some(s) }),
        }
    }

    #[test]
    fn an_unranked_lobby_uses_current_ranks_and_skips_stale_ones() {
        let m = meta(UNRANKED);
        let start = 1792194165;
        let ids = rank_lookup_ids(&m);
        assert_eq!(ids.len(), 12);
        assert_eq!(ids[0], 950109761);
        let ranks = Ranks::from([
            (950109761, rank(950109761, 114, Some(start - 86_400))),
            (96468700, rank(96468700, 92, Some(start - RANK_FRESH_S))),
            (1209401442, rank(1209401442, 101, Some(start - RANK_FRESH_S - 1))),
            (449183103, rank(449183103, 55, None)),
            (937019142, PlayerRank { account_id: 937019142, badge: None, last_match: None }),
        ]);
        let lobby = lobby_ranks(&m, &ranks);
        assert_eq!(lobby[..6], [Some(114), Some(92), None, None, None, None]);
        assert_eq!(match_input(&m, &ranks).lobby_badge, lobby_badge_from_ranks(&lobby));
    }

    #[test]
    fn the_leaver_match_keeps_the_abandon_outcome_and_short_paths() {
        let input = match_input(&meta(LEAVER), &Ranks::new());
        let leaver = input.players.iter().find(|p| p.player_slot == 9).unwrap();
        assert_eq!((leaver.abandon_match_time_s, leaver.player_match_outcome, leaver.path_len), (1106, 3, Some(1144)));
        let short = input.players.iter().find(|p| p.player_slot == 10).unwrap();
        assert_eq!((short.player_match_outcome, short.path_len), (5, Some(1291)));
    }

    #[test]
    fn a_detail_without_paths_leaves_path_len_unknown() {
        let mut value: serde_json::Value = serde_json::from_str(RANKED).unwrap();
        value["match_info"].as_object_mut().unwrap().remove("match_paths");
        let input = match_input(&parse_metadata(value.to_string().as_bytes()).unwrap(), &Ranks::new());
        assert!(input.players.iter().all(|p| p.path_len.is_none()));

        value["match_info"]["match_paths"] = serde_json::json!({"interval_s": 1, "paths": []});
        let input = match_input(&parse_metadata(value.to_string().as_bytes()).unwrap(), &Ranks::new());
        assert!(input.players.iter().all(|p| p.path_len.is_none()));
    }

    #[test]
    fn path_length_is_in_seconds_and_a_missing_slot_is_unknown() {
        let body = r#"{"match_info":{"match_id":5,"duration_s":1200,"players":[
            {"account_id":1,"player_slot":1,"hero_id":2,"stats":[]},
            {"account_id":2,"player_slot":2,"hero_id":3,"stats":null}],
            "match_paths":{"interval_s":2,"paths":[{"player_slot":1,"x_pos":[1,2,3]}]}}}"#;
        let input = match_input(&parse_metadata(body.as_bytes()).unwrap(), &Ranks::new());
        assert_eq!(input.players[0].path_len, Some(6));
        assert_eq!(input.players[1].path_len, None);
        assert!(input.players.iter().all(|p| p.last_stats.is_none()), "no stats samples, no totals");
    }

    #[test]
    fn nulls_and_missing_fields_read_as_zero_and_absent() {
        let body = r#"{"match_info":{"match_id":6,"duration_s":null,"players":[
            {"account_id":null,"player_slot":0,"hero_id":7,"kills":null,"abandon_match_time_s":null,
             "player_rank_data":null,"stats":[{"player_damage":1.0},{"player_damage":250,"boss_damage":null}]}]}}"#;
        let input = match_input(&parse_metadata(body.as_bytes()).unwrap(), &Ranks::new());
        assert_eq!((input.game_mode, input.duration_s, input.not_scored), (0, 0, false));
        let p = &input.players[0];
        assert_eq!((p.account_id, p.kills, p.abandon_match_time_s), (0, 0, 0));
        assert_eq!(p.last_stats, Some(LastStats { player_damage: 250, ..LastStats::default() }));
        assert!(parse_metadata(b"{\"players\":[]}").is_none());
    }

    #[test]
    fn rank_batches_fill_up_to_the_id_limit() {
        let m = |base: u32| (base..base + 12).collect::<Vec<u32>>();
        assert_eq!(rank_batches(&[m(0), m(100), m(200)], 24), vec![vec![0, 1], vec![2]]);
        assert_eq!(rank_batches(&[m(0), m(6), m(100)], 24), vec![vec![0, 1], vec![2]], "shared ids count once");
        assert_eq!(rank_batches(&[m(0), Vec::new(), m(100)], 12), vec![vec![0, 1], vec![2]]);
        assert!(rank_batches(&[], MAX_RANK_IDS).is_empty());
        let many: Vec<Vec<u32>> = (0..90).map(|i| m(i * 100)).collect();
        let batches = rank_batches(&many, MAX_RANK_IDS);
        assert_eq!(batches.iter().map(Vec::len).collect::<Vec<_>>(), vec![83, 7]);
    }

    #[test]
    fn rank_rows_parse_by_account() {
        let body = br#"[{"account_id":405225629,"badge":0,"rank":0,"subrank":0,
            "last_match":{"match_id":118339116,"start_time":1792194079,"player_rank_initial_display_rank":0}},
            {"account_id":1,"badge":0,"rank":0,"subrank":0,"last_match":null}]"#;
        let ranks = parse_ranks(body).unwrap();
        assert_eq!(ranks.len(), 2);
        assert_eq!(ranks[&405225629], rank(405225629, 0, Some(1792194079)));
        assert_eq!(ranks[&1].last_match, None);
        assert!(parse_ranks(b"{}").is_none());
    }
}
