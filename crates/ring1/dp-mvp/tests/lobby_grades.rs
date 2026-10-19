use std::collections::BTreeSet;

use dp_mvp::{
    competition_ranks, grade_lobby, letter_for_score, lobby_totals, score_from_z, LobbyGrade, LobbyLetter,
    LobbyMetadata, Metrics, LOBBY_GRADE_VERSION,
};
use serde_json::Value;

const FIXTURES: [(&str, &str, &str); 3] = [
    (
        "118862917",
        include_str!("../fixtures/lobby-118862917.json"),
        include_str!("../fixtures/lobby-118862917.expected.json"),
    ),
    (
        "119006587",
        include_str!("../fixtures/lobby-119006587.json"),
        include_str!("../fixtures/lobby-119006587.expected.json"),
    ),
    (
        "118807747",
        include_str!("../fixtures/lobby-118807747.json"),
        include_str!("../fixtures/lobby-118807747.expected.json"),
    ),
];

const LEAVER_META: &str = include_str!("../fixtures/lobby-118862917.json");
const LEAVER_EXPECTED: &str = include_str!("../fixtures/lobby-118862917.leaver.expected.json");
const LEAVER_SLOT: u64 = 12;

/// Every CC source name any golden credits damage to; the goldens were made with the hard-CC set.
fn golden_cc_names() -> BTreeSet<String> {
    FIXTURES
        .iter()
        .flat_map(|f| {
            let v: Value = serde_json::from_str(f.2).unwrap();
            v["players"]
                .as_array()
                .unwrap()
                .iter()
                .flat_map(|p| p["totals"]["cc_by_ability"].as_object().unwrap().keys().cloned().collect::<Vec<_>>())
                .collect::<Vec<_>>()
        })
        .collect()
}

fn grade(meta: &str) -> LobbyGrade {
    let names = golden_cc_names();
    let totals = lobby_totals(&LobbyMetadata::from_slice(meta.as_bytes()).unwrap().match_info);
    grade_lobby(&totals, &|n: &str| names.contains(n))
}

fn close(label: &str, got: f64, want: f64) {
    let tol = 1e-9 * want.abs().max(1.0);
    assert!((got - want).abs() <= tol, "{label}: got {got}, want {want}");
}

const METRIC_NAMES: [&str; 14] = [
    "early_damage",
    "late_damage",
    "early_assists",
    "late_assists",
    "prebase_objective",
    "base_objective",
    "damage_absorbed",
    "ally_healing",
    "heal_prevented",
    "barriers",
    "cs",
    "kills",
    "deaths",
    "cc",
];

#[test]
fn every_player_matches_the_goldens() {
    for (id, meta, expected) in FIXTURES {
        let want: Value = serde_json::from_str(expected).unwrap();
        let got = grade(meta);
        assert_eq!(got.version, LOBBY_GRADE_VERSION);
        let want_players = want["players"].as_array().unwrap();
        assert_eq!(got.players.len(), want_players.len(), "{id} player count");
        for w in want_players {
            let slot = w["player_slot"].as_u64().unwrap() as u32;
            let g = got.players.iter().find(|p| p.player_slot == slot).unwrap_or_else(|| panic!("{id} slot {slot}"));
            let at = |k: &str| format!("{id} slot {slot} {k}");
            for (name, got_pts) in METRIC_NAMES.iter().zip(g.points.to_array()) {
                close(&at(name), got_pts, w["points"][name].as_f64().unwrap());
            }
            close(&at("points_sum"), g.points_sum, w["points_sum"].as_f64().unwrap());
            close(&at("farm_dependency"), g.farm_dependency, w["farm_dependency"].as_f64().unwrap());
            close(&at("farm_bonus"), g.farm_bonus, w["farm_bonus"].as_f64().unwrap());
            close(&at("total"), g.total_points, w["total"].as_f64().unwrap());
            let s = g.score.as_ref().expect("graded");
            close(&at("z"), s.z, w["z"].as_f64().unwrap());
            close(&at("score"), s.score, w["score"].as_f64().unwrap());
            assert_eq!(s.letter.as_str(), w["letter"].as_str().unwrap(), "{}", at("letter"));
            assert_eq!(s.place as u64, w["place"].as_u64().unwrap(), "{}", at("place"));
            for (name, got_rank) in METRIC_NAMES.iter().zip(s.metric_ranks.to_array()) {
                assert_eq!(got_rank as u64, w["metric_rank"][name].as_u64().unwrap(), "{}", at(name));
            }
        }
    }
}

