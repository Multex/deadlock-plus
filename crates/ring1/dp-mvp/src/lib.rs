mod grade;
mod math;
mod model;
mod sample;
mod skew;
mod stat;

pub use grade::{letter_for, match_eligible, LastStats, MatchGrade, MatchInput, MvpLetter, PlayerGrade, PlayerInput};
pub use model::{build, AllHeroes, HeroModel, ModelCache, MIN_HERO_ROWS, MODEL_VERSION};
pub use sample::{parse_matches, Sample, SampleMatch, SamplePlayer, SampleRow, SampleSummary};
pub use skew::{lobby_badge_from_ranks, TierSkew};
pub use stat::{Percentiles, Stat, Totals, STATS, STAT_COUNT};

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum MvpError {
    #[error("sample body is not the expected JSON: {0}")]
    Json(String),
    #[error("GraphQL error: {0}")]
    GraphQl(String),
    #[error("match {match_id} has a null stat")]
    NullStat { match_id: u64 },
    #[error("sample has {rows} usable rows, need {need}")]
    TooFewRows { rows: usize, need: usize },
    #[error("sample win rate {0} is outside 0.48-0.52")]
    WinRate(f64),
    #[error("{0:?} does not track winning across all heroes")]
    Correlation(Stat),
    #[error("weights for {0} are not finite or do not sum to 1")]
    Weights(String),
}
