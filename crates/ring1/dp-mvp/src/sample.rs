use serde::{Deserialize, Serialize};

use crate::stat::{Totals, STAT_COUNT};
use crate::MvpError;

const FULL_MATCH_ROWS: usize = 12;

/// One match of the GraphQL `matches` sample, as the API returns it.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct SampleMatch {
    pub match_id: u64,
    pub duration_s: u32,
    pub winning_team: String,
    /// Set for ranked matches only.
    #[serde(default)]
    pub average_badge: Option<u32>,
    pub players: Vec<SamplePlayer>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct SamplePlayer {
    pub player_slot: u32,
    pub hero_id: u32,
    pub team: String,
    pub kills: Option<f64>,
    pub deaths: Option<f64>,
    pub assists: Option<f64>,
    pub net_worth: Option<f64>,
    pub abandon_match_time_s: Option<u32>,
    pub max_player_damage: Option<f64>,
    pub max_boss_damage: Option<f64>,
    pub max_player_healing: Option<f64>,
    pub max_teammate_healing: Option<f64>,
    pub max_teammate_barriering: Option<f64>,
}

/// One usable player row of the sample.
#[derive(Debug, Clone, PartialEq)]
pub struct SampleRow {
    pub hero_id: u32,
    pub won: bool,
    pub duration_s: u32,
    /// The match's average badge; `Some` only for ranked matches.
    pub lobby_badge: Option<u32>,
    pub per_minute: [f64; STAT_COUNT],
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SampleSummary {
    pub rows: usize,
    pub matches: usize,
    pub min_match_id: u64,
    pub max_match_id: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Sample {
    pub rows: Vec<SampleRow>,
    pub summary: SampleSummary,
}

#[derive(Deserialize)]
struct Response {
    data: Option<Data>,
    #[serde(default)]
    errors: Vec<GraphQlError>,
}

#[derive(Deserialize)]
struct Data {
    matches: Vec<SampleMatch>,
}

#[derive(Deserialize)]
struct GraphQlError {
    message: String,
}

/// Reads one GraphQL response body. GraphQL reports failures as HTTP 200 with `errors`, so this checks them.
pub fn parse_matches(body: &str) -> Result<Vec<SampleMatch>, MvpError> {
    let response: Response = serde_json::from_str(body).map_err(|e| MvpError::Json(e.to_string()))?;
    if !response.errors.is_empty() {
        let messages: Vec<String> = response.errors.into_iter().map(|e| e.message).collect();
        return Err(MvpError::GraphQl(messages.join("; ")));
    }
    response.data.map(|d| d.matches).ok_or_else(|| MvpError::Json("no `data.matches`".into()))
}

impl Sample {
    /// Keeps whole 12-row matches in which nobody abandoned. A null stat fails the whole sample: a null
    /// abandon time anywhere, or any null in a kept match.
    pub fn from_matches(matches: &[SampleMatch]) -> Result<Sample, MvpError> {
        let mut rows = Vec::new();
        let mut kept_ids = Vec::new();
        for m in matches {
            let mut abandons = m.players.iter().map(|p| p.abandon_match_time_s);
            if abandons.clone().any(|a| a.is_none()) {
                return Err(MvpError::NullStat { match_id: m.match_id });
            }
            if m.players.len() < FULL_MATCH_ROWS || abandons.any(|a| a != Some(0)) {
                continue;
            }
            for p in &m.players {
                let totals = totals(p).ok_or(MvpError::NullStat { match_id: m.match_id })?;
                rows.push(SampleRow {
                    hero_id: p.hero_id,
                    won: p.team == m.winning_team,
                    duration_s: m.duration_s,
                    lobby_badge: m.average_badge,
                    per_minute: totals.per_minute(m.duration_s),
                });
            }
            kept_ids.push(m.match_id);
        }
        let summary = SampleSummary {
            rows: rows.len(),
            matches: kept_ids.len(),
            min_match_id: kept_ids.iter().copied().min().unwrap_or(0),
            max_match_id: kept_ids.iter().copied().max().unwrap_or(0),
        };
        Ok(Sample { rows, summary })
    }
}

fn totals(p: &SamplePlayer) -> Option<Totals> {
    Some(Totals {
        kills: p.kills?,
        deaths: p.deaths?,
        assists: p.assists?,
        net_worth: p.net_worth?,
        player_damage: p.max_player_damage?,
        boss_damage: p.max_boss_damage?,
        player_healing: p.max_player_healing?,
        teammate_healing: p.max_teammate_healing?,
        teammate_barriering: p.max_teammate_barriering?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(crate) const FIXTURE: &str = include_str!("../fixtures/sample.json");

    #[test]
    fn parses_the_graphql_matches_shape() {
        let matches = parse_matches(FIXTURE).unwrap();
        assert_eq!(matches.len(), 90);
        assert_eq!(matches.iter().map(|m| m.players.len()).sum::<usize>(), 1079);
        let first = &matches[0];
        assert_eq!((first.match_id, first.duration_s, first.winning_team.as_str()), (118343128, 1362, "Team0"));
        assert_eq!(first.players[0].max_teammate_healing, Some(1184.0));
    }

    #[test]
    fn graphql_errors_fail_the_parse() {
        let body = r#"{"data":null,"errors":[{"message":"Query is too complex"}]}"#;
        assert_eq!(parse_matches(body), Err(MvpError::GraphQl("Query is too complex".into())));
        assert!(matches!(parse_matches("not json"), Err(MvpError::Json(_))));
    }

    #[test]
    fn drops_matches_with_an_abandon_or_missing_rows() {
        let sample = Sample::from_matches(&parse_matches(FIXTURE).unwrap()).unwrap();
        assert_eq!(
            sample.summary,
            SampleSummary { rows: 912, matches: 76, min_match_id: 118333842, max_match_id: 118340487 }
        );
        assert_eq!(sample.rows.len(), 912);
        assert_eq!(sample.rows.iter().filter(|r| r.won).count(), 456);
    }

    #[test]
    fn a_null_stat_in_a_kept_match_fails_the_sample() {
        let mut matches = parse_matches(FIXTURE).unwrap();
        let kept = matches.iter().position(|m| m.match_id == 118340487).unwrap();
        matches[kept].players[3].max_boss_damage = None;
        assert_eq!(Sample::from_matches(&matches), Err(MvpError::NullStat { match_id: 118340487 }));
    }

    #[test]
    fn rows_carry_the_win_and_per_minute_stats() {
        let matches = parse_matches(FIXTURE).unwrap();
        let m = matches.iter().find(|m| m.match_id == 118340487).unwrap();
        let sample = Sample::from_matches(std::slice::from_ref(m)).unwrap();
        let p = &m.players[0];
        let row = &sample.rows[0];
        assert_eq!(row.hero_id, p.hero_id);
        assert_eq!(row.won, p.team == m.winning_team);
        assert_eq!(row.per_minute[0], p.kills.unwrap() / (m.duration_s as f64 / 60.0));
        assert_eq!(row.lobby_badge, None);
        assert_eq!(row.duration_s, m.duration_s);
    }

    #[test]
    fn ranked_rows_carry_the_match_badge() {
        let matches = parse_matches(FIXTURE).unwrap();
        let m = matches.iter().find(|m| m.match_id == 118340277).unwrap();
        let sample = Sample::from_matches(std::slice::from_ref(m)).unwrap();
        assert!(sample.rows.iter().all(|r| r.lobby_badge == Some(52)));
    }
}
