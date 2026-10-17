use serde::{Deserialize, Serialize};

use crate::model::ModelCache;
use crate::skew::{apply, tier};
use crate::stat::{Percentiles, Totals};

const GAME_MODE_NORMAL: u32 = 1;
const MATCH_MODE_UNRANKED: u32 = 1;
const MATCH_MODE_RANKED: u32 = 4;
const MIN_DURATION_S: u32 = 600;
const FULL_MATCH_PLAYERS: usize = 12;
const OUTCOME_PENALIZED: u32 = 3;
/// A player whose path covers less of the match left early, even without an abandon flag.
const MIN_PATH_SHARE: f64 = 0.9;

/// The match fields grading needs, from the match metadata.
#[derive(Debug, Clone, PartialEq)]
pub struct MatchInput {
    pub match_id: u64,
    pub game_mode: u32,
    pub match_mode: u32,
    pub match_outcome: u32,
    pub not_scored: bool,
    pub low_pri_pool: bool,
    pub duration_s: u32,
    /// The lobby's rank badge (`tier · 10 + subtier`, e.g. 114), from [`crate::lobby_badge_from_ranks`]; `None`
    /// grades without the rank skew.
    pub lobby_badge: Option<u32>,
    pub players: Vec<PlayerInput>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PlayerInput {
    pub account_id: u32,
    pub player_slot: u32,
    pub hero_id: u32,
    pub abandon_match_time_s: u32,
    pub player_match_outcome: u32,
    pub kills: u32,
    pub deaths: u32,
    pub assists: u32,
    pub net_worth: u32,
    /// The player's last `stats` sample; `None` when the metadata has no samples.
    pub last_stats: Option<LastStats>,
    /// Number of `match_paths` samples; `None` for a game-captured detail, which has no paths.
    pub path_len: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct LastStats {
    pub player_damage: u32,
    pub boss_damage: u32,
    pub player_healing: u32,
    pub teammate_healing: u32,
    pub teammate_barriering: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
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

const LETTERS: [(u16, MvpLetter); 18] = [
    (966, MvpLetter::SPlus),
    (933, MvpLetter::S),
    (900, MvpLetter::SMinus),
    (850, MvpLetter::APlus),
    (800, MvpLetter::A),
    (750, MvpLetter::AMinus),
    (700, MvpLetter::BPlus),
    (650, MvpLetter::B),
    (575, MvpLetter::BMinus),
    (500, MvpLetter::CPlus),
    (450, MvpLetter::C),
    (400, MvpLetter::CMinus),
    (350, MvpLetter::DPlus),
    (300, MvpLetter::D),
    (250, MvpLetter::DMinus),
    (200, MvpLetter::EPlus),
    (150, MvpLetter::E),
    (100, MvpLetter::EMinus),
];

/// One match's stored grade. Never re-graded when the model refreshes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MatchGrade {
    pub match_id: u64,
    pub model_version: u32,
    pub built_at: i64,
    /// Someone abandoned or left early; every score in the match is skewed.
    pub leaver: bool,
    /// False when the detail had no paths, so early leavers without an abandon flag were not caught.
    pub paths_checked: bool,
    /// Graded players by place, ties by slot.
    pub players: Vec<PlayerGrade>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlayerGrade {
    pub account_id: u32,
    pub player_slot: u32,
    pub hero_id: u32,
    pub score: f64,
    /// `round(score · 10)`; shown as `s10 / 10` and the only value letters and places read.
    pub s10: u16,
    pub letter: MvpLetter,
    pub place: u8,
    /// Per-stat percentile vs the hero, before deaths are inverted; `None` for a skipped stat.
    pub percentiles: Percentiles,
}

pub fn letter_for(s10: u16) -> MvpLetter {
    LETTERS.iter().find(|(cut, _)| s10 >= *cut).map_or(MvpLetter::F, |(_, letter)| *letter)
}

pub fn match_eligible(m: &MatchInput) -> bool {
    m.game_mode == GAME_MODE_NORMAL
        && (m.match_mode == MATCH_MODE_UNRANKED || m.match_mode == MATCH_MODE_RANKED)
        && m.match_outcome == 0
        && !m.not_scored
        && !m.low_pri_pool
        && m.duration_s >= MIN_DURATION_S
        && m.players.len() == FULL_MATCH_PLAYERS
}

fn s10(score: f64) -> u16 {
    (score * 10.0).round() as u16
}

/// Competition ranking: `1 + #{larger s10}`.
fn places(s10s: &[u16]) -> Vec<u8> {
    s10s.iter().map(|s| 1 + s10s.iter().filter(|other| *other > s).count() as u8).collect()
}

fn left_early(p: &PlayerInput, duration_s: u32) -> bool {
    p.abandon_match_time_s != 0
        || p.player_match_outcome == OUTCOME_PENALIZED
        || p.path_len.is_some_and(|len| (len as f64) < MIN_PATH_SHARE * duration_s as f64)
}

fn totals(p: &PlayerInput, last: &LastStats) -> Totals {
    Totals {
        kills: p.kills.into(),
        deaths: p.deaths.into(),
        assists: p.assists.into(),
        net_worth: p.net_worth.into(),
        player_damage: last.player_damage.into(),
        boss_damage: last.boss_damage.into(),
        player_healing: last.player_healing.into(),
        teammate_healing: last.teammate_healing.into(),
        teammate_barriering: last.teammate_barriering.into(),
    }
}

impl ModelCache {
    pub fn player_eligible(&self, duration_s: u32, p: &PlayerInput) -> bool {
        !left_early(p, duration_s)
            && p.account_id != 0
            && p.last_stats.is_some()
            && self.heroes.get(&p.hero_id).is_some_and(|h| h.quantiles.iter().any(Option::is_some))
    }

    /// `None` when the match is not eligible. Percentiles are skewed by the lobby's tier when the badge is set
    /// and the sample had that tier.
    pub fn grade(&self, m: &MatchInput) -> Option<MatchGrade> {
        if !match_eligible(m) {
            return None;
        }
        let skew = m.lobby_badge.and_then(|b| self.rank_skew.get(&tier(b)));
        let mut graded: Vec<(&PlayerInput, f64, Percentiles)> = Vec::new();
        for p in m.players.iter().filter(|p| self.player_eligible(m.duration_s, p)) {
            let (Some(hero), Some(last)) = (self.heroes.get(&p.hero_id), &p.last_stats) else { continue };
            let mut percentiles =
                hero.percentiles(&totals(p, last).per_minute(m.duration_s), self.length_bucket(m.duration_s));
            if let Some(skew) = skew {
                apply(skew, &mut percentiles);
            }
            let Some(composite) = hero.composite(&percentiles) else { continue };
            graded.push((p, self.score(composite), percentiles));
        }
        let s10s: Vec<u16> = graded.iter().map(|(_, score, _)| s10(*score)).collect();
        let mut players: Vec<PlayerGrade> = graded
            .into_iter()
            .zip(&s10s)
            .zip(places(&s10s))
            .map(|(((p, score, percentiles), &s10), place)| PlayerGrade {
                account_id: p.account_id,
                player_slot: p.player_slot,
                hero_id: p.hero_id,
                score,
                s10,
                letter: letter_for(s10),
                place,
                percentiles,
            })
            .collect();
        players.sort_by_key(|p| (p.place, p.player_slot));
        Some(MatchGrade {
            match_id: m.match_id,
            model_version: self.model_version,
            built_at: self.built_at,
            leaver: m.players.iter().any(|p| left_early(p, m.duration_s)),
            paths_checked: m.players.iter().all(|p| p.path_len.is_some()),
            players,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;
    use crate::model::{AllHeroes, HeroModel, MODEL_VERSION};
    use crate::sample::SampleSummary;
    use crate::skew::TierSkew;
    use crate::stat::{STATS, STAT_COUNT};

    #[test]
    fn letters_follow_the_s10_cut_offs() {
        let cases = [
            (1000, MvpLetter::SPlus),
            (966, MvpLetter::SPlus),
            (965, MvpLetter::S),
            (933, MvpLetter::S),
            (932, MvpLetter::SMinus),
            (900, MvpLetter::SMinus),
            (899, MvpLetter::APlus),
            (650, MvpLetter::B),
            (649, MvpLetter::BMinus),
            (575, MvpLetter::BMinus),
            (574, MvpLetter::CPlus),
            (500, MvpLetter::CPlus),
            (499, MvpLetter::C),
            (100, MvpLetter::EMinus),
            (99, MvpLetter::F),
            (0, MvpLetter::F),
        ];
        for (s10, letter) in cases {
            assert_eq!(letter_for(s10), letter, "{s10}");
        }
    }

    #[test]
    fn letters_serialise_as_shown() {
        assert_eq!(serde_json::to_string(&MvpLetter::SPlus).unwrap(), "\"S+\"");
        assert_eq!(serde_json::to_string(&MvpLetter::EMinus).unwrap(), "\"E-\"");
        assert_eq!(serde_json::to_string(&MvpLetter::F).unwrap(), "\"F\"");
    }

    #[test]
    fn s10_rounds_the_score_to_tenths() {
        assert_eq!(s10(50.04), 500);
        assert_eq!(s10(50.06), 501);
        assert_eq!(s10(100.0), 1000);
        assert_eq!(s10(0.0), 0);
    }

    #[test]
    fn equal_s10_share_a_place_and_the_next_skips() {
        assert_eq!(places(&[900, 800, 800, 700]), vec![1, 2, 2, 4]);
        assert_eq!(places(&[700, 800, 900, 800]), vec![4, 2, 1, 2]);
    }

    fn player(slot: u32, kills: u32) -> PlayerInput {
        PlayerInput {
            account_id: 100 + slot,
            player_slot: slot,
            hero_id: 1,
            abandon_match_time_s: 0,
            player_match_outcome: 1,
            kills,
            deaths: 10,
            assists: 10,
            net_worth: 10,
            last_stats: Some(LastStats {
                player_damage: 10,
                boss_damage: 10,
                player_healing: 20,
                teammate_healing: 10,
                teammate_barriering: 0,
            }),
            path_len: Some(600),
        }
    }

    fn eligible_match() -> MatchInput {
        MatchInput {
            match_id: 42,
            game_mode: 1,
            match_mode: 4,
            match_outcome: 0,
            not_scored: false,
            low_pri_pool: false,
            duration_s: 600,
            lobby_badge: None,
            players: (0..12).map(|slot| player(slot, 10)).collect(),
        }
    }

    #[test]
    fn match_eligibility_is_a_whitelist() {
        assert!(match_eligible(&eligible_match()));
        assert!(match_eligible(&MatchInput { match_mode: 1, ..eligible_match() }));
        let ineligible = [
            MatchInput { game_mode: 4, ..eligible_match() },
            MatchInput { match_mode: 2, ..eligible_match() },
            MatchInput { match_mode: 3, ..eligible_match() },
            MatchInput { match_outcome: 1, ..eligible_match() },
            MatchInput { not_scored: true, ..eligible_match() },
            MatchInput { low_pri_pool: true, ..eligible_match() },
            MatchInput { duration_s: 599, ..eligible_match() },
        ];
        for m in ineligible {
            assert!(!match_eligible(&m), "{m:?}");
        }
        let mut short = eligible_match();
        short.players.pop();
        assert!(!match_eligible(&short));
    }

    /// Hero 1: every stat has knots [0, 2] per minute and equal weights; calibration knots are 0.0, 0.1 … 100.0,
    /// so a composite `c` on a knot scores exactly `c`.
    fn cache() -> ModelCache {
        let hero = HeroModel {
            n: 300,
            w: [0.125; STAT_COUNT],
            quantiles: std::array::from_fn(|_| Some(vec![0.0, 2.0])),
            length_quantiles: [None, None, Some(std::array::from_fn(|_| Some(vec![0.0, 4.0])))],
        };
        ModelCache {
            model_version: MODEL_VERSION,
            built_at: 1_700_000_000,
            sample: SampleSummary { rows: 0, matches: 0, min_match_id: 0, max_match_id: 0 },
            stats: STATS.to_vec(),
            all_heroes: AllHeroes { w: [0.125; STAT_COUNT] },
            heroes: BTreeMap::from([(1, hero)]),
            length_cuts: [1800, 2400],
            rank_skew: BTreeMap::from([(5, TierSkew { n: 2000, m: [60.0; STAT_COUNT] })]),
            calibration: (0..=1000).map(|k| k as f64 / 10.0).collect(),
        }
    }

    #[test]
    fn player_eligibility_checks_leavers_accounts_stats_heroes_and_paths() {
        let cache = cache();
        let base = PlayerInput { path_len: Some(1000), ..player(0, 10) };
        assert!(cache.player_eligible(1000, &base));
        assert!(cache.player_eligible(1000, &PlayerInput { path_len: Some(900), ..base.clone() }));
        assert!(cache.player_eligible(1000, &PlayerInput { path_len: None, ..base.clone() }));
        let ineligible = [
            PlayerInput { abandon_match_time_s: 500, ..base.clone() },
            PlayerInput { player_match_outcome: 3, ..base.clone() },
            PlayerInput { account_id: 0, ..base.clone() },
            PlayerInput { last_stats: None, ..base.clone() },
            PlayerInput { hero_id: 2, ..base.clone() },
            PlayerInput { path_len: Some(899), ..base.clone() },
        ];
        for p in ineligible {
            assert!(!cache.player_eligible(1000, &p), "{p:?}");
        }
    }

    #[test]
    fn grades_score_letter_and_place_from_the_tables() {
        // 10 minutes. Per minute: kills k/10, the rest 1 → p 50; self healing 1, support 1 → p 50.
        // kills 20 → p 100 → composite (100 + 7 · 50) / 8 = 56.25; kills 0 → 43.75; kills 10 → 50.
        let mut m = eligible_match();
        m.players[3].kills = 20;
        m.players[5].kills = 0;
        let grade = cache().grade(&m).unwrap();
        assert_eq!((grade.match_id, grade.model_version, grade.built_at), (42, MODEL_VERSION, 1_700_000_000));
        assert!(!grade.leaver && grade.paths_checked);
        assert_eq!(grade.players.len(), 12);
        let top = &grade.players[0];
        assert_eq!((top.player_slot, top.place, top.s10, top.letter), (3, 1, 562, MvpLetter::CPlus));
        assert_eq!(top.percentiles[0], Some(100.0));
        assert_eq!(top.percentiles[1], Some(50.0));
        let tied: Vec<_> = grade.players[1..11].iter().map(|p| (p.player_slot, p.place, p.s10)).collect();
        let expected: Vec<_> = [0, 1, 2, 4, 6, 7, 8, 9, 10, 11].iter().map(|&s| (s, 2, 500)).collect();
        assert_eq!(tied, expected);
        let last = &grade.players[11];
        assert_eq!((last.player_slot, last.place, last.s10, last.letter), (5, 12, 438, MvpLetter::CMinus));
    }

    #[test]
    fn leavers_are_not_graded_and_mark_the_match() {
        let mut m = eligible_match();
        m.players[0].abandon_match_time_s = 300;
        m.players[0].player_match_outcome = 3;
        m.players[1].path_len = Some(100);
        let grade = cache().grade(&m).unwrap();
        assert!(grade.leaver);
        assert_eq!(grade.players.len(), 10);
        assert!(grade.players.iter().all(|p| p.player_slot > 1 && p.place == 1));
    }

    #[test]
    fn a_detail_without_paths_is_graded_but_flagged() {
        let mut m = eligible_match();
        for p in &mut m.players {
            p.path_len = None;
        }
        let grade = cache().grade(&m).unwrap();
        assert!(!grade.paths_checked && !grade.leaver);
        assert_eq!(grade.players.len(), 12);
    }

    #[test]
    fn an_ineligible_match_has_no_grade() {
        assert_eq!(cache().grade(&MatchInput { game_mode: 4, ..eligible_match() }), None);
    }

    #[test]
    fn the_lobby_tier_skews_percentiles_before_the_composite() {
        // Tier 5 players sit at percentile 60 on average: every p drops by 10, deaths (raw 50 → 40) count as 60.
        // composite (7 · 40 + 60) / 8 = 42.5 → 425 knots below → score 42.46 → s10 425.
        let grade = cache().grade(&MatchInput { lobby_badge: Some(55), ..eligible_match() }).unwrap();
        let p = &grade.players[0];
        assert_eq!((p.s10, p.percentiles[0], p.percentiles[1]), (425, Some(40.0), Some(40.0)));
        assert!(grade.players.iter().all(|p| p.s10 == 425 && p.place == 1));
    }

    #[test]
    fn a_long_match_reads_the_long_bucket() {
        // 50 minutes, every stat 1 per minute: bucket 2 knots [0, 4] give p 25, deaths count as 75.
        // composite (7 · 25 + 75) / 8 = 31.25; 313 knots below, so s10 313.
        let mut m = MatchInput { duration_s: 3000, ..eligible_match() };
        for p in &mut m.players {
            *p = PlayerInput { kills: 50, deaths: 50, assists: 50, net_worth: 50, path_len: Some(3000), ..p.clone() };
            p.last_stats = Some(LastStats {
                player_damage: 50,
                boss_damage: 50,
                player_healing: 100,
                teammate_healing: 50,
                teammate_barriering: 0,
            });
        }
        let grade = cache().grade(&m).unwrap();
        assert!(grade.players.iter().all(|p| p.s10 == 313 && p.percentiles[0] == Some(25.0)));
    }

    #[test]
    fn no_badge_or_an_unknown_tier_grades_without_skew() {
        for badge in [None, Some(75), Some(0)] {
            let grade = cache().grade(&MatchInput { lobby_badge: badge, ..eligible_match() }).unwrap();
            assert!(grade.players.iter().all(|p| p.s10 == 500), "{badge:?}");
        }
    }

    #[test]
    fn grades_serialise_for_storage() {
        let grade = cache().grade(&eligible_match()).unwrap();
        let json = serde_json::to_value(&grade).unwrap();
        assert_eq!(json["players"][0]["letter"], "C+");
        assert_eq!(json["players"][0]["percentiles"].as_array().unwrap().len(), 8);
        assert_eq!(serde_json::from_value::<MatchGrade>(json).unwrap(), grade);
    }
}
