use serde::Deserialize;

const GAME_MODE_NORMAL: u32 = 1;
const MATCH_MODE_UNRANKED: u32 = 1;
const MATCH_MODE_RANKED: u32 = 4;
const MIN_DURATION_S: u32 = 600;
const OUTCOME_PENALIZED: u32 = 3;
/// Only this many of the newest list-eligible matches are graded in the background; older ones are graded when
/// their detail is opened.
pub const RECENT_MATCHES: usize = 30;

/// The fields of a `/v1/players/{id}/match-history` row that decide whether the match is worth a metadata fetch.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct HistoryRow {
    pub match_id: u64,
    #[serde(default)]
    pub start_time: Option<i64>,
    #[serde(default)]
    pub game_mode: Option<u32>,
    #[serde(default)]
    pub match_mode: Option<u32>,
    #[serde(default)]
    pub match_duration_s: Option<u32>,
    #[serde(default)]
    pub player_match_outcome: Option<u32>,
    #[serde(default)]
    pub abandoned_time_s: Option<u32>,
}

/// Rows that do not parse are dropped one by one; a body that is not a JSON array gives no rows.
pub fn parse_history(body: &[u8]) -> Vec<HistoryRow> {
    let Ok(rows) = serde_json::from_slice::<Vec<serde_json::Value>>(body) else { return Vec::new() };
    rows.into_iter().filter_map(|row| serde_json::from_value(row).ok()).collect()
}

/// Skips what the row alone rules out: other modes, short matches, and matches the user left (their own grade, the
/// one the list shows, would be missing). Outcome 5 (not scored) stays: the leaver's teammates get it, and they
/// are graded.
pub fn list_eligible(row: &HistoryRow) -> bool {
    row.game_mode == Some(GAME_MODE_NORMAL)
        && matches!(row.match_mode, Some(MATCH_MODE_UNRANKED | MATCH_MODE_RANKED))
        && row.match_duration_s.is_some_and(|d| d >= MIN_DURATION_S)
        && row.abandoned_time_s.unwrap_or(0) == 0
        && row.player_match_outcome != Some(OUTCOME_PENALIZED)
}

/// The newest [`RECENT_MATCHES`] list-eligible matches that `needs_grade` still wants, newest first.
pub fn to_grade(rows: &[HistoryRow], needs_grade: impl Fn(u64) -> bool) -> Vec<u64> {
    let mut eligible: Vec<&HistoryRow> = rows.iter().filter(|r| list_eligible(r)).collect();
    eligible.sort_by_key(|r| std::cmp::Reverse((r.start_time.unwrap_or(0), r.match_id)));
    eligible.into_iter().take(RECENT_MATCHES).map(|r| r.match_id).filter(|&id| needs_grade(id)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(match_id: u64, start_time: i64) -> HistoryRow {
        HistoryRow {
            match_id,
            start_time: Some(start_time),
            game_mode: Some(1),
            match_mode: Some(4),
            match_duration_s: Some(1500),
            player_match_outcome: Some(1),
            abandoned_time_s: Some(0),
        }
    }

    #[test]
    fn parses_the_api_row_and_drops_rows_without_an_id() {
        let body = br#"[
            {"account_id":405225629,"match_id":118339116,"hero_id":86,"start_time":1792194079,"game_mode":1,
             "match_mode":4,"team_abandoned":false,"abandoned_time_s":0,"match_duration_s":1439,
             "player_match_outcome":2,"ranked_display_badge":0},
            {"hero_id":3},
            {"match_id":7,"game_mode":null,"abandoned_time_s":null}
        ]"#;
        let rows = parse_history(body);
        assert_eq!(rows.len(), 2);
        assert_eq!(
            rows[0],
            HistoryRow {
                match_id: 118339116,
                start_time: Some(1792194079),
                game_mode: Some(1),
                match_mode: Some(4),
                match_duration_s: Some(1439),
                player_match_outcome: Some(2),
                abandoned_time_s: Some(0),
            }
        );
        assert_eq!(rows[1].game_mode, None);
        assert!(parse_history(b"{\"error\":\"rate limited\"}").is_empty());
        assert!(parse_history(b"not json").is_empty());
    }

    #[test]
    fn list_eligibility_keeps_normal_ranked_and_unranked_full_matches() {
        assert!(list_eligible(&row(1, 0)));
        assert!(list_eligible(&HistoryRow { match_mode: Some(1), player_match_outcome: Some(0), ..row(1, 0) }));
        assert!(list_eligible(&HistoryRow { match_duration_s: Some(600), ..row(1, 0) }));
        assert!(list_eligible(&HistoryRow { player_match_outcome: Some(4), ..row(1, 0) }));
        assert!(list_eligible(&HistoryRow { player_match_outcome: Some(5), ..row(1, 0) }));
        assert!(list_eligible(&HistoryRow { abandoned_time_s: None, ..row(1, 0) }));
    }

    #[test]
    fn list_eligibility_skips_what_the_row_rules_out() {
        let skipped = [
            HistoryRow { game_mode: Some(4), ..row(1, 0) },
            HistoryRow { game_mode: None, ..row(1, 0) },
            HistoryRow { match_mode: Some(2), ..row(1, 0) },
            HistoryRow { match_mode: Some(3), ..row(1, 0) },
            HistoryRow { match_duration_s: Some(599), ..row(1, 0) },
            HistoryRow { match_duration_s: None, ..row(1, 0) },
            HistoryRow { abandoned_time_s: Some(400), ..row(1, 0) },
            HistoryRow { player_match_outcome: Some(3), ..row(1, 0) },
        ];
        for r in skipped {
            assert!(!list_eligible(&r), "{r:?}");
        }
    }

    #[test]
    fn picks_the_newest_eligible_matches_that_still_need_a_grade() {
        let mut rows: Vec<HistoryRow> = (0..40).map(|i| row(100 + i, 1000 + i as i64)).collect();
        rows[39].game_mode = Some(4);
        rows.reverse();
        let picked = to_grade(&rows, |id| id != 137);
        assert_eq!(picked.len(), RECENT_MATCHES - 1);
        assert_eq!(picked[..3], [138, 136, 135]);
        assert_eq!(*picked.last().unwrap(), 109, "an already graded match still counts toward the recent window");
    }

    #[test]
    fn picking_sorts_by_start_time_whatever_the_row_order() {
        let rows = vec![row(1, 10), row(3, 30), row(2, 20)];
        assert_eq!(to_grade(&rows, |_| true), vec![3, 2, 1]);
        assert!(to_grade(&rows, |_| false).is_empty());
    }
}
