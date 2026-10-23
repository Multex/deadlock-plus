use std::collections::BTreeMap;
use std::path::Path;

use deadlock_data::LocalizationFile;
use serde::Serialize;
use ts_rs::TS;

/// The game strings the game-ui labels use, with the bundle each lives in.
pub const GAME_UI_TOKENS: [(&str, &str); 21] = [
    ("citadel_main", "Citadel_Mod_Tooltip_Passive"),
    ("citadel_main", "Citadel_Mod_Tooltip_Active"),
    ("citadel_main", "Citadel_Shop_Purchased"),
    ("citadel_main", "Citadel_Shop_AbilityIsImbuing"),
    ("citadel_main", "Citadel_Shop_AbilityIsImbued"),
    ("citadel_main", "Citadel_ComponentRequired"),
    ("citadel_main", "Citadel_IsComponentOf"),
    ("citadel_main", "Citadel_ComponentUseIn"),
    ("citadel_main", "Citadel_PopularityLabel_Early"),
    ("citadel_main", "Citadel_PopularityLabel_Mid"),
    ("citadel_main", "Citadel_PopularityLabel_Late"),
    ("citadel_main", "Citadel_Shop_ConditionalAttribute"),
    ("citadel_main", "Citadel_ItemViewImpact"),
    ("citadel_main", "Citadel_ItemModifies"),
    ("citadel_main", "Citadel_HeroBuilds_AP_Next_Indicator"),
    ("citadel_attributes", "Citadel_StatusEffect"),
    ("citadel_attributes", "StatDesc_BulletDamage"),
    ("citadel_attributes", "StatDesc_LightMeleeDamage"),
    ("citadel_attributes", "StatDesc_HeavyMeleeDamage"),
    ("citadel_attributes", "StatDesc_MaxHealth"),
    ("citadel_attributes", "StatDesc_TechPower"),
];

/// Game UI strings by token, as the game writes them: params stay in its `{d:name}` / `{s:name}` form.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct GameUiStrings(pub BTreeMap<String, String>);

