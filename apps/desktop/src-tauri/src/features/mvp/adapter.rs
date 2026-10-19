use dp_gamedata::CcSet;
use dp_mvp::{grade_lobby, lobby_eligible, lobby_totals, LobbyGrade, LobbyMetadata, LobbyTotals, LOBBY_GRADE_VERSION};

pub fn parse_lobby(body: &[u8]) -> Option<LobbyMetadata> {
    LobbyMetadata::from_slice(body).ok()
}

pub fn lobby_from_detail(detail: serde_json::Value) -> Option<LobbyMetadata> {
    serde_json::from_value(detail).ok()
}

/// Names the grading rules and the crowd control list a grade was computed with.
pub fn grade_version(cc: &CcSet) -> String {
    format!("{LOBBY_GRADE_VERSION}:{}", cc.fingerprint())
}

/// `None` when the match is not one that gets lobby grades.
pub fn grade_meta(meta: &LobbyMetadata, cc: &CcSet) -> Option<(LobbyTotals, LobbyGrade)> {
    if !lobby_eligible(&meta.match_info) {
        return None;
    }
    let totals = lobby_totals(&meta.match_info);
    let grade = grade_lobby(&totals, &|name: &str| cc.contains(name));
    Some((totals, grade))
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOBBY: &str = include_str!("../../../../../../crates/ring1/dp-mvp/fixtures/lobby-118862917.json");
    const LOBBY_EXPECTED: &str =
        include_str!("../../../../../../crates/ring1/dp-mvp/fixtures/lobby-118862917.expected.json");

    #[test]
    fn a_lobby_body_grades_to_the_expected_places() {
        let meta = parse_lobby(LOBBY.as_bytes()).expect("fixture parses");
        let (_, grade) = grade_meta(&meta, &dp_gamedata::CcSet::bundled()).expect("eligible");
        let want: serde_json::Value = serde_json::from_str(LOBBY_EXPECTED).unwrap();
        for p in want["players"].as_array().unwrap() {
            let slot = p["player_slot"].as_u64().unwrap() as u32;
            let got = grade.players.iter().find(|g| g.player_slot == slot).expect("player graded");
            let place = got.score.as_ref().expect("scored").place;
            assert_eq!(u64::from(place), p["place"].as_u64().unwrap(), "slot {slot}");
        }
    }

    #[test]
    fn a_detail_value_reads_like_its_body() {
        let value: serde_json::Value = serde_json::from_str(LOBBY).unwrap();
        let meta = lobby_from_detail(value).expect("detail parses");
        assert_eq!(meta.match_info.match_id, parse_lobby(LOBBY.as_bytes()).unwrap().match_info.match_id);
        assert!(lobby_from_detail(serde_json::json!("nope")).is_none());
    }

    #[test]
    fn a_street_brawl_is_not_graded() {
        let mut meta = parse_lobby(LOBBY.as_bytes()).unwrap();
        meta.match_info.game_mode = 4;
        assert!(grade_meta(&meta, &dp_gamedata::CcSet::bundled()).is_none());
    }

    #[test]
    fn the_grade_version_follows_the_cc_set() {
        let bundled = dp_gamedata::CcSet::bundled();
        let one = dp_gamedata::CcSet::new(std::collections::BTreeMap::from([(
            "ability_x".to_string(),
            dp_gamedata::CcAbility {
                owner: dp_gamedata::CcOwner::Item,
                kinds: std::collections::BTreeMap::from([(dp_gamedata::CcKind::Stun, 0)]),
            },
        )]));
        assert_ne!(grade_version(&bundled), grade_version(&one));
        assert!(grade_version(&bundled).starts_with(&format!("{}:", dp_mvp::LOBBY_GRADE_VERSION)));
    }
}
