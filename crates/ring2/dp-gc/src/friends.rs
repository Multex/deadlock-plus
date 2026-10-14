use std::collections::HashMap;

use serde::Deserialize;

const HOUR: i64 = 60 * 60;
const DAY: i64 = 24 * HOUR;

// Bounds for a friend's typical gap between matches, and the fallback when the stored history
// is too short to tell.
const MIN_GAP: i64 = HOUR;
const MAX_GAP: i64 = 3 * DAY;
const DEFAULT_GAP: i64 = DAY;
const GAP_SAMPLE: usize = 20;
// A match takes a while to start and finish; being online only briefly after the last stored
// match does not mean another one was played.
const MIN_ACTIVITY_AFTER_LAST: i64 = 45 * 60;
// Without presence data, a friend who stopped playing long ago is not worth a lookup.
const MAX_CADENCE_ONLY_AGE: i64 = 14 * DAY;
// Being in Deadlock right now always ranks ahead of a cadence guess.
const IN_GAME_BOOST: u64 = 1 << 32;

/// What Steam's persona state says about a friend right now.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Persona {
    pub in_deadlock: bool,
    /// The last time the friend was seen online (now, if they are online), when Steam shares it.
    pub last_seen: Option<i64>,
}

/// One row of a player's match history as deadlock-api stores it, newest first.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct HistoryRow {
    pub match_id: u64,
    pub start_time: u32,
    #[serde(default)]
    pub match_duration_s: u32,
}

/// A friend deadlock-api has seen play recently, with what it has stored for them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActiveFriend {
    pub account_id: u32,
    pub latest_match_id: u64,
    /// End of their newest stored match.
    pub last_end: i64,
    /// Start times of their newest stored matches, newest first.
    pub starts: Vec<i64>,
}

impl ActiveFriend {
    /// `None` for an empty history.
    pub fn from_history(account_id: u32, rows: &[HistoryRow]) -> Option<Self> {
        let latest_match_id = rows.iter().map(|r| r.match_id).max()?;
        let last_end = rows.iter().map(|r| i64::from(r.start_time) + i64::from(r.match_duration_s)).max()?;
        let starts = rows.iter().take(GAP_SAMPLE).map(|r| i64::from(r.start_time)).collect();
        Some(Self { account_id, latest_match_id, last_end, starts })
    }
}

/// Median gap between consecutive matches in `starts_newest_first`, clamped.
fn typical_gap(starts_newest_first: &[i64]) -> i64 {
    let sample = &starts_newest_first[..starts_newest_first.len().min(GAP_SAMPLE)];
    let mut gaps: Vec<i64> = sample.windows(2).map(|w| (w[0] - w[1]).abs()).collect();
    if gaps.len() < 2 {
        return DEFAULT_GAP;
    }
    gaps.sort_unstable();
    gaps[gaps.len() / 2].clamp(MIN_GAP, MAX_GAP)
}

/// `Some(score)` when the friend likely played after `last_end`, the end of their newest stored
/// match. A higher score is more likely.
pub fn estimate(now: i64, last_end: i64, starts_newest_first: &[i64], persona: Option<Persona>) -> Option<u64> {
    let elapsed = now - last_end;
    if elapsed <= 0 {
        return None;
    }
    let gap = typical_gap(starts_newest_first);
    let score = u64::try_from(elapsed * 100 / gap).unwrap_or(0);

    match persona {
        Some(p) if p.in_deadlock => (elapsed > HOUR).then_some(score + IN_GAME_BOOST),
        Some(Persona { last_seen: Some(seen), .. }) => {
            (seen > last_end + MIN_ACTIVITY_AFTER_LAST && elapsed > gap).then_some(score)
        }
        _ => (elapsed > 2 * gap && elapsed < MAX_CADENCE_ONLY_AGE).then_some(score),
    }
}

