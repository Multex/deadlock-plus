use std::collections::BTreeSet;

use dp_mvp::{
    cc_damage_by_source, early_cut_s, grade_lobby, kill_time_share_by_slot, left_early, lobby_eligible, lobby_totals,
    prebase_cut_s_by_team, LobbyMatchInfo, LobbyMetadata, LobbyTotals, PlayerTotals, LOBBY_TOTALS_VERSION,
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

fn fixture(id: &str) -> (LobbyMetadata, Value) {
    let (_, meta, expected) = FIXTURES.iter().find(|f| f.0 == id).unwrap();
    (LobbyMetadata::from_slice(meta.as_bytes()).unwrap(), serde_json::from_str(expected).unwrap())
}

/// Every CC source name any golden credits damage to; the goldens were made with the hard-CC set, so a
/// source outside it never shows up there.
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

fn close(label: &str, got: f64, want: f64) {
    let tol = 1e-9 * want.abs().max(1.0);
    assert!((got - want).abs() <= tol, "{label}: got {got}, want {want}");
}

fn check_player(id: &str, got: &PlayerTotals, want: &Value, names: &BTreeSet<String>) {
    let t = &want["totals"];
    let f = |k: &str| t[k].as_f64().unwrap();
    let at = |k: &str| format!("{id} slot {} {k}", got.player_slot);
    let pairs = [
        ("early_damage", got.early_damage),
        ("late_damage", got.late_damage),
        ("early_assists", got.early_assists),
        ("late_assists", got.late_assists),
        ("prebase_objective", got.prebase_objective),
        ("base_objective", got.base_objective),
        ("damage_absorbed", got.damage_absorbed),
        ("ally_healing", got.ally_healing),
        ("heal_prevented", got.heal_prevented),
        ("barriers", got.barriers),
        ("cs", got.cs),
        ("kills", got.kills),
        ("kill_time_share", got.kill_time_share),
        ("deaths", got.deaths),
        ("dead_s", got.dead_s),
        ("farm_souls", got.farm_souls),
    ];
    for (key, value) in pairs {
        close(&at(key), value, f(key));
    }
    assert_eq!(got.left, want["left"].as_bool().unwrap(), "{}", at("left"));
    assert_eq!(got.account_id as u64, want["account_id"].as_u64().unwrap(), "{}", at("account_id"));
    assert_eq!(got.hero_id as u64, want["hero_id"].as_u64().unwrap(), "{}", at("hero_id"));
    assert_eq!(got.team as u64, want["team"].as_u64().unwrap(), "{}", at("team"));

    let hard: Vec<(&String, f64)> =
        got.cc_by_source.iter().filter(|(k, _)| names.contains(*k)).map(|(k, v)| (k, *v)).collect();
    let expected = t["cc_by_ability"].as_object().unwrap();
    assert_eq!(hard.len(), expected.len(), "{}", at("cc source count"));
    for (name, damage) in &hard {
        close(&at(name), *damage, expected[*name].as_f64().unwrap());
    }
    close(&at("cc_damage"), hard.iter().map(|(_, v)| v).sum(), f("cc_damage"));
}

fn totals_for(id: &str) -> (LobbyTotals, Value) {
    let (meta, expected) = fixture(id);
    (lobby_totals(&meta.match_info), expected)
}

#[test]
fn every_player_total_matches_the_oracle() {
    let names = golden_cc_names();
    assert!(!names.is_empty());
    let mut checked = 0;
    for (id, ..) in FIXTURES {
        let (totals, expected) = totals_for(id);
        let want = expected["players"].as_array().unwrap();
        assert_eq!(totals.players.len(), want.len(), "{id}");
        for w in want {
            let slot = w["player_slot"].as_u64().unwrap() as u32;
            let got = totals.players.iter().find(|p| p.player_slot == slot).unwrap();
            check_player(id, got, w, &names);
            checked += 1;
        }
    }
    assert_eq!(checked, 36);
}

#[test]
fn cuts_and_flags_match_the_oracle() {
    for (id, ..) in FIXTURES {
        let (totals, expected) = totals_for(id);
        close(&format!("{id} early cut"), totals.early_cut_s, expected["early_cut_s"].as_f64().unwrap());
        for team in 0..2 {
            close(
                &format!("{id} pre-base cut team {team}"),
                totals.prebase_cut_s[team],
                expected["prebase_cut_s"][team.to_string()].as_f64().unwrap(),
            );
        }
        assert_eq!(totals.leaver, expected["leaver"].as_bool().unwrap(), "{id} leaver");
        assert_eq!(totals.paths_checked, expected["paths_checked"].as_bool().unwrap(), "{id} paths_checked");
    }
}

#[test]
fn the_two_teams_cut_the_pre_base_phase_at_their_own_first_enemy_barracks() {
    let (meta, _) = fixture("118807747");
    let cut = prebase_cut_s_by_team(&meta.match_info);
    assert_eq!(cut, [1766.0, 1495.0]);
    let (totals, _) = totals_for("118807747");
    let late_pushers = totals.players.iter().filter(|p| p.team == 0);
    for p in late_pushers {
        let raw = &meta.match_info.players.iter().find(|r| r.player_slot == p.player_slot).unwrap().stats;
        let at_cut = raw.iter().rfind(|s| s.time_stamp_s <= 1766.0).unwrap();
        let final_boss = raw.last().unwrap().boss_damage;
        assert_eq!(p.prebase_objective, at_cut.boss_damage);
        assert_eq!(p.base_objective, final_boss - at_cut.boss_damage);
    }
}

#[test]
fn a_team_that_destroyed_no_barracks_is_all_pre_base() {
    let (meta, _) = fixture("118807747");
    let mut info = meta.match_info;
    info.objectives.retain(|o| !(12..=15).contains(&o.team_objective_id));
    assert_eq!(prebase_cut_s_by_team(&info), [info.duration_s as f64; 2]);
    let totals = lobby_totals(&info);
    assert!(totals.players.iter().all(|p| p.base_objective == 0.0));
}

#[test]
fn the_early_cut_is_two_thirds_of_a_short_match_and_capped_at_twenty_minutes() {
    assert_eq!(early_cut_s(1083), 722.0);
    assert_eq!(early_cut_s(1800), 1200.0);
    assert_eq!(early_cut_s(2640), 1200.0);
    assert_eq!(early_cut_s(1350), 900.0);
}

#[test]
fn the_early_cut_on_the_eighteen_minute_match_picks_the_720_second_sample() {
    let (meta, _) = fixture("119006587");
    let (totals, _) = totals_for("119006587");
    for p in &totals.players {
        let raw = &meta.match_info.players.iter().find(|r| r.player_slot == p.player_slot).unwrap().stats;
        let early = raw.iter().rfind(|s| s.time_stamp_s <= 722.0).unwrap();
        assert_eq!(early.time_stamp_s, 720.0);
        assert_eq!(p.early_damage, early.player_damage);
        assert_eq!(p.early_assists, early.assists);
        assert_eq!(p.late_damage, raw.last().unwrap().player_damage - early.player_damage);
    }
}

#[test]
fn kills_are_credited_from_the_victims_and_weighted_by_when_they_happened() {
    let body = r#"{"match_info":{"match_id":1,"duration_s":1000,"players":[
        {"player_slot":1,"team":0,"kills":2,"death_details":[{"game_time_s":100,"killer_player_slot":2,"death_duration_s":5}]},
        {"player_slot":2,"team":1,"kills":1,"death_details":[
            {"game_time_s":300,"killer_player_slot":1,"death_duration_s":10},
            {"game_time_s":900,"killer_player_slot":1,"death_duration_s":20},
            {"game_time_s":950,"death_duration_s":30}]}]}}"#;
    let info = LobbyMetadata::from_slice(body.as_bytes()).unwrap().match_info;
    let shares = kill_time_share_by_slot(&info);
    close("slot 1", shares[&1], 1.2);
    close("slot 2", shares[&2], 0.1);
    assert!(!shares.contains_key(&0), "a killer that is not a player earns nothing");
    let totals = lobby_totals(&info);
    let p1 = &totals.players[0];
    assert_eq!((p1.kills, p1.deaths, p1.dead_s), (2.0, 0.0, 5.0));
    close("p1 share", p1.kill_time_share, 1.2);
    close("p2 dead_s", totals.players[1].dead_s, 60.0);
}

