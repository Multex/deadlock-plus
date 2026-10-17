use serde::Serialize;
use ts_rs::TS;

use super::store::StoredGrade;

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

/// One match's stored grade, for the match list and detail.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct MvpMatchGrade {
    pub match_id: u64,
    /// Unix seconds the weights were built at.
    pub built_at: i64,
    /// Someone abandoned or left early; every score in the match is skewed.
    pub leaver: bool,
    /// False for a grade from the game-captured detail: early leavers without an abandon flag were not caught.
    pub paths_checked: bool,
    /// Graded players by place, ties by slot. Players who left or could not be graded are absent.
    pub players: Vec<MvpPlayerGrade>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct MvpPlayerGrade {
    pub account_id: u32,
    pub player_slot: u32,
    pub hero_id: u32,
    /// Shown with one decimal: `s10 / 10`.
    pub s10: u16,
    pub letter: MvpLetter,
    /// 1-based; equal `s10` share a place and the next one skips (1, 2, 2, 4).
    pub place: u8,
    /// Per stat in the order kills, deaths, assists, souls, player damage, objective damage, self healing,
    /// support; `null` for a stat skipped for the hero. Deaths are not inverted.
    pub percentiles: Vec<Option<f64>>,
}

fn letter(l: dp_mvp::MvpLetter) -> MvpLetter {
    use dp_mvp::MvpLetter as L;
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

/// `None` for a match that was checked and is not gradable.
pub fn to_view(stored: &StoredGrade) -> Option<MvpMatchGrade> {
    let grade = stored.grade.as_ref()?;
    Some(MvpMatchGrade {
        match_id: grade.match_id,
        built_at: grade.built_at,
        leaver: grade.leaver,
        paths_checked: grade.paths_checked,
        players: grade
            .players
            .iter()
            .map(|p| MvpPlayerGrade {
                account_id: p.account_id,
                player_slot: p.player_slot,
                hero_id: p.hero_id,
                s10: p.s10,
                letter: letter(p.letter),
                place: p.place,
                percentiles: p.percentiles.to_vec(),
            })
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::mvp::adapter::{match_input, parse_metadata, tests::RANKED, Ranks};
    use crate::features::mvp::store::tests::model;

    fn stored() -> StoredGrade {
        let meta = parse_metadata(RANKED.as_bytes()).unwrap();
        let grade = model().grade(&match_input(&meta, &Ranks::new())).expect("eligible");
        StoredGrade { match_id: grade.match_id, provisional: false, grade: Some(grade) }
    }

    #[test]
    fn the_view_carries_every_graded_player_in_place_order() {
        let stored = stored();
        let grade = stored.grade.clone().unwrap();
        let view = to_view(&stored).unwrap();
        assert_eq!(
            (view.match_id, view.built_at, view.leaver, view.paths_checked),
            (118339116, grade.built_at, false, true)
        );
        assert_eq!(view.players.len(), grade.players.len());
        for (v, g) in view.players.iter().zip(&grade.players) {
            assert_eq!(
                (v.account_id, v.player_slot, v.hero_id, v.s10, v.place),
                (g.account_id, g.player_slot, g.hero_id, g.s10, g.place)
            );
            assert_eq!(v.percentiles, g.percentiles.to_vec());
        }
    }

    #[test]
    fn letters_serialise_as_the_pure_crate_does() {
        let stored = stored();
        let grade = stored.grade.clone().unwrap();
        let view = serde_json::to_value(to_view(&stored).unwrap()).unwrap();
        for (v, g) in view["players"].as_array().unwrap().iter().zip(&grade.players) {
            assert_eq!(v["letter"], serde_json::to_value(g.letter).unwrap());
        }
        assert!(view["players"][0].get("playerSlot").is_some());
    }

    #[test]
    fn every_letter_maps_to_the_same_text() {
        for s10 in 0..=1000 {
            let l = dp_mvp::letter_for(s10);
            assert_eq!(serde_json::to_value(letter(l)).unwrap(), serde_json::to_value(l).unwrap(), "{s10}");
        }
    }

    #[test]
    fn an_ungradable_match_has_no_view() {
        assert_eq!(to_view(&StoredGrade { match_id: 1, provisional: false, grade: None }), None);
    }
}
