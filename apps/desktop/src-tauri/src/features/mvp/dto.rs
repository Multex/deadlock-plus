use serde::Serialize;
use ts_rs::TS;

use dp_mvp::LOBBY_TOTALS_VERSION;

use super::store::{gave_up, GradeRecord};

/// The letter as shown, `"S+"` … `"F"`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub enum MvpLetter {
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

/// One match's grade, for the match list and detail.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct MvpMatchGrade {
    pub match_id: u64,
    /// Someone abandoned or left early; every score in the match is skewed.
    pub leaver: bool,
    /// False for a grade from the game-captured detail: early leavers without an abandon flag were not caught.
    pub paths_checked: bool,
    pub provisional: bool,
    /// Graded players by lobby order. Players who left are absent.
    pub players: Vec<MvpPlayerGrade>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct MvpPlayerGrade {
    pub account_id: u32,
    pub player_slot: u32,
    pub hero_id: u32,
    pub team: u32,
    /// Shown with one decimal: `s10 / 10`.
    pub s10: u16,
    pub letter: MvpLetter,
    /// 1-based; equal totals share a place and the next one skips (1, 2, 2, 4).
    pub place: u32,
    pub total_points: f64,
    pub farm_bonus: f64,
    /// One line per stat, in `MvpMetric` order.
    pub stats: Vec<MvpStatLine>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum MvpMetric {
    EarlyDamage,
    LateDamage,
    EarlyAssists,
    LateAssists,
    PrebaseObjective,
    BaseObjective,
    DamageAbsorbed,
    AllyHealing,
    HealPrevented,
    Barriers,
    Cs,
    Kills,
    Deaths,
    Cc,
}

const METRICS: [MvpMetric; dp_mvp::METRIC_COUNT] = [
    MvpMetric::EarlyDamage,
    MvpMetric::LateDamage,
    MvpMetric::EarlyAssists,
    MvpMetric::LateAssists,
    MvpMetric::PrebaseObjective,
    MvpMetric::BaseObjective,
    MvpMetric::DamageAbsorbed,
    MvpMetric::AllyHealing,
    MvpMetric::HealPrevented,
    MvpMetric::Barriers,
    MvpMetric::Cs,
    MvpMetric::Kills,
    MvpMetric::Deaths,
    MvpMetric::Cc,
];

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct MvpStatLine {
    pub metric: MvpMetric,
    pub points: f64,
    /// Lobby rank of the points among graded players; equal points share a rank.
    pub rank: u32,
}

fn letter(l: dp_mvp::LobbyLetter) -> MvpLetter {
    use dp_mvp::LobbyLetter as L;
    match l {
        L::SPlus => MvpLetter::SPlus,
        L::S => MvpLetter::S,
        L::SMinus => MvpLetter::SMinus,
        L::APlus => MvpLetter::APlus,
        L::A => MvpLetter::A,
        L::AMinus => MvpLetter::AMinus,
        L::BPlus => MvpLetter::BPlus,
        L::B => MvpLetter::B,
        L::BMinus => MvpLetter::BMinus,
        L::CPlus => MvpLetter::CPlus,
        L::C => MvpLetter::C,
        L::CMinus => MvpLetter::CMinus,
        L::DPlus => MvpLetter::DPlus,
        L::D => MvpLetter::D,
        L::DMinus => MvpLetter::DMinus,
        L::EPlus => MvpLetter::EPlus,
        L::E => MvpLetter::E,
        L::EMinus => MvpLetter::EMinus,
        L::F => MvpLetter::F,
    }
}

/// `None` unless the record holds a grade made with the current totals and grade versions. A provisional grade shows,
/// flagged; a stale, given-up or ineligible match shows nothing.
pub fn from_record(record: &GradeRecord, current_grade_version: &str) -> Option<MvpMatchGrade> {
    if gave_up(Some(record))
        || record.totals_version != LOBBY_TOTALS_VERSION
        || record.grade_version != current_grade_version
    {
        return None;
    }
    let (totals, grade) = (record.totals.as_ref()?, record.grade.as_ref()?);
    let players = grade
        .players
        .iter()
        .filter_map(|p| {
            let score = p.score.as_ref()?;
            let stats = METRICS
                .iter()
                .zip(p.points.to_array().into_iter().zip(score.metric_ranks.to_array()))
                .map(|(&metric, (points, rank))| MvpStatLine { metric, points, rank })
                .collect();
            Some(MvpPlayerGrade {
                account_id: p.account_id,
                player_slot: p.player_slot,
                hero_id: p.hero_id,
                team: p.team,
                s10: (score.score * 10.0).round() as u16,
                letter: letter(score.letter),
                place: score.place,
                total_points: p.total_points,
                farm_bonus: p.farm_bonus,
                stats,
            })
        })
        .collect();
    Some(MvpMatchGrade {
        match_id: record.match_id,
        leaver: totals.leaver,
        paths_checked: totals.paths_checked,
        provisional: record.provisional,
        players,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::mvp::adapter::{grade_meta, grade_version, parse_lobby};
    use dp_gamedata::CcSet;
    use dp_mvp::grade_lobby;

    const LOBBY: &str = include_str!("../../../../../../crates/ring1/dp-mvp/fixtures/lobby-118862917.json");

    fn record() -> (GradeRecord, String) {
        let cc = CcSet::bundled();
        let meta = parse_lobby(LOBBY.as_bytes()).unwrap();
        let (totals, grade) = grade_meta(&meta, &cc).expect("eligible");
        let version = grade_version(&cc);
        let record = GradeRecord {
            match_id: meta.match_info.match_id,
            provisional: false,
            totals_version: LOBBY_TOTALS_VERSION,
            grade_version: version.clone(),
            totals: Some(totals),
            grade: Some(grade),
            failed_runs: 0,
        };
        (record, version)
    }

    #[test]
    fn a_fresh_record_shows_every_player_by_place() {
        let (record, version) = record();
        let view = from_record(&record, &version).expect("fresh grade shows");
        assert_eq!(view.match_id, record.match_id);
        assert_eq!(view.players.len(), 12);
        let mut places: Vec<u32> = view.players.iter().map(|p| p.place).collect();
        places.sort_unstable();
        assert_eq!(places, (1..=12).collect::<Vec<_>>());
        for (v, g) in view.players.iter().zip(&record.grade.as_ref().unwrap().players) {
            let score = g.score.as_ref().unwrap();
            assert_eq!((v.player_slot, v.hero_id, v.team), (g.player_slot, g.hero_id, g.team));
            assert_eq!(v.s10, (score.score * 10.0).round() as u16);
            assert_eq!(v.stats.len(), 14);
            assert_eq!(v.stats[0].metric, MvpMetric::EarlyDamage);
            assert_eq!(v.stats[13].metric, MvpMetric::Cc);
            assert_eq!(v.stats[10].points, g.points.cs);
            assert_eq!(v.stats[10].rank, score.metric_ranks.cs);
            assert_eq!((v.total_points, v.farm_bonus), (g.total_points, g.farm_bonus));
        }
    }

    #[test]
    fn letters_and_metrics_serialise_as_text() {
        let (record, version) = record();
        let view = serde_json::to_value(from_record(&record, &version).unwrap()).unwrap();
        for (v, g) in view["players"].as_array().unwrap().iter().zip(&record.grade.as_ref().unwrap().players) {
            assert_eq!(v["letter"], serde_json::to_value(g.score.as_ref().unwrap().letter).unwrap());
        }
        assert_eq!(view["players"][0]["stats"][0]["metric"], "early_damage");
        assert!(view["players"][0].get("playerSlot").is_some());
        assert!(view.get("builtAt").is_none());
    }

    #[test]
    fn every_letter_maps_to_the_same_text() {
        for tenths in 0..=1000 {
            let l = dp_mvp::letter_for_score(f64::from(tenths) / 10.0);
            assert_eq!(serde_json::to_value(letter(l)).unwrap(), serde_json::to_value(l).unwrap(), "{tenths}");
        }
    }

    #[test]
    fn a_leaver_is_absent() {
        let (mut record, version) = record();
        let mut totals = record.totals.take().unwrap();
        totals.leaver = true;
        totals.players[3].left = true;
        let slot = totals.players[3].player_slot;
        record.grade = Some(grade_lobby(&totals, &|n: &str| CcSet::bundled().contains(n)));
        record.totals = Some(totals);
        let view = from_record(&record, &version).unwrap();
        assert!(view.leaver);
        assert_eq!(view.players.len(), 11);
        assert!(view.players.iter().all(|p| p.player_slot != slot));
    }

    #[test]
    fn a_stale_or_unfinished_record_shows_nothing() {
        let (record, version) = record();
        assert_eq!(from_record(&record, "other"), None, "regrade");
        let refetch = GradeRecord { totals_version: LOBBY_TOTALS_VERSION + 1, ..record.clone() };
        assert_eq!(from_record(&refetch, &version), None);
        let old_provisional = GradeRecord { provisional: true, ..record.clone() };
        assert_eq!(from_record(&old_provisional, "other"), None);
        let gave_up = GradeRecord { failed_runs: 3, totals: None, grade: None, ..record };
        assert_eq!(from_record(&gave_up, &version), None);
    }

    #[test]
    fn a_provisional_record_with_current_versions_shows_flagged() {
        let (record, version) = record();
        let provisional = GradeRecord { provisional: true, ..record };
        let view = from_record(&provisional, &version).expect("provisional shows");
        assert!(view.provisional);
        assert_eq!(view.players.len(), 12);
    }

    #[test]
    fn an_ineligible_match_shows_nothing() {
        let (record, version) = record();
        let none = GradeRecord { totals: None, grade: None, ..record };
        assert_eq!(from_record(&none, &version), None);
    }
}