#[test]
fn a_key_missing_from_a_sample_is_zero() {
    let body = r#"{"match_info":{"duration_s":1500,"players":[
        {"player_slot":1,"team":0,"stats":[
            {"time_stamp_s":180},
            {"time_stamp_s":900,"player_damage":500,"gold_sources":[{"source":12,"gold":40},{"source":2,"gold":99},{"source":5}]},
            {"time_stamp_s":1500,"player_damage":800,"creep_kills":null,"gold_lane_creep":100,"gold_sources":[{"source":12,"gold":70,"kills":null},{"source":2,"gold":99}]}]},
        {"player_slot":2,"team":1}]}}"#;
    let info = LobbyMetadata::from_slice(body.as_bytes()).unwrap().match_info;
    let totals = lobby_totals(&info);
    let p = &totals.players[0];
    assert_eq!((p.early_damage, p.late_damage), (500.0, 300.0));
    assert_eq!(
        (p.early_assists, p.late_assists, p.cs, p.damage_absorbed, p.ally_healing, p.barriers),
        (0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    );
    assert_eq!((p.prebase_objective, p.base_objective, p.kills, p.deaths), (0.0, 0.0, 0.0, 0.0));
    assert_eq!(p.farm_souls, 170.0);
    let bare = &totals.players[1];
    assert_eq!((bare.early_damage, bare.farm_souls, bare.dead_s), (0.0, 0.0, 0.0));
}