#[test]
fn a_leaver_is_not_graded_and_the_rest_are_z_scored_over_eleven() {
    let mut meta: Value = serde_json::from_str(LEAVER_META).unwrap();
    for p in meta["match_info"]["players"].as_array_mut().unwrap() {
        if p["player_slot"].as_u64() == Some(LEAVER_SLOT) {
            p["abandon_match_time_s"] = 1000.into();
        }
    }
    let got = grade(&meta.to_string());
    let want: Value = serde_json::from_str(LEAVER_EXPECTED).unwrap();
    let want_players = want["players"].as_array().unwrap();
    assert_eq!(got.players.iter().filter(|p| p.score.is_some()).count(), 11);

    for w in want_players {
        let slot = w["player_slot"].as_u64().unwrap() as u32;
        let g = got.players.iter().find(|p| p.player_slot == slot).unwrap();
        let at = |k: &str| format!("leaver case slot {slot} {k}");
        if w["left"].as_bool().unwrap() {
            assert!(g.left && g.score.is_none(), "{}", at("left"));
            continue;
        }
        close(&at("total"), g.total_points, w["total"].as_f64().unwrap());
        let s = g.score.as_ref().expect("graded");
        close(&at("score"), s.score, w["score"].as_f64().unwrap());
        assert_eq!(s.letter.as_str(), w["letter"].as_str().unwrap(), "{}", at("letter"));
        assert_eq!(s.place as u64, w["place"].as_u64().unwrap(), "{}", at("place"));
        for (name, got_rank) in METRIC_NAMES.iter().zip(s.metric_ranks.to_array()) {
            assert_eq!(got_rank as u64, w["metric_rank"][name].as_u64().unwrap(), "{}", at(name));
        }
    }
}

#[test]
fn a_leaver_still_sets_the_team_farm_maximum() {
    let mut meta: Value = serde_json::from_str(LEAVER_META).unwrap();
    let players = meta["match_info"]["players"].as_array_mut().unwrap();
    let leaver_team = players.iter().find(|p| p["player_slot"].as_u64() == Some(LEAVER_SLOT)).unwrap()["team"].clone();
    for p in players.iter_mut() {
        if p["player_slot"].as_u64() == Some(LEAVER_SLOT) {
            p["abandon_match_time_s"] = 1000.into();
        }
    }
    let with_leaver = grade(&meta.to_string());
    let baseline = grade(LEAVER_META);
    let mate = baseline
        .players
        .iter()
        .find(|p| p.team as u64 == leaver_team.as_u64().unwrap() && p.player_slot as u64 != LEAVER_SLOT)
        .unwrap();
    let same = with_leaver.players.iter().find(|p| p.player_slot == mate.player_slot).unwrap();
    close("farm_dependency", same.farm_dependency, mate.farm_dependency);
}

#[test]
fn an_all_leaver_lobby_grades_nobody() {
    let mut meta: Value = serde_json::from_str(LEAVER_META).unwrap();
    for p in meta["match_info"]["players"].as_array_mut().unwrap() {
        p["abandon_match_time_s"] = 1000.into();
    }
    assert!(grade(&meta.to_string()).players.iter().all(|p| p.score.is_none()));
}

#[test]
fn a_metric_nobody_scored_in_ranks_everyone_first() {
    let totals = lobby_totals(&LobbyMetadata::from_slice(LEAVER_META.as_bytes()).unwrap().match_info);
    let g = grade_lobby(&totals, &|_: &str| false);
    for p in &g.players {
        assert_eq!(p.points.cc, 0.0);
        assert_eq!(p.score.as_ref().unwrap().metric_ranks.cc, 1);
    }
}

