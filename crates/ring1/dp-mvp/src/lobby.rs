use serde::{Deserialize, Serialize};

use crate::points::{farm_bonus, farm_dependency, metric_points, Metrics, LOBBY_GRADE_VERSION, METRIC_COUNT};
use crate::totals::LobbyTotals;

/// The score curve is `CURVE_CENTRE + CURVE_SLOPE * z`; both numbers were chosen so the letter bands fill out
/// across a lobby the way the fitted points are spread.
pub const CURVE_CENTRE: f64 = 55.0;
pub const CURVE_SLOPE: f64 = 20.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LobbyLetter {
    #[serde(rename = "S+")]
    SPlus,
    S,
    #[serde(rename = "S-")]
    SMinus,
    #[serde(rename = "A+")]
    APlus,
    A,
    #[serde(rename = "A-")]
    AMinus,
    #[serde(rename = "B+")]
    BPlus,
    B,
    #[serde(rename = "B-")]
    BMinus,
    #[serde(rename = "C+")]
    CPlus,
    C,
    #[serde(rename = "C-")]
    CMinus,
    #[serde(rename = "D+")]
    DPlus,
    D,
    #[serde(rename = "D-")]
    DMinus,
    #[serde(rename = "E+")]
    EPlus,
    E,
    #[serde(rename = "E-")]
    EMinus,
    F,
}

impl LobbyLetter {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::SPlus => "S+",
            Self::S => "S",
            Self::SMinus => "S-",
            Self::APlus => "A+",
            Self::A => "A",
            Self::AMinus => "A-",
            Self::BPlus => "B+",
            Self::B => "B",
            Self::BMinus => "B-",
            Self::CPlus => "C+",
            Self::C => "C",
            Self::CMinus => "C-",
            Self::DPlus => "D+",
            Self::D => "D",
            Self::DMinus => "D-",
            Self::EPlus => "E+",
            Self::E => "E",
            Self::EMinus => "E-",
            Self::F => "F",
        }
    }
}

/// Minimum score in tenths of a point, so band edges are exact integers; below the last cut is F.
const LETTER_CUTS: [(i32, LobbyLetter); 18] = [
    (966, LobbyLetter::SPlus),
    (933, LobbyLetter::S),
    (900, LobbyLetter::SMinus),
    (850, LobbyLetter::APlus),
    (800, LobbyLetter::A),
    (750, LobbyLetter::AMinus),
    (700, LobbyLetter::BPlus),
    (650, LobbyLetter::B),
    (575, LobbyLetter::BMinus),
    (500, LobbyLetter::CPlus),
    (450, LobbyLetter::C),
    (400, LobbyLetter::CMinus),
    (350, LobbyLetter::DPlus),
    (300, LobbyLetter::D),
    (250, LobbyLetter::DMinus),
    (200, LobbyLetter::EPlus),
    (150, LobbyLetter::E),
    (100, LobbyLetter::EMinus),
];

/// The letter comes from the score rounded to tenths (half up), the precision the score is shown at.
pub fn letter_for_score(score: f64) -> LobbyLetter {
    let tenths = (score * 10.0 + 0.5).floor() as i32;
    LETTER_CUTS.iter().find(|(cut, _)| tenths >= *cut).map_or(LobbyLetter::F, |(_, l)| *l)
}

pub fn score_from_z(z: f64) -> f64 {
    (CURVE_CENTRE + CURVE_SLOPE * z).clamp(0.0, 100.0)
}

/// Population z-scores; a lobby where every value is equal gets 0.
pub fn lobby_z(values: &[f64]) -> Vec<f64> {
    let n = values.len() as f64;
    let mean = values.iter().sum::<f64>() / n;
    let sd = (values.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n).sqrt();
    values.iter().map(|x| if sd > 0.0 { (x - mean) / sd } else { 0.0 }).collect()
}

/// 1 + the number of strictly larger values; equal values share a rank.
pub fn competition_ranks(values: &[f64]) -> Vec<u32> {
    values.iter().map(|v| 1 + values.iter().filter(|o| *o > v).count() as u32).collect()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LobbyScore {
    pub z: f64,
    pub score: f64,
    pub letter: LobbyLetter,
    pub place: u32,
    /// Lobby rank of each stat's points among graded players.
    pub metric_ranks: Metrics<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LobbyPlayerGrade {
    pub account_id: u32,
    pub player_slot: u32,
    pub hero_id: u32,
    pub team: u32,
    pub left: bool,
    pub points: Metrics<f64>,
    pub points_sum: f64,
    pub farm_dependency: f64,
    pub farm_bonus: f64,
    pub total_points: f64,
    /// `None` for a player who left early.
    pub score: Option<LobbyScore>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LobbyGrade {
    pub version: u32,
    /// In the order of `LobbyTotals::players`.
    pub players: Vec<LobbyPlayerGrade>,
}

/// `is_cc` says which damage source names count as hard CC. Leavers are not scored and do not move the others'
/// z-scores or ranks, but still count in their team's best farm souls.
pub fn grade_lobby(totals: &LobbyTotals, is_cc: &impl Fn(&str) -> bool) -> LobbyGrade {
    let mut team_max = [0.0_f64; 2];
    for p in &totals.players {
        if let Some(m) = team_max.get_mut(p.team as usize) {
            *m = m.max(p.farm_souls);
        }
    }

    let mut players: Vec<LobbyPlayerGrade> = totals
        .players
        .iter()
        .map(|p| {
            let points = metric_points(p, is_cc);
            let points_sum = points.sum();
            let dependency = farm_dependency(p.farm_souls, team_max.get(p.team as usize).copied().unwrap_or(0.0));
            let bonus = farm_bonus(points_sum, dependency);
            LobbyPlayerGrade {
                account_id: p.account_id,
                player_slot: p.player_slot,
                hero_id: p.hero_id,
                team: p.team,
                left: p.left,
                points,
                points_sum,
                farm_dependency: dependency,
                farm_bonus: bonus,
                total_points: points_sum + bonus,
                score: None,
            }
        })
        .collect();

    let graded: Vec<usize> = (0..players.len()).filter(|&i| !players[i].left).collect();
    if graded.is_empty() {
        return LobbyGrade { version: LOBBY_GRADE_VERSION, players };
    }

    let totals_of: Vec<f64> = graded.iter().map(|&i| players[i].total_points).collect();
    let zs = lobby_z(&totals_of);
    let places = competition_ranks(&totals_of);
    let columns: Vec<[f64; METRIC_COUNT]> = graded.iter().map(|&i| players[i].points.to_array()).collect();
    let mut metric_ranks = vec![[0u32; METRIC_COUNT]; graded.len()];
    for m in 0..METRIC_COUNT {
        let column: Vec<f64> = columns.iter().map(|c| c[m]).collect();
        for (row, rank) in metric_ranks.iter_mut().zip(competition_ranks(&column)) {
            row[m] = rank;
        }
    }

    for (k, &i) in graded.iter().enumerate() {
        let score = score_from_z(zs[k]);
        players[i].score = Some(LobbyScore {
            z: zs[k],
            score,
            letter: letter_for_score(score),
            place: places[k],
            metric_ranks: Metrics::from_array(metric_ranks[k]),
        });
    }
    LobbyGrade { version: LOBBY_GRADE_VERSION, players }
}