#[test]
fn absorbed_is_damage_taken_plus_mitigated_plus_absorbed() {
    let body = r#"{"match_info":{"duration_s":900,"players":[
        {"player_slot":1,"stats":[{"time_stamp_s":900,"player_damage_taken":1000,"damage_mitigated":200,"damage_absorbed":30}]}]}}"#;
    let info = LobbyMetadata::from_slice(body.as_bytes()).unwrap().match_info;
    assert_eq!(lobby_totals(&info).players[0].damage_absorbed, 1230.0);
}

#[test]
fn cc_input_is_enemy_hero_damage_per_source_from_damage_rows_only() {
    let body = r#"{"match_info":{"duration_s":900,"players":[
        {"player_slot":1,"team":0},{"player_slot":2,"team":0},{"player_slot":7,"team":1}],
      "damage_matrix":{"source_details":{
          "source_name":["ability_a","ability_a","Bullet","ability_b","Ability"],"stat_type":[0,1,0,0,0]},
        "damage_dealers":[{"dealer_player_slot":1,"damage_sources":[
          {"source_details_index":0,"damage_to_players":[
            {"target_player_slot":7,"damage":[10,50]},{"target_player_slot":2,"damage":[999]},
            {"target_player_slot":0,"damage":[777]},{"target_player_slot":7}]},
          {"source_details_index":1,"damage_to_players":[{"target_player_slot":7,"damage":[5000]}]},
          {"source_details_index":2,"damage_to_players":[{"target_player_slot":7,"damage":[1234]}]},
          {"source_details_index":3,"damage_to_players":[{"target_player_slot":7,"damage":[4,8]}]},
          {"source_details_index":4,"damage_to_players":[{"target_player_slot":7,"damage":[4321]}]}]}]}}}"#;
    let info = LobbyMetadata::from_slice(body.as_bytes()).unwrap().match_info;
    let cc = cc_damage_by_source(&info);
    let slot1 = &cc[&1];
    assert_eq!(slot1.len(), 2, "{slot1:?}");
    assert_eq!((slot1["ability_a"], slot1["ability_b"]), (50.0, 8.0));
    assert!(!cc.contains_key(&2));
    assert_eq!(lobby_totals(&info).players[0].cc_by_source, *slot1);
}

