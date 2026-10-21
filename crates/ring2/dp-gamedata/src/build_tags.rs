use std::path::Path;

use deadlock_data::LocalizationFile;
use serde::Serialize;
use ts_rs::TS;

use crate::progression::ability_id;

const BUNDLE: &str = "citadel_main";

pub const BUILD_TAG_KEYS: [&str; 14] = [
    "weapon",
    "vitality",
    "spirit",
    "complexity_1",
    "complexity_2",
    "complexity_3",
    "damage",
    "utility",
    "healing",
    "crowd_control",
    "mobility",
    "melee",
    "headshots",
    "debuff",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct BuildTag {
    pub key: String,
    /// The id a build stores in its `tags`.
    pub id: u32,
    pub name: String,
}

/// The game's standard build tags, named in `language` with English filling its gaps. A tag named in neither is left out.
pub fn build_tags(citadel_dir: &Path, language: &str) -> Vec<BuildTag> {
    let mut languages = vec![language];
    if language != deadlock_data::DEFAULT_LANGUAGE {
        languages.push(deadlock_data::DEFAULT_LANGUAGE);
    }
    let bundles: Vec<LocalizationFile> = languages
        .into_iter()
        .filter_map(|language| {
            LocalizationFile::load(citadel_dir, BUNDLE, language)
                .map_err(|e| log::debug!("{BUNDLE} for {language} unavailable: {e}"))
                .ok()
        })
        .collect();
    BUILD_TAG_KEYS
        .iter()
        .filter_map(|key| {
            let token = format!("citadel_build_tag_{key}");
            let name = bundles.iter().find_map(|b| b.get(&token).filter(|n| !n.is_empty()))?;
            Some(BuildTag { key: (*key).to_string(), id: ability_id(&token), name: name.to_string() })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    const ENGLISH: &str = include_str!("../fixtures/citadel_main_english.txt");
    const GERMAN: &str = include_str!("../fixtures/citadel_main_german.txt");

    fn install(name: &str, bundles: &[(&str, &str)]) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dp-gamedata-build-tags-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        for (language, text) in bundles {
            let path = dir.join(LocalizationFile::relative_path("citadel_main", language));
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, text).unwrap();
        }
        dir
    }

    fn tag<'a>(tags: &'a [BuildTag], key: &str) -> &'a BuildTag {
        tags.iter().find(|t| t.key == key).unwrap_or_else(|| panic!("{key} missing"))
    }

    // Ids from an independent MurmurHash2 (seed 0x31415926) of `citadel_build_tag_<key>`.
    #[test]
    fn every_standard_tag_is_named_with_the_id_builds_store() {
        let dir = install("english", &[("english", ENGLISH)]);
        let tags = build_tags(&dir, "english");
        let keys: Vec<&str> = tags.iter().map(|t| t.key.as_str()).collect();
        assert_eq!(keys, BUILD_TAG_KEYS);
        assert_eq!(tag(&tags, "weapon"), &BuildTag { key: "weapon".into(), id: 47_026_193, name: "Weapon".into() });
        assert_eq!(tag(&tags, "complexity_1").id, 1_052_421_347);
        assert_eq!(tag(&tags, "complexity_1").name, "For New Players");
        assert_eq!(tag(&tags, "crowd_control").id, 4_216_803_923);
        assert_eq!(tag(&tags, "debuff").id, 255_841_590);
    }

    #[test]
    fn a_tag_missing_in_the_language_falls_back_to_english() {
        let dir = install("fallback", &[("english", ENGLISH), ("german", GERMAN)]);
        let tags = build_tags(&dir, "german");
        assert_eq!(tags.len(), BUILD_TAG_KEYS.len());
        assert_eq!(tag(&tags, "vitality").name, "Vitalität");
        assert_eq!(tag(&tags, "headshots").name, "Headshots");
        assert_eq!(tag(&tags, "debuff").name, "Debuff");
    }

    #[test]
    fn a_tag_named_in_neither_language_is_left_out() {
        let dir = install("unnamed", &[("german", GERMAN)]);
        let tags = build_tags(&dir, "german");
        assert_eq!(tags.len(), BUILD_TAG_KEYS.len() - 2);
        assert!(tags.iter().all(|t| t.key != "headshots" && t.key != "debuff"));
        assert_eq!(tag(&tags, "melee").name, "Nahkampf");
    }
}