/// Every [`GAME_UI_TOKENS`] string the game has in `language`. A token missing or empty there is left out, never
/// filled from English: the app's own translation of the label reads better than English mid-tooltip.
pub fn game_ui_strings(citadel_dir: &Path, language: &str) -> GameUiStrings {
    let mut bundles: Vec<(&str, Option<LocalizationFile>)> = Vec::new();
    for (bundle, _) in GAME_UI_TOKENS {
        if bundles.iter().any(|(name, _)| *name == bundle) {
            continue;
        }
        let file = LocalizationFile::load(citadel_dir, bundle, language)
            .map_err(|e| log::debug!("{bundle} for {language} unavailable: {e}"))
            .ok();
        bundles.push((bundle, file));
    }
    let strings = GAME_UI_TOKENS
        .iter()
        .filter_map(|(bundle, token)| {
            let (_, file) = bundles.iter().find(|(name, _)| name == bundle)?;
            let text = file.as_ref()?.get(token).filter(|t| !t.is_empty())?;
            Some(((*token).to_string(), text.to_string()))
        })
        .collect();
    GameUiStrings(strings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn bundle(language: &str, tokens: &[(&str, &str)]) -> String {
        let rows: String = tokens.iter().map(|(k, v)| format!("\t\t\"{k}\"\t\t\"{v}\"\n")).collect();
        format!("\"lang\"\n{{\n\t\"Language\"\t\t\"{language}\"\n\t\"Tokens\"\n\t{{\n{rows}\t}}\n}}\n")
    }

    /// Bundle name, language, tokens.
    type BundleFile<'a> = (&'a str, &'a str, &'a [(&'a str, &'a str)]);

    fn install(name: &str, files: &[BundleFile]) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dp-gamedata-ui-strings-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        for (name, language, tokens) in files {
            let path = dir.join(LocalizationFile::relative_path(name, language));
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, bundle(language, tokens)).unwrap();
        }
        dir
    }

    #[test]
    fn reads_tokens_from_both_bundles() {
        let dir = install(
            "english",
            &[
                (
                    "citadel_main",
                    "english",
                    &[
                        ("Citadel_Mod_Tooltip_Passive", "Passive"),
                        ("Citadel_PopularityLabel_Early", "Purchased early game in {d:popular_pct}% of matches."),
                        ("Citadel_Unrelated", "Not asked for"),
                    ],
                ),
                ("citadel_attributes", "english", &[("Citadel_StatusEffect", "Status Effect")]),
            ],
        );
        let strings = game_ui_strings(&dir, "english").0;
        assert_eq!(strings.get("Citadel_Mod_Tooltip_Passive").map(String::as_str), Some("Passive"));
        assert_eq!(
            strings.get("Citadel_PopularityLabel_Early").map(String::as_str),
            Some("Purchased early game in {d:popular_pct}% of matches.")
        );
        assert_eq!(strings.get("Citadel_StatusEffect").map(String::as_str), Some("Status Effect"));
        assert!(!strings.contains_key("Citadel_Unrelated"));
        assert_eq!(strings.len(), 3);
        fs::remove_dir_all(dir).ok();
    }

    // The app's own translation reads better than English inside an otherwise translated tooltip.
    #[test]
    fn a_token_missing_or_empty_in_the_language_is_left_out_not_filled_from_english() {
        let english: &[(&str, &str)] = &[
            ("Citadel_Mod_Tooltip_Passive", "Passive"),
            ("Citadel_Mod_Tooltip_Active", "Active"),
            ("Citadel_Shop_Purchased", "Owned"),
        ];
        let dir = install(
            "partial",
            &[
                ("citadel_main", "english", english),
                (
                    "citadel_main",
                    "german",
                    &[("Citadel_Mod_Tooltip_Passive", "Passiv"), ("Citadel_Shop_Purchased", "")],
                ),
                ("citadel_attributes", "english", &[("Citadel_StatusEffect", "Status Effect")]),
                ("citadel_attributes", "german", &[("Citadel_StatusEffect", "Statuseffekt")]),
            ],
        );
        let strings = game_ui_strings(&dir, "german").0;
        assert_eq!(strings.get("Citadel_Mod_Tooltip_Passive").map(String::as_str), Some("Passiv"));
        assert_eq!(strings.get("Citadel_StatusEffect").map(String::as_str), Some("Statuseffekt"));
        assert!(!strings.contains_key("Citadel_Mod_Tooltip_Active"));
        assert!(!strings.contains_key("Citadel_Shop_Purchased"));
        assert_eq!(strings.len(), 2);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_stub_language_file_gives_no_strings() {
        let dir = install(
            "stub",
            &[
                ("citadel_main", "english", &[("Citadel_Mod_Tooltip_Passive", "Passive")]),
                ("citadel_main", "hungarian", &[]),
                ("citadel_attributes", "english", &[("Citadel_StatusEffect", "Status Effect")]),
                ("citadel_attributes", "hungarian", &[]),
            ],
        );
        assert_eq!(game_ui_strings(&dir, "hungarian"), GameUiStrings::default());
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    #[ignore = "needs an installed game; set DEADLOCK_CITADEL_DIR"]
    fn the_installed_game_has_every_token_in_each_translated_language() {
        let dir = PathBuf::from(std::env::var("DEADLOCK_CITADEL_DIR").expect("set DEADLOCK_CITADEL_DIR"));
        const STUBS: [&str; 3] = ["hungarian", "portuguese", "tchinese"];
        let app_languages = [
            "english",
            "brazilian",
            "czech",
            "french",
            "german",
            "hungarian",
            "indonesian",
            "italian",
            "japanese",
            "koreana",
            "latam",
            "polish",
            "portuguese",
            "russian",
            "schinese",
            "spanish",
            "tchinese",
            "thai",
            "turkish",
            "ukrainian",
        ];
        for language in app_languages {
            let strings = game_ui_strings(&dir, language).0;
            let expected = if STUBS.contains(&language) { 0 } else { GAME_UI_TOKENS.len() };
            assert_eq!(strings.len(), expected, "{language}: {strings:?}");
        }
        let german = game_ui_strings(&dir, "german").0;
        assert_eq!(german.get("Citadel_Mod_Tooltip_Passive").map(String::as_str), Some("Passiv"));
    }

    // Game build 6810: the stat names the ALT "See Details" rows show, and the header over them.
    #[test]
    fn the_installed_game_names_the_alt_column_in_english() {
        use crate::catalog::{Install, SteamInstall};
        let dir = std::env::var_os("DEADLOCK_CITADEL_DIR").map(PathBuf::from).or_else(|| SteamInstall.citadel_dir());
        let Some(dir) =
            dir.filter(|d| d.join(LocalizationFile::relative_path("citadel_attributes", "english")).is_file())
        else {
            eprintln!("skipped: no installed Deadlock");
            return;
        };
        let strings = game_ui_strings(&dir, "english").0;
        let named = |token: &str| strings.get(token).map(String::as_str);
        assert_eq!(named("StatDesc_BulletDamage"), Some("Bullet Damage"));
        assert_eq!(named("StatDesc_LightMeleeDamage"), Some("Light Melee"));
        assert_eq!(named("StatDesc_HeavyMeleeDamage"), Some("Heavy Melee"));
        assert_eq!(named("StatDesc_MaxHealth"), Some("Max Health"));
        assert_eq!(named("StatDesc_TechPower"), Some("Spirit Power"));
        assert_eq!(named("Citadel_ItemModifies"), Some("Modifies"));
    }

    #[test]
    fn is_empty_without_localization_files() {
        let dir = install("empty", &[]);
        assert_eq!(game_ui_strings(&dir, "german"), GameUiStrings::default());
        fs::remove_dir_all(dir).ok();
    }
}
