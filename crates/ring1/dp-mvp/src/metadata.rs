use serde::de::IgnoredAny;
use serde::{Deserialize, Deserializer};

use crate::MvpError;

/// The API omits zero and empty values, and sends `null` for some counters; both read as the default.
fn zero_if_null<'de, D: Deserializer<'de>>(d: D) -> Result<f64, D::Error> {
    Ok(Option::<f64>::deserialize(d)?.unwrap_or(0.0))
}

fn default_if_null<'de, D, T>(d: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de> + Default,
{
    Ok(Option::<T>::deserialize(d)?.unwrap_or_default())
}

#[derive(Debug, Clone, Deserialize)]
pub struct LobbyMetadata {
    pub match_info: LobbyMatchInfo,
}

impl LobbyMetadata {
    pub fn from_slice(body: &[u8]) -> Result<Self, MvpError> {
        serde_json::from_slice(body).map_err(|e| MvpError::Json(e.to_string()))
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct LobbyMatchInfo {
    #[serde(default)]
    pub match_id: u64,
    #[serde(default)]
    pub duration_s: u32,
    #[serde(default)]
    pub match_outcome: u32,
    #[serde(default)]
    pub winning_team: u32,
    #[serde(default)]
    pub game_mode: u32,
    #[serde(default)]
    pub match_mode: u32,
    #[serde(default)]
    pub low_pri_pool: bool,
    #[serde(default)]
    pub not_scored: bool,
    #[serde(default, deserialize_with = "default_if_null")]
    pub objectives: Vec<LobbyObjective>,
    #[serde(default, deserialize_with = "default_if_null")]
    pub players: Vec<LobbyPlayer>,
    #[serde(default)]
    pub damage_matrix: Option<LobbyDamageMatrix>,
    #[serde(default)]
    pub match_paths: Option<LobbyPaths>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct LobbyObjective {
    #[serde(default)]
    pub team_objective_id: u32,
    #[serde(default)]
    pub team: u32,
    #[serde(default)]
    pub destroyed_time_s: u32,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct LobbyPlayer {
    #[serde(default)]
    pub account_id: u32,
    #[serde(default)]
    pub player_slot: u32,
    #[serde(default)]
    pub team: u32,
    #[serde(default)]
    pub hero_id: u32,
    #[serde(default, deserialize_with = "zero_if_null")]
    pub kills: f64,
    #[serde(default, deserialize_with = "zero_if_null")]
    pub deaths: f64,
    #[serde(default, deserialize_with = "zero_if_null")]
    pub assists: f64,
    #[serde(default)]
    pub abandon_match_time_s: u32,
    #[serde(default)]
    pub player_match_outcome: u32,
    #[serde(default, deserialize_with = "default_if_null")]
    pub death_details: Vec<LobbyDeath>,
    #[serde(default, deserialize_with = "default_if_null")]
    pub stats: Vec<LobbySample>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct LobbyDeath {
    #[serde(default, deserialize_with = "zero_if_null")]
    pub game_time_s: f64,
    /// 0 when the killer is not a player.
    #[serde(default)]
    pub killer_player_slot: u32,
    #[serde(default, deserialize_with = "zero_if_null")]
    pub death_duration_s: f64,
}

/// One cumulative `stats[]` sample; a key the API leaves out is 0.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct LobbySample {
    #[serde(default, deserialize_with = "zero_if_null")]
    pub time_stamp_s: f64,
    #[serde(default, deserialize_with = "zero_if_null")]
    pub assists: f64,
    #[serde(default, deserialize_with = "zero_if_null")]
    pub player_damage: f64,
    #[serde(default, deserialize_with = "zero_if_null")]
    pub boss_damage: f64,
    #[serde(default, deserialize_with = "zero_if_null")]
    pub player_damage_taken: f64,
    #[serde(default, deserialize_with = "zero_if_null")]
    pub damage_mitigated: f64,
    #[serde(default, deserialize_with = "zero_if_null")]
    pub damage_absorbed: f64,
    #[serde(default, deserialize_with = "zero_if_null")]
    pub teammate_healing: f64,
    #[serde(default, deserialize_with = "zero_if_null")]
    pub teammate_barriering: f64,
    #[serde(default, deserialize_with = "zero_if_null")]
    pub heal_prevented: f64,
    #[serde(default, deserialize_with = "zero_if_null")]
    pub creep_kills: f64,
    #[serde(default, deserialize_with = "zero_if_null")]
    pub gold_lane_creep: f64,
    #[serde(default, deserialize_with = "zero_if_null")]
    pub gold_lane_creep_orbs: f64,
    #[serde(default, deserialize_with = "zero_if_null")]
    pub gold_neutral_creep: f64,
    #[serde(default, deserialize_with = "zero_if_null")]
    pub gold_neutral_creep_orbs: f64,
    #[serde(default, deserialize_with = "zero_if_null")]
    pub gold_treasure: f64,
    #[serde(default, deserialize_with = "default_if_null")]
    pub gold_sources: Vec<LobbyGoldSource>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct LobbyGoldSource {
    #[serde(default)]
    pub source: u32,
    #[serde(default, deserialize_with = "zero_if_null")]
    pub gold: f64,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct LobbyDamageMatrix {
    #[serde(default, deserialize_with = "default_if_null")]
    pub sample_time_s: Vec<u32>,
    #[serde(default)]
    pub source_details: LobbySourceDetails,
    #[serde(default, deserialize_with = "default_if_null")]
    pub damage_dealers: Vec<LobbyDamageDealer>,
}

/// Parallel arrays indexed by `source_details_index`.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct LobbySourceDetails {
    #[serde(default, deserialize_with = "default_if_null")]
    pub source_name: Vec<String>,
    #[serde(default, deserialize_with = "default_if_null")]
    pub stat_type: Vec<u32>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct LobbyDamageDealer {
    #[serde(default)]
    pub dealer_player_slot: u32,
    #[serde(default, deserialize_with = "default_if_null")]
    pub damage_sources: Vec<LobbyDamageSource>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct LobbyDamageSource {
    #[serde(default)]
    pub source_details_index: usize,
    #[serde(default, deserialize_with = "default_if_null")]
    pub damage_to_players: Vec<LobbyDamageTarget>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct LobbyDamageTarget {
    /// 0 is a non-player target.
    #[serde(default)]
    pub target_player_slot: u32,
    /// Cumulative per `sample_time_s`; the last element is the total.
    #[serde(default, deserialize_with = "default_if_null")]
    pub damage: Vec<f64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct LobbyPaths {
    #[serde(default)]
    pub interval_s: Option<f64>,
    #[serde(default)]
    pub paths: Option<Vec<LobbyPath>>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct LobbyPath {
    #[serde(default)]
    pub player_slot: u32,
    #[serde(default)]
    pub x_pos: Option<Vec<IgnoredAny>>,
}