#[test]
fn competition_ranking_shares_a_rank_and_skips_the_next() {
    assert_eq!(competition_ranks(&[5.0, 9.0, 5.0, 1.0]), vec![2, 1, 2, 4]);
    assert_eq!(competition_ranks(&[0.0, 0.0, 0.0]), vec![1, 1, 1]);
}

#[test]
fn the_score_clamps_to_zero_and_one_hundred() {
    assert_eq!(score_from_z(-10.0), 0.0);
    assert_eq!(score_from_z(10.0), 100.0);
    close("centre", score_from_z(0.0), 55.0);
    close("slope", score_from_z(1.0), 75.0);
}

#[test]
fn letters_switch_at_the_band_edges() {
    let edges = [
        (96.6, LobbyLetter::SPlus),
        (93.3, LobbyLetter::S),
        (90.0, LobbyLetter::SMinus),
        (85.0, LobbyLetter::APlus),
        (80.0, LobbyLetter::A),
        (75.0, LobbyLetter::AMinus),
        (70.0, LobbyLetter::BPlus),
        (65.0, LobbyLetter::B),
        (57.5, LobbyLetter::BMinus),
        (50.0, LobbyLetter::CPlus),
        (45.0, LobbyLetter::C),
        (40.0, LobbyLetter::CMinus),
        (35.0, LobbyLetter::DPlus),
        (30.0, LobbyLetter::D),
        (25.0, LobbyLetter::DMinus),
        (20.0, LobbyLetter::EPlus),
        (15.0, LobbyLetter::E),
        (10.0, LobbyLetter::EMinus),
    ];
    let below = [
        LobbyLetter::S,
        LobbyLetter::SMinus,
        LobbyLetter::APlus,
        LobbyLetter::A,
        LobbyLetter::AMinus,
        LobbyLetter::BPlus,
        LobbyLetter::B,
        LobbyLetter::BMinus,
        LobbyLetter::CPlus,
        LobbyLetter::C,
        LobbyLetter::CMinus,
        LobbyLetter::DPlus,
        LobbyLetter::D,
        LobbyLetter::DMinus,
        LobbyLetter::EPlus,
        LobbyLetter::E,
        LobbyLetter::EMinus,
        LobbyLetter::F,
    ];
    for ((score, letter), under) in edges.iter().zip(below) {
        assert_eq!(letter_for_score(*score), *letter, "{score}");
        assert_eq!(letter_for_score(score - 0.06), under, "{score} - 0.06");
    }
    assert_eq!(letter_for_score(100.0), LobbyLetter::SPlus);
    assert_eq!(letter_for_score(0.0), LobbyLetter::F);
}

#[test]
fn metrics_round_trip_through_serde_with_named_fields() {
    let g = grade(LEAVER_META);
    let json = serde_json::to_value(&g).unwrap();
    assert!(json["players"][0]["points"]["early_damage"].is_number());
    assert!(json["players"][0]["score"]["letter"].is_string());
    let back: LobbyGrade = serde_json::from_value(json).unwrap();
    assert_eq!(back, g);
    let _: Metrics<u32> = back.players[0].score.as_ref().unwrap().metric_ranks;
}

#[test]
fn a_leaver_who_out_farmed_the_team_is_the_farm_maximum() {
    let mut totals = lobby_totals(&LobbyMetadata::from_slice(LEAVER_META.as_bytes()).unwrap().match_info);
    let leaver = totals.players.iter().position(|p| p.team == 0).unwrap();
    let mate = totals.players.iter().position(|p| p.team == 0 && p != &totals.players[leaver]).unwrap();
    let top = totals.players.iter().filter(|p| p.team == 0).map(|p| p.farm_souls).fold(0.0, f64::max);
    totals.players[leaver].farm_souls = top * 2.0;
    totals.players[leaver].left = true;
    let mate_farm = totals.players[mate].farm_souls;
    let g = grade_lobby(&totals, &|_: &str| false);
    close("farm_dependency", g.players[mate].farm_dependency, 1.0 - mate_farm / (top * 2.0));
    assert!(g.players[leaver].score.is_none());
}