fn left_check(patch: impl FnOnce(&mut LobbyMetadata)) -> LobbyTotals {
    let (mut meta, _) = fixture("119006587");
    patch(&mut meta);
    lobby_totals(&meta.match_info)
}

#[test]
fn the_fixture_with_paths_has_no_leaver_and_checked_paths() {
    let (meta, _) = fixture("119006587");
    let info = &meta.match_info;
    assert!(info.players.iter().all(|p| !left_early(info, p)));
    let totals = lobby_totals(info);
    assert!(!totals.leaver && totals.paths_checked);
}

#[test]
fn an_abandon_flag_a_penalised_outcome_or_a_short_path_marks_a_leaver() {
    let flagged = left_check(|m| m.match_info.players[0].abandon_match_time_s = 300);
    assert!(flagged.leaver && flagged.players[0].left && flagged.players.iter().skip(1).all(|p| !p.left));

    let penalised = left_check(|m| m.match_info.players[3].player_match_outcome = 3);
    assert!(penalised.leaver && penalised.players[3].left);

    let short = left_check(|m| {
        let slot = m.match_info.players[5].player_slot;
        let paths = m.match_info.match_paths.as_mut().unwrap().paths.as_mut().unwrap();
        let path = paths.iter_mut().find(|p| p.player_slot == slot).unwrap();
        let keep = (0.9 * m.match_info.duration_s as f64) as usize - 2;
        path.x_pos.as_mut().unwrap().truncate(keep);
    });
    assert!(short.leaver && short.players[5].left);
}

#[test]
fn a_path_at_ninety_percent_of_the_match_is_not_a_leaver() {
    let totals = left_check(|m| {
        let slot = m.match_info.players[5].player_slot;
        let need = (0.9 * m.match_info.duration_s as f64).ceil() as usize;
        let paths = m.match_info.match_paths.as_mut().unwrap().paths.as_mut().unwrap();
        let path = paths.iter_mut().find(|p| p.player_slot == slot).unwrap();
        path.x_pos.as_mut().unwrap().truncate(need);
    });
    assert!(!totals.leaver);
}

#[test]
fn without_paths_only_the_flags_count_and_paths_are_unchecked() {
    let totals = left_check(|m| m.match_info.match_paths = None);
    assert!(!totals.leaver && !totals.paths_checked);
    let emptied = left_check(|m| m.match_info.match_paths.as_mut().unwrap().paths = Some(vec![]));
    assert!(!emptied.leaver && !emptied.paths_checked);
    let flagged = left_check(|m| {
        m.match_info.match_paths = None;
        m.match_info.players[0].abandon_match_time_s = 10;
    });
    assert!(flagged.leaver);
}

#[test]
fn a_path_interval_scales_the_path_length() {
    let body = r#"{"match_info":{"duration_s":1000,"players":[{"player_slot":1},{"player_slot":2}],
        "match_paths":{"interval_s":2,"paths":[{"player_slot":1,"x_pos":[1,2,3]},{"player_slot":2,"x_pos":[]}]}}}"#;
    let info = LobbyMetadata::from_slice(body.as_bytes()).unwrap().match_info;
    assert!(left_early(&info, &info.players[0]));
    let none = r#"{"match_info":{"duration_s":10,"players":[{"player_slot":1},{"player_slot":2}],
        "match_paths":{"interval_s":2,"paths":[{"player_slot":1,"x_pos":[1,2,3,4,5]}]}}}"#;
    let info = LobbyMetadata::from_slice(none.as_bytes()).unwrap().match_info;
    assert!(!left_early(&info, &info.players[0]));
    assert!(!left_early(&info, &info.players[1]), "a slot without a path is unknown, not a leaver");
}

