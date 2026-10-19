use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};

use crate::metadata::{LobbyMatchInfo, LobbyPlayer, LobbySample};

const EARLY_CUT_CAP_S: f64 = 1200.0;
const EARLY_CUT_SHARE: f64 = 2.0 / 3.0;
const BARRACKS_OBJECTIVE_IDS: std::ops::RangeInclusive<u32> = 12..=15;
const STAT_TYPE_DAMAGE: u32 = 0;
const FARM_GOLD_SOURCE: u32 = 12;
const GAME_MODE_NORMAL: u32 = 1;
const MATCH_MODE_UNRANKED: u32 = 1;
const MATCH_MODE_RANKED: u32 = 4;
const MIN_DURATION_S: u32 = 600;
const FULL_MATCH_PLAYERS: usize = 12;
const OUTCOME_PENALIZED: u32 = 3;
/// A player whose path covers less of the match left early, even without an abandon flag.
const MIN_PATH_SHARE: f64 = 0.9;
/// Rows that sum several abilities; the individual abilities are listed separately.
const AGGREGATE_SOURCES: [&str; 5] = ["Ability", "Bullet", "Melee", "Misc", "UnknownAbility"];

/// Bump when the totals extraction changes; stored totals are then stale and must be refetched.
pub const LOBBY_TOTALS_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlayerTotals {
    pub account_id: u32,
    pub player_slot: u32,
    pub hero_id: u32,
    pub team: u32,
    pub left: bool,
    pub early_damage: f64,
    pub late_damage: f64,
    pub early_assists: f64,
    pub late_assists: f64,
    pub prebase_objective: f64,
    pub base_objective: f64,
    pub damage_absorbed: f64,
    pub ally_healing: f64,
    pub heal_prevented: f64,
    pub barriers: f64,
    pub cs: f64,
    pub kills: f64,
    pub kill_time_share: f64,
    pub deaths: f64,
    pub dead_s: f64,
    pub farm_souls: f64,
    pub cc_by_source: BTreeMap<String, f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LobbyTotals {
    pub early_cut_s: f64,
    pub prebase_cut_s: [f64; 2],
    pub leaver: bool,
    pub paths_checked: bool,
    pub players: Vec<PlayerTotals>,
}

/// Last `stats[]` sample taken at or before `t`.
fn sample_at(stats: &[LobbySample], t: f64) -> Option<&LobbySample> {
    stats.iter().rfind(|s| s.time_stamp_s <= t)
}

pub fn early_cut_s(duration_s: u32) -> f64 {
    EARLY_CUT_CAP_S.min(duration_s as f64 * EARLY_CUT_SHARE)
}

/// Per attacking team: when it destroyed its first enemy barracks. A team that took none keeps the whole match.
pub fn prebase_cut_s_by_team(info: &LobbyMatchInfo) -> [f64; 2] {
    let mut cut = [info.duration_s as f64; 2];
    for o in &info.objectives {
        if BARRACKS_OBJECTIVE_IDS.contains(&o.team_objective_id) && o.destroyed_time_s != 0 && o.team < 2 {
            let attacker = 1 - o.team as usize;
            cut[attacker] = cut[attacker].min(o.destroyed_time_s as f64);
        }
    }
    cut
}

pub fn farm_souls(final_sample: &LobbySample) -> f64 {
    let s = final_sample;
    s.gold_lane_creep
        + s.gold_lane_creep_orbs
        + s.gold_neutral_creep
        + s.gold_neutral_creep_orbs
        + s.gold_treasure
        + s.gold_sources.iter().filter(|g| g.source == FARM_GOLD_SOURCE).map(|g| g.gold).sum::<f64>()
}

/// Killer slot to the sum of (victim death time / duration), read from every victim's `death_details`.
pub fn kill_time_share_by_slot(info: &LobbyMatchInfo) -> HashMap<u32, f64> {
    let mut out = HashMap::new();
    if info.duration_s == 0 {
        return out;
    }
    for d in info.players.iter().flat_map(|p| &p.death_details) {
        if d.killer_player_slot != 0 {
            *out.entry(d.killer_player_slot).or_insert(0.0) += d.game_time_s / info.duration_s as f64;
        }
    }
    out
}

/// Dealer slot to final damage per source name: damage rows only, enemy heroes only, aggregate rows left out.
/// Which sources count as CC is the caller's filter.
pub fn cc_damage_by_source(info: &LobbyMatchInfo) -> HashMap<u32, BTreeMap<String, f64>> {
    let mut out: HashMap<u32, BTreeMap<String, f64>> = HashMap::new();
    let Some(dm) = &info.damage_matrix else { return out };
    let team: HashMap<u32, u32> = info.players.iter().map(|p| (p.player_slot, p.team)).collect();
    for dealer in &dm.damage_dealers {
        let dealer_team = team.get(&dealer.dealer_player_slot);
        for src in &dealer.damage_sources {
            let i = src.source_details_index;
            let (Some(name), Some(&stat_type)) =
                (dm.source_details.source_name.get(i), dm.source_details.stat_type.get(i))
            else {
                continue;
            };
            if stat_type != STAT_TYPE_DAMAGE || AGGREGATE_SOURCES.contains(&name.as_str()) {
                continue;
            }
            for target in &src.damage_to_players {
                let (Some(victim_team), Some(&total)) = (team.get(&target.target_player_slot), target.damage.last())
                else {
                    continue;
                };
                if Some(victim_team) == dealer_team {
                    continue;
                }
                *out.entry(dealer.dealer_player_slot).or_default().entry(name.clone()).or_insert(0.0) += total;
            }
        }
    }
    out
}

/// Seconds of recorded path for a slot; unknown when the detail has no path for it.
fn path_seconds(info: &LobbyMatchInfo, slot: u32) -> Option<f64> {
    let paths = info.match_paths.as_ref()?;
    let interval = paths.interval_s.unwrap_or(1.0);
    let path = paths.paths.as_deref()?.iter().find(|p| p.player_slot == slot)?;
    Some((path.x_pos.as_ref().map_or(0, Vec::len) as f64 * interval).round())
}

pub fn left_early(info: &LobbyMatchInfo, player: &LobbyPlayer) -> bool {
    player.abandon_match_time_s != 0
        || player.player_match_outcome == OUTCOME_PENALIZED
        || path_seconds(info, player.player_slot).is_some_and(|s| s < MIN_PATH_SHARE * info.duration_s as f64)
}

pub fn lobby_totals(info: &LobbyMatchInfo) -> LobbyTotals {
    let early_t = early_cut_s(info.duration_s);
    let prebase_t = prebase_cut_s_by_team(info);
    let mut cc = cc_damage_by_source(info);
    let kill_shares = kill_time_share_by_slot(info);
    let zero = LobbySample::default();

    let players: Vec<PlayerTotals> = info
        .players
        .iter()
        .map(|p| {
            let final_s = p.stats.last().unwrap_or(&zero);
            let early = sample_at(&p.stats, early_t).unwrap_or(&zero);
            let pre_t = prebase_t.get(p.team as usize).copied().unwrap_or(info.duration_s as f64);
            let pre = sample_at(&p.stats, pre_t).unwrap_or(&zero);
            PlayerTotals {
                account_id: p.account_id,
                player_slot: p.player_slot,
                hero_id: p.hero_id,
                team: p.team,
                left: left_early(info, p),
                early_damage: early.player_damage,
                late_damage: final_s.player_damage - early.player_damage,
                early_assists: early.assists,
                late_assists: final_s.assists - early.assists,
                prebase_objective: pre.boss_damage,
                base_objective: final_s.boss_damage - pre.boss_damage,
                damage_absorbed: final_s.player_damage_taken + final_s.damage_mitigated + final_s.damage_absorbed,
                ally_healing: final_s.teammate_healing,
                heal_prevented: final_s.heal_prevented,
                barriers: final_s.teammate_barriering,
                cs: final_s.creep_kills,
                kills: p.kills,
                kill_time_share: kill_shares.get(&p.player_slot).copied().unwrap_or(0.0),
                deaths: p.deaths,
                dead_s: p.death_details.iter().map(|d| d.death_duration_s).sum(),
                farm_souls: farm_souls(final_s),
                cc_by_source: cc.remove(&p.player_slot).unwrap_or_default(),
            }
        })
        .collect();

    let paths_checked = info.players.iter().all(|p| path_seconds(info, p.player_slot).is_some());
    LobbyTotals {
        early_cut_s: early_t,
        prebase_cut_s: prebase_t,
        leaver: players.iter().any(|p| p.left),
        paths_checked,
        players,
    }
}

pub fn lobby_eligible(info: &LobbyMatchInfo) -> bool {
    info.game_mode == GAME_MODE_NORMAL
        && (info.match_mode == MATCH_MODE_UNRANKED || info.match_mode == MATCH_MODE_RANKED)
        && info.match_outcome == 0
        && !info.not_scored
        && !info.low_pri_pool
        && info.duration_s >= MIN_DURATION_S
        && info.players.len() == FULL_MATCH_PLAYERS
}