/// Up to `budget` friends worth a history lookup, most likely first, each paired with the newest
/// match id deadlock-api has stored for them.
pub fn pick(now: i64, candidates: &[ActiveFriend], personas: &HashMap<u32, Persona>, budget: usize) -> Vec<(u32, u64)> {
    let mut scored: Vec<((u32, u64), u64)> = candidates
        .iter()
        .filter_map(|c| {
            let persona = personas.get(&c.account_id).copied();
            estimate(now, c.last_end, &c.starts, persona).map(|score| ((c.account_id, c.latest_match_id), score))
        })
        .collect();
    scored.sort_by_key(|&(_, score)| std::cmp::Reverse(score));
    scored.into_iter().take(budget).map(|(friend, _)| friend).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_000_000_000;

    // A friend playing about every 2h, newest match ending `ago` seconds before NOW.
    fn regular(ago: i64) -> (i64, Vec<i64>) {
        let last_start = NOW - ago - 1800;
        let starts = (0..10).map(|i| last_start - i * 2 * HOUR).collect();
        (NOW - ago, starts)
    }

    fn friend(account_id: u32, ago: i64) -> ActiveFriend {
        let (last_end, starts) = regular(ago);
        ActiveFriend { account_id, latest_match_id: u64::from(account_id) * 10, last_end, starts }
    }

    #[test]
    fn gap_is_median_and_clamped() {
        assert_eq!(typical_gap(&[]), DEFAULT_GAP);
        assert_eq!(typical_gap(&[10, 5]), DEFAULT_GAP);
        assert_eq!(typical_gap(&[3 * HOUR, 2 * HOUR, 0]), 2 * HOUR);
        assert_eq!(typical_gap(&[300, 200, 100]), MIN_GAP);
        assert_eq!(typical_gap(&[20 * DAY, 10 * DAY, 0]), MAX_GAP);
    }

    #[test]
    fn in_game_friend_is_stale_after_an_hour() {
        let p = Persona { in_deadlock: true, last_seen: Some(NOW) };
        let (end, starts) = regular(2 * HOUR);
        assert!(estimate(NOW, end, &starts, Some(p)).unwrap() > IN_GAME_BOOST);
        let (end, starts) = regular(30 * 60);
        assert_eq!(estimate(NOW, end, &starts, Some(p)), None);
    }

    #[test]
    fn seen_online_after_last_match_and_past_cadence() {
        let (end, starts) = regular(5 * HOUR);
        let seen = Persona { in_deadlock: false, last_seen: Some(end + 2 * HOUR) };
        assert!(estimate(NOW, end, &starts, Some(seen)).is_some());
        let gone = Persona { in_deadlock: false, last_seen: Some(end + 10 * 60) };
        assert_eq!(estimate(NOW, end, &starts, Some(gone)), None);
    }

    #[test]
    fn seen_online_but_within_cadence_is_not_stale() {
        let (end, starts) = regular(90 * 60);
        let p = Persona { in_deadlock: false, last_seen: Some(NOW) };
        assert_eq!(estimate(NOW, end, &starts, Some(p)), None);
    }

    #[test]
    fn cadence_only_fallback() {
        let (end, starts) = regular(5 * HOUR);
        assert!(estimate(NOW, end, &starts, None).is_some());
        assert!(estimate(NOW, end, &starts, Some(Persona::default())).is_some());
        let (end, starts) = regular(3 * HOUR);
        assert_eq!(estimate(NOW, end, &starts, None), None);
        let (end, starts) = regular(20 * DAY);
        assert_eq!(estimate(NOW, end, &starts, None), None);
    }

    #[test]
    fn future_last_match_is_never_stale() {
        let p = Persona { in_deadlock: true, last_seen: Some(NOW) };
        assert_eq!(estimate(NOW, NOW + 10, &[], Some(p)), None);
    }

    #[test]
    fn pick_orders_by_score_and_truncates() {
        let candidates = [friend(1, 5 * HOUR), friend(2, 10 * HOUR), friend(3, 3 * HOUR), friend(4, 7 * HOUR)];
        let personas = HashMap::from([(3, Persona { in_deadlock: true, last_seen: Some(NOW) })]);
        assert_eq!(pick(NOW, &candidates, &personas, 3), vec![(3, 30), (2, 20), (4, 40)]);
        assert!(pick(NOW, &candidates, &personas, 0).is_empty());
    }

    #[test]
    fn active_friend_reads_the_stored_history() {
        let rows = [
            HistoryRow { match_id: 30, start_time: 5_000, match_duration_s: 1_800 },
            HistoryRow { match_id: 20, start_time: 1_000, match_duration_s: 2_000 },
        ];
        let f = ActiveFriend::from_history(9, &rows).unwrap();
        assert_eq!(f, ActiveFriend { account_id: 9, latest_match_id: 30, last_end: 6_800, starts: vec![5_000, 1_000] });
        assert!(ActiveFriend::from_history(9, &[]).is_none());
    }

    #[test]
    fn history_rows_parse_without_a_duration() {
        let rows: Vec<HistoryRow> = serde_json::from_str(r#"[{"match_id":1,"start_time":2,"extra":true}]"#).unwrap();
        assert_eq!(rows[0].match_duration_s, 0);
    }
}
