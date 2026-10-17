use serde_json::Value;
use valveprotos::deadlock::CMsgMatchMetaDataContents;

/// Fields whose proto default is `Team0`. The client omits them when the value is 0, and the frontend parser
/// drops a row whose team is missing.
const TEAM_FIELDS: &[(&str, &[&str])] =
    &[("players", &["team"]), ("objectives", &["team"]), ("mid_boss", &["team_killed", "team_claimed"])];

/// The full message in the shape of the Deadlock API's `/v1/matches/{id}/metadata` body: proto field names as
/// keys, unset optionals `null`, enums as numbers. `banned_hero_ids` sits beside `match_info`, as the API puts
/// it; the in-memory message has no bans, so it is always empty.
pub fn detail_json(meta: &CMsgMatchMetaDataContents) -> Value {
    let mut json = serde_json::to_value(meta).unwrap_or(Value::Null);
    if let Some(info) = json.get_mut("match_info").and_then(Value::as_object_mut) {
        default_team(info, "winning_team");
        for (list, fields) in TEAM_FIELDS {
            let Some(Value::Array(rows)) = info.get_mut(*list) else { continue };
            for row in rows.iter_mut().filter_map(Value::as_object_mut) {
                for field in *fields {
                    default_team(row, field);
                }
            }
        }
    }
    if let Some(root) = json.as_object_mut() {
        root.insert("banned_hero_ids".into(), Value::Array(Vec::new()));
    }
    json
}

