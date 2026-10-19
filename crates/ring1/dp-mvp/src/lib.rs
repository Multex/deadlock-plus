mod lobby;
mod metadata;
mod points;
mod totals;

pub use lobby::{
    competition_ranks, grade_lobby, letter_for_score, lobby_z, score_from_z, LobbyGrade, LobbyLetter, LobbyPlayerGrade,
    LobbyScore, CURVE_CENTRE, CURVE_SLOPE,
};
pub use metadata::{
    LobbyDamageDealer, LobbyDamageMatrix, LobbyDamageSource, LobbyDamageTarget, LobbyDeath, LobbyGoldSource,
    LobbyMatchInfo, LobbyMetadata, LobbyObjective, LobbyPath, LobbyPaths, LobbyPlayer, LobbySample, LobbySourceDetails,
};
pub use points::{
    cc_points, death_points, farm_bonus, farm_dependency, kill_points, metric_points, Metrics, LOBBY_GRADE_VERSION,
    METRIC_COUNT,
};
pub use totals::{
    cc_damage_by_source, early_cut_s, farm_souls, kill_time_share_by_slot, left_early, lobby_eligible, lobby_totals,
    prebase_cut_s_by_team, LobbyTotals, PlayerTotals, LOBBY_TOTALS_VERSION,
};

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum MvpError {
    #[error("metadata body is not the expected JSON: {0}")]
    Json(String),
}