fn info(id: &str) -> LobbyMatchInfo {
    fixture(id).0.match_info
}

#[test]
fn the_fixtures_are_eligible() {
    for (id, _, _) in FIXTURES {
        assert!(lobby_eligible(&info(id)), "{id}");
    }
}

#[test]
fn eligibility_flips_on_each_condition() {
    let base = info("118862917");
    assert!(lobby_eligible(&LobbyMatchInfo { match_mode: 4, ..base.clone() }));
    let flips: Vec<(&str, LobbyMatchInfo)> = vec![
        ("game_mode", LobbyMatchInfo { game_mode: 4, ..base.clone() }),
        ("match_mode 2", LobbyMatchInfo { match_mode: 2, ..base.clone() }),
        ("match_mode 3", LobbyMatchInfo { match_mode: 3, ..base.clone() }),
        ("outcome", LobbyMatchInfo { match_outcome: 1, ..base.clone() }),
        ("not_scored", LobbyMatchInfo { not_scored: true, ..base.clone() }),
        ("low_pri", LobbyMatchInfo { low_pri_pool: true, ..base.clone() }),
        ("duration", LobbyMatchInfo { duration_s: 599, ..base.clone() }),
        ("players", {
            let mut m = base.clone();
            m.players.pop();
            m
        }),
    ];
    for (label, m) in flips {
        assert!(!lobby_eligible(&m), "{label}");
    }
    assert!(lobby_eligible(&LobbyMatchInfo { duration_s: 600, ..base }));
}

/// serde_json parses floats without the `float_roundtrip` feature, so a value can come back one ulp off.
fn same_json(label: &str, a: &Value, b: &Value) {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => close(label, x.as_f64().unwrap(), y.as_f64().unwrap()),
        (Value::Array(x), Value::Array(y)) => {
            assert_eq!(x.len(), y.len(), "{label}");
            x.iter().zip(y).enumerate().for_each(|(i, (x, y))| same_json(&format!("{label}[{i}]"), x, y));
        }
        (Value::Object(x), Value::Object(y)) => {
            assert_eq!(x.keys().collect::<Vec<_>>(), y.keys().collect::<Vec<_>>(), "{label}");
            x.iter().for_each(|(k, x)| same_json(&format!("{label}.{k}"), x, &y[k]));
        }
        _ => assert_eq!(a, b, "{label}"),
    }
}

#[test]
fn totals_round_trip_through_json_and_grade_the_same() {
    for (id, _, _) in FIXTURES {
        let totals = lobby_totals(&info(id));
        let back: LobbyTotals = serde_json::from_str(&serde_json::to_string(&totals).unwrap()).unwrap();
        same_json(id, &serde_json::to_value(&totals).unwrap(), &serde_json::to_value(&back).unwrap());
        let cc = |n: &str| n.len().is_multiple_of(2);
        let (want, got) = (grade_lobby(&totals, &cc), grade_lobby(&back, &cc));
        assert_eq!(want.players.len(), got.players.len(), "{id}");
        for (w, g) in want.players.iter().zip(&got.players) {
            assert_eq!(w.player_slot, g.player_slot, "{id}");
            assert_eq!(
                w.score.as_ref().map(|s| (s.letter, s.place)),
                g.score.as_ref().map(|s| (s.letter, s.place)),
                "{id}"
            );
        }
    }
}

#[test]
fn graded_players_carry_the_hero_ids() {
    for (id, _, _) in FIXTURES {
        let m = info(id);
        let g = grade_lobby(&lobby_totals(&m), &|_: &str| false);
        for p in &g.players {
            let want = m.players.iter().find(|q| q.player_slot == p.player_slot).unwrap().hero_id;
            assert_eq!(p.hero_id, want, "{id} slot {}", p.player_slot);
        }
    }
}

#[test]
fn the_totals_version_is_exported() {
    assert_eq!(LOBBY_TOTALS_VERSION, 1);
}