fn default_team(object: &mut serde_json::Map<String, Value>, field: &str) {
    let slot = object.entry(field).or_insert(Value::Null);
    if slot.is_null() {
        *slot = Value::from(0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use valveprotos::deadlock::c_msg_match_meta_data_contents::{Items, MatchInfo, Players};

    const FIXTURE: &str = include_str!("../../../../packages/match/src/fixtures/api-ranked.json");

    const GOLDEN_LEAVER: &str = include_str!("../../../../packages/match/src/fixtures/golden/leaver-118343128.json");

    /// The keys `parseApiDetail` reads, per object level. Arrays are walked element by element.
    struct Read {
        leaves: &'static [&'static str],
        children: &'static [(&'static str, Read)],
    }

    const POSITION: Read = Read { leaves: &["x", "y", "z"], children: &[] };

    const PLAYER: Read = Read {
        leaves: &[
            "player_slot",
            "account_id",
            "hero_id",
            "team",
            "assigned_lane",
            "level",
            "kills",
            "deaths",
            "assists",
            "net_worth",
            "last_hits",
            "denies",
            "mvp_rank",
            "abandon_match_time_s",
            "player_match_outcome",
        ],
        children: &[
            (
                "items",
                Read {
                    leaves: &[
                        "item_id",
                        "game_time_s",
                        "sold_time_s",
                        "upgrade_id",
                        "imbued_ability_id",
                        "upgrade_info",
                    ],
                    children: &[],
                },
            ),
            (
                "death_details",
                Read {
                    leaves: &["game_time_s", "killer_player_slot", "death_duration_s", "time_to_kill_s"],
                    children: &[("death_pos", POSITION), ("killer_pos", POSITION)],
                },
            ),
            (
                "stats",
                Read {
                    leaves: &[
                        "time_stamp_s",
                        "net_worth",
                        "player_damage",
                        "player_healing",
                        "kills",
                        "deaths",
                        "assists",
                        "boss_damage",
                        "teammate_healing",
                        "teammate_barriering",
                    ],
                    children: &[],
                },
            ),
            ("ability_stats", Read { leaves: &["ability_id", "ability_value"], children: &[] }),
            (
                "accolades",
                Read { leaves: &["accolade_id", "accolade_stat_value", "accolade_threshold_achieved"], children: &[] },
            ),
            (
                "player_rank_data",
                Read {
                    leaves: &[
                        "initial_display_rank",
                        "initial_flat_progress",
                        "final_flat_progress",
                        "desired_progress_change",
                        "initial_calibration_games",
                        "initial_demotion_protection_games",
                        "consumed_demotion_protection",
                        "initial_win_streak",
                    ],
                    children: &[],
                },
            ),
        ],
    };

    const MATCH_INFO: Read = Read {
        leaves: &[
            "match_id",
            "winning_team",
            "not_scored",
            "average_badge_team0",
            "average_badge_team1",
            "start_time",
            "duration_s",
            "match_mode",
            "game_mode",
            "match_outcome",
            "low_pri_pool",
        ],
        children: &[
            ("players", PLAYER),
            (
                "match_paths",
                Read {
                    leaves: &["interval_s", "x_resolution", "y_resolution"],
                    children: &[(
                        "paths",
                        Read { leaves: &["player_slot", "x_min", "y_min", "x_max", "y_max", "x_pos"], children: &[] },
                    )],
                },
            ),
            (
                "objectives",
                Read {
                    leaves: &[
                        "team_objective_id",
                        "team",
                        "destroyed_time_s",
                        "first_damage_time_s",
                        "creep_damage",
                        "player_damage",
                        "player_spirit_damage",
                    ],
                    children: &[],
                },
            ),
            ("mid_boss", Read { leaves: &["team_killed", "team_claimed", "destroyed_time_s"], children: &[] }),
            (
                "damage_matrix",
                Read {
                    leaves: &["sample_time_s"],
                    children: &[
                        ("source_details", Read { leaves: &["source_name", "stat_type"], children: &[] }),
                        (
                            "damage_dealers",
                            Read {
                                leaves: &["dealer_player_slot"],
                                children: &[(
                                    "damage_sources",
                                    Read {
                                        leaves: &["source_details_index"],
                                        children: &[(
                                            "damage_to_players",
                                            Read { leaves: &["target_player_slot", "damage"], children: &[] },
                                        )],
                                    },
                                )],
                            },
                        ),
                    ],
                },
            ),
        ],
    };

    /// Floats survive the `f32` field type, so they are compared at that precision.
    fn same_leaf(path: &str, want: &Value, got: &Value) {
        match (want, got) {
            (Value::Number(a), Value::Number(b)) => {
                let (a, b) = (a.as_f64().unwrap(), b.as_f64().unwrap());
                assert!(a == b || (a as f32) == (b as f32), "{path}: {a} != {b}");
            }
            (Value::Array(a), Value::Array(b)) => {
                assert_eq!(a.len(), b.len(), "{path}: length");
                for (i, (a, b)) in a.iter().zip(b).enumerate() {
                    same_leaf(&format!("{path}[{i}]"), a, b);
                }
            }
            _ => assert_eq!(want, got, "{path}"),
        }
    }

    fn same_shape(path: &str, want: &Value, got: &Value, read: &Read) {
        if let Value::Array(want_items) = want {
            let got_items = got.as_array().unwrap_or_else(|| panic!("{path}: expected an array, got {got}"));
            assert_eq!(want_items.len(), got_items.len(), "{path}: length");
            for (i, (w, g)) in want_items.iter().zip(got_items).enumerate() {
                same_shape(&format!("{path}[{i}]"), w, g, read);
            }
            return;
        }
        for key in read.leaves {
            let w = want.get(*key).unwrap_or(&Value::Null);
            let g = got.get(*key).unwrap_or(&Value::Null);
            same_leaf(&format!("{path}.{key}"), w, g);
        }
        for (key, child) in read.children {
            match want.get(*key) {
                None | Some(Value::Null) => {}
                Some(w) => {
                    let g = got.get(*key).unwrap_or_else(|| panic!("{path}.{key}: missing"));
                    same_shape(&format!("{path}.{key}"), w, g, child);
                }
            }
        }
    }

    fn add_empty(value: &mut Value, field: &str) {
        match value {
            Value::Object(map) => {
                map.entry(field).or_insert_with(|| Value::Array(Vec::new()));
                map.values_mut().for_each(|v| add_empty(v, field));
            }
            Value::Array(items) => items.iter_mut().for_each(|v| add_empty(v, field)),
            _ => {}
        }
    }

    /// The API leaves empty repeated fields out, but the generated `Deserialize` requires them. Unknown keys are
    /// ignored, so each missing name is added as `[]` everywhere until the message parses.
    fn from_api(json: &Value) -> CMsgMatchMetaDataContents {
        let mut json = json.clone();
        let mut filled = Vec::new();
        loop {
            let err = match serde_json::from_value(json.clone()) {
                Ok(meta) => return meta,
                Err(e) => e.to_string(),
            };
            let field = err
                .strip_prefix("missing field `")
                .and_then(|rest| rest.split('`').next())
                .unwrap_or_else(|| panic!("fixture does not deserialize: {err}"))
                .to_owned();
            assert!(!filled.contains(&field), "still missing after filling: {field}");
            add_empty(&mut json, &field);
            filled.push(field);
        }
    }

    #[test]
    fn every_key_the_frontend_parser_reads_matches_the_api_fixture() {
        let fixture: Value = serde_json::from_str(FIXTURE).unwrap();
        let meta = from_api(&fixture);
        let got = detail_json(&meta);

        let players = fixture["match_info"]["players"].as_array().unwrap();
        assert!(players.len() >= 2 && !players[0]["stats"].as_array().unwrap().is_empty());
        same_shape("match_info", &fixture["match_info"], &got["match_info"], &MATCH_INFO);
        assert_eq!(got["banned_hero_ids"], serde_json::json!([]));
    }

    #[test]
    fn the_eligibility_keys_survive_for_a_match_with_a_leaver() {
        let fixture: Value = serde_json::from_str(GOLDEN_LEAVER).unwrap();
        let got = detail_json(&from_api(&fixture));

        let players = fixture["match_info"]["players"].as_array().unwrap();
        assert!(players.iter().any(|p| p["abandon_match_time_s"].as_i64().unwrap_or(0) > 0));
        same_shape("match_info", &fixture["match_info"], &got["match_info"], &MATCH_INFO);
    }

    #[test]
    fn players_without_a_team_are_team_zero() {
        let meta = CMsgMatchMetaDataContents {
            match_info: Some(MatchInfo {
                match_id: Some(1),
                players: vec![Players { account_id: Some(5), team: None, ..Default::default() }],
                ..Default::default()
            }),
        };
        assert_eq!(detail_json(&meta)["match_info"]["players"][0]["team"], 0);
    }

    #[test]
    fn a_team_that_is_set_is_kept() {
        let meta = CMsgMatchMetaDataContents {
            match_info: Some(MatchInfo {
                players: vec![Players { team: Some(1), ..Default::default() }],
                ..Default::default()
            }),
        };
        assert_eq!(detail_json(&meta)["match_info"]["players"][0]["team"], 1);
    }

    #[test]
    fn an_item_row_keeps_its_raw_upgrade_info() {
        let meta = CMsgMatchMetaDataContents {
            match_info: Some(MatchInfo {
                players: vec![Players {
                    items: vec![Items { item_id: Some(7), upgrade_info: Some(196_608), ..Default::default() }],
                    ..Default::default()
                }],
                ..Default::default()
            }),
        };
        assert_eq!(detail_json(&meta)["match_info"]["players"][0]["items"][0]["upgrade_info"], 196_608);
    }
}
