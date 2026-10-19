use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::SystemTime;

use deadlock_data::vdata::Accolade;
use deadlock_data::{HeroCatalog, Item, ItemCatalog, LocalizationFile};
use serde::Serialize;
use ts_rs::TS;

use crate::cc::CcSet;
use crate::locale::game_language;

pub trait Install: Send + Sync + 'static {
    fn citadel_dir(&self) -> Option<PathBuf>;
}

pub struct SteamInstall;

impl Install for SteamInstall {
    fn citadel_dir(&self) -> Option<PathBuf> {
        dp_steam::game_install_dir().map(|dir| dir.join("game").join("citadel"))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct HeroEntry {
    pub id: u32,
    pub class_name: String,
    pub name: String,
    pub localised: bool,
    pub selectable: bool,
    pub in_development: bool,
    pub disabled: bool,
    pub pre_release: bool,
    pub portrait: Option<String>,
    pub card: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ItemEntry {
    pub id: u32,
    pub class_name: String,
    pub name: String,
    pub localised: bool,
    pub kind: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AccoladeEntry {
    pub id: u32,
    pub name: String,
    /// The game's own description: a template over `{stat_value}` that says what the accolade counts.
    pub description: Option<String>,
    /// The stat the accolade is measured on.
    pub tracked_stat: Option<String>,
}

struct Loaded {
    dir: Option<PathBuf>,
    stamp: Option<SystemTime>,
    heroes: HeroCatalog,
    items: Option<ItemCatalog>,
    cc: Option<Arc<CcSet>>,
    hero_lists: HashMap<&'static str, Arc<Vec<HeroEntry>>>,
    item_lists: HashMap<&'static str, Arc<Vec<ItemEntry>>>,
    accolade_lists: HashMap<&'static str, Arc<Vec<AccoladeEntry>>>,
}

struct Shared<I> {
    install: I,
    state: Mutex<Option<Loaded>>,
    builds: AtomicUsize,
}

pub struct GameData<I: Install = SteamInstall> {
    shared: Arc<Shared<I>>,
}

impl<I: Install> Clone for GameData<I> {
    fn clone(&self) -> Self {
        Self { shared: Arc::clone(&self.shared) }
    }
}

impl Default for GameData {
    fn default() -> Self {
        Self::new(SteamInstall)
    }
}

pub(crate) fn archive_stamp(dir: &Path) -> Option<SystemTime> {
    std::fs::metadata(dir.join("pak01_dir.vpk")).and_then(|m| m.modified()).ok()
}

impl<I: Install> GameData<I> {
    pub fn new(install: I) -> Self {
        Self { shared: Arc::new(Shared { install, state: Mutex::new(None), builds: AtomicUsize::new(0) }) }
    }

    pub fn builds(&self) -> usize {
        self.shared.builds.load(Ordering::Relaxed)
    }

    pub fn heroes(&self, locale: &str) -> Arc<Vec<HeroEntry>> {
        let language = game_language(locale);
        let mut guard = self.current();
        let loaded = guard.as_mut().expect("current() fills the state");
        if let Some(list) = loaded.hero_lists.get(language) {
            return Arc::clone(list);
        }
        let mut catalog = loaded.heroes.clone();
        if let Some(dir) = &loaded.dir {
            if let Err(e) = catalog.merge_game_dir_lang(dir, language) {
                log::debug!("hero names for {language} unavailable: {e}");
            }
        }
        let list = Arc::new(hero_entries(&catalog));
        loaded.hero_lists.insert(language, Arc::clone(&list));
        list
    }

    pub fn items(&self, locale: &str) -> Arc<Vec<ItemEntry>> {
        let language = game_language(locale);
        let mut guard = self.current();
        let loaded = guard.as_mut().expect("current() fills the state");
        if let Some(list) = loaded.item_lists.get(language) {
            return Arc::clone(list);
        }
        let base = loaded.items.get_or_insert_with(|| build_items(loaded.dir.as_deref()));
        let mut catalog = base.clone();
        if let Some(dir) = &loaded.dir {
            if let Err(e) = catalog.merge_game_dir_lang(dir, language) {
                log::debug!("item names for {language} unavailable: {e}");
            }
        }
        let list = Arc::new(item_entries(&catalog));
        loaded.item_lists.insert(language, Arc::clone(&list));
        list
    }

    pub fn accolades(&self, locale: &str) -> Arc<Vec<AccoladeEntry>> {
        let language = game_language(locale);
        let mut guard = self.current();
        let loaded = guard.as_mut().expect("current() fills the state");
        if let Some(list) = loaded.accolade_lists.get(language) {
            return Arc::clone(list);
        }
        let list = Arc::new(loaded.dir.as_deref().map(|dir| read_accolades(dir, language)).unwrap_or_default());
        loaded.accolade_lists.insert(language, Arc::clone(&list));
        list
    }

    /// The installed game's hard-CC list replaces the bundled one: a patch can remove CC, so they are never merged.
    pub fn cc_abilities(&self) -> Arc<CcSet> {
        let mut guard = self.current();
        let loaded = guard.as_mut().expect("current() fills the state");
        let dir = loaded.dir.as_deref();
        Arc::clone(loaded.cc.get_or_insert_with(|| Arc::new(CcSet::installed(dir))))
    }

    fn current(&self) -> MutexGuard<'_, Option<Loaded>> {
        let mut guard = self.shared.state.lock().unwrap_or_else(|e| e.into_inner());
        let dir = self.shared.install.citadel_dir();
        let stamp = dir.as_deref().and_then(archive_stamp);
        let fresh = guard.as_ref().is_some_and(|l| l.dir == dir && l.stamp == stamp);
        if !fresh {
            self.shared.builds.fetch_add(1, Ordering::Relaxed);
            let heroes = build_heroes(dir.as_deref());
            *guard = Some(Loaded {
                dir,
                stamp,
                heroes,
                items: None,
                cc: None,
                hero_lists: HashMap::new(),
                item_lists: HashMap::new(),
                accolade_lists: HashMap::new(),
            });
        }
        guard
    }
}

/// The snapshot only knows items up to the day it was taken; heroes released since have
/// abilities the installed game lists and the snapshot does not.
fn build_items(dir: Option<&Path>) -> ItemCatalog {
    let mut catalog = ItemCatalog::for_game(dir);
    if let Some(dir) = dir {
        match deadlock_data::vdata::item_roster(dir) {
            Ok(roster) => {
                add_missing(&mut catalog, &ItemCatalog::new(roster));
            }
            Err(e) => log::debug!("installed item roster unavailable: {e}"),
        }
    }
    catalog
}

/// Adds rows `installed` has and `base` lacks. Rows `base` already has keep their kind and art.
fn add_missing(base: &mut ItemCatalog, installed: &ItemCatalog) -> usize {
    let missing: Vec<Item> = installed.all().iter().filter(|i| base.get(i.id).is_none()).cloned().collect();
    if missing.is_empty() {
        return 0;
    }
    base.merge_roster(&ItemCatalog::new(missing))
}

fn read_accolades(dir: &Path, language: &str) -> Vec<AccoladeEntry> {
    let definitions = match deadlock_data::vdata::accolades(dir) {
        Ok(list) => list,
        Err(e) => {
            log::debug!("accolade definitions unavailable: {e}");
            return Vec::new();
        }
    };
    let bundle = deadlock_data::localization::ACCOLADES_BUNDLE;
    let wanted = load_escaped_bundle(dir, bundle, language);
    let fallback = (language != deadlock_data::DEFAULT_LANGUAGE)
        .then(|| load_escaped_bundle(dir, bundle, deadlock_data::DEFAULT_LANGUAGE))
        .flatten();
    accolade_entries(&definitions, wanted.as_ref(), fallback.as_ref())
}

/// Accolade descriptions contain `\"` (HTML attributes), which the library's bundle parser cuts at.
fn load_escaped_bundle(dir: &Path, bundle: &str, language: &str) -> Option<LocalizationFile> {
    let raw = std::fs::read(dir.join(LocalizationFile::relative_path(bundle, language))).ok()?;
    let text = match raw.as_slice() {
        [0xEF, 0xBB, 0xBF, rest @ ..] => String::from_utf8_lossy(rest).into_owned(),
        [0xFF, 0xFE, rest @ ..] => {
            let units: Vec<u16> = rest.as_chunks::<2>().0.iter().map(|c| u16::from_le_bytes(*c)).collect();
            String::from_utf16_lossy(&units)
        }
        other => String::from_utf8_lossy(other).into_owned(),
    };
    Some(parse_escaped_bundle(&text, language))
}

fn parse_escaped_bundle(text: &str, language: &str) -> LocalizationFile {
    let mut tokens = HashMap::new();
    for line in text.lines() {
        let mut quoted = QuotedStrings { rest: line.trim() };
        let (Some(key), Some(value)) = (quoted.next(), quoted.next()) else { continue };
        let key = key.trim().split(':').next().unwrap_or_default();
        if key.is_empty() || key.ends_with("_search") || key.ends_with("_sort") {
            continue;
        }
        tokens.insert(key.to_string(), value.trim().to_string());
    }
    LocalizationFile { language: language.to_string(), tokens }
}

struct QuotedStrings<'a> {
    rest: &'a str,
}

impl Iterator for QuotedStrings<'_> {
    type Item = String;

    fn next(&mut self) -> Option<String> {
        let start = self.rest.find('"')? + 1;
        let mut out = String::new();
        let mut chars = self.rest[start..].char_indices();
        while let Some((i, c)) = chars.next() {
            match c {
                '"' => {
                    self.rest = &self.rest[start + i + 1..];
                    return Some(out);
                }
                '\\' => match chars.next() {
                    Some((_, 'n')) => out.push('\n'),
                    Some((_, other)) => out.push(other),
                    None => break,
                },
                other => out.push(other),
            }
        }
        None
    }
}

fn accolade_entries(
    definitions: &[Accolade],
    wanted: Option<&LocalizationFile>,
    fallback: Option<&LocalizationFile>,
) -> Vec<AccoladeEntry> {
    // Bundle keys are stored without the `:f` grammar suffix that description tokens carry.
    let find = |token: &str| {
        [wanted, fallback]
            .into_iter()
            .flatten()
            .filter_map(|file| file.get(token.split(':').next().unwrap_or(token)))
            .find(|text| !text.is_empty())
    };
    definitions
        .iter()
        .filter_map(|a| {
            let name = find(a.flavor_token.as_deref()?)?;
            Some(AccoladeEntry {
                id: a.id,
                name: display_name(name),
                description: a.description_token.as_deref().and_then(find).map(str::to_string),
                tracked_stat: a.tracked_stat.clone(),
            })
        })
        .collect()
}

fn build_heroes(dir: Option<&Path>) -> HeroCatalog {
    use deadlock_data::{Catalogs, Source};
    match dir {
        Some(dir) => Catalogs::new().sources([Source::Client, Source::Bundled]).game_dir(dir).heroes(),
        None => HeroCatalog::bundled(),
    }
}

/// Localised names can start with grammatical-gender markers such as `#|m|#` that the game
/// resolves itself; they are not part of the name.
fn display_name(raw: &str) -> String {
    let mut rest = raw;
    while let Some(tail) = rest.strip_prefix("#|") {
        match tail.split_once("|#") {
            Some((_, after)) => rest = after,
            None => break,
        }
    }
    rest.to_string()
}

fn hero_entries(catalog: &HeroCatalog) -> Vec<HeroEntry> {
    let names = catalog.names();
    catalog
        .all()
        .iter()
        .map(|hero| {
            let art = catalog.art(hero.id);
            HeroEntry {
                id: hero.id.get(),
                class_name: hero.class_name.clone(),
                name: display_name(names.get(&hero.class_name).unwrap_or(&hero.class_name)),
                localised: catalog.is_localised(hero.id),
                selectable: hero.selectable(),
                in_development: hero.in_development,
                disabled: hero.disabled,
                pre_release: hero.pre_release,
                portrait: art.and_then(|a| a.portrait.clone()),
                card: art.and_then(|a| a.card.clone()),
            }
        })
        .collect()
}

fn item_entries(catalog: &ItemCatalog) -> Vec<ItemEntry> {
    let names = catalog.names();
    catalog
        .all()
        .iter()
        .map(|item| ItemEntry {
            id: item.id.get(),
            class_name: item.class_name.clone(),
            name: display_name(names.get(&item.class_name).unwrap_or(&item.class_name)),
            localised: catalog.is_localised(item.id),
            kind: format!("{:?}", item.kind).to_lowercase(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use deadlock_data::localization::{LocalizationFile, HERO_NAMES_BUNDLE};
    use std::fs;

    struct FakeInstall(Mutex<Option<PathBuf>>);

    impl FakeInstall {
        fn at(dir: &Path) -> Self {
            Self(Mutex::new(Some(dir.to_path_buf())))
        }
        fn none() -> Self {
            Self(Mutex::new(None))
        }
    }

    impl Install for FakeInstall {
        fn citadel_dir(&self) -> Option<PathBuf> {
            self.0.lock().unwrap().clone()
        }
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dp-gamedata-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_hero_names(dir: &Path, language: &str, body: &str) {
        let path = dir.join(LocalizationFile::relative_path(HERO_NAMES_BUNDLE, language));
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, format!("\"lang\"\n{{\n\"Language\" \"{language}\"\n\"Tokens\"\n{{\n{body}\n}}\n}}\n"))
            .unwrap();
    }

    fn fake_archive(dir: &Path) -> PathBuf {
        let path = dir.join("pak01_dir.vpk");
        fs::write(&path, b"not a real archive").unwrap();
        path
    }

    fn find<'a>(list: &'a [HeroEntry], class: &str) -> &'a HeroEntry {
        list.iter().find(|h| h.class_name == class).unwrap_or_else(|| panic!("{class} missing"))
    }

    #[test]
    fn without_an_install_the_bundled_roster_answers_in_english() {
        let data = GameData::new(FakeInstall::none());
        let list = data.heroes("de");
        let inferno = find(&list, "hero_inferno");
        assert_eq!(inferno.id, 1);
        assert_eq!(inferno.name, "Infernus");
    }

    #[test]
    fn the_requested_locale_picks_the_installed_translation() {
        let dir = temp_dir("locale");
        write_hero_names(&dir, "german", "\"hero_inferno\" \"Infernus DE\"");
        write_hero_names(&dir, "english", "\"hero_inferno\" \"Infernus EN\"");
        let data = GameData::new(FakeInstall::at(&dir));
        assert_eq!(find(&data.heroes("de"), "hero_inferno").name, "Infernus DE");
        assert_eq!(find(&data.heroes("en"), "hero_inferno").name, "Infernus EN");
        assert_eq!(find(&data.heroes("af"), "hero_inferno").name, "Infernus EN");
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn gender_markers_are_not_part_of_the_name() {
        let dir = temp_dir("gender");
        write_hero_names(&dir, "russian", "\"hero_inferno\" \"#|m|#Инфернус\"");
        write_hero_names(&dir, "english", "\"hero_inferno\" \"Infernus EN\"");
        let data = GameData::new(FakeInstall::at(&dir));
        assert_eq!(find(&data.heroes("ru"), "hero_inferno").name, "Инфернус");
        assert_eq!(display_name("#|f|##|p|#Name"), "Name");
        assert_eq!(display_name("#|broken"), "#|broken");
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_missing_translation_file_keeps_the_english_name() {
        let dir = temp_dir("missing");
        write_hero_names(&dir, "english", "\"hero_inferno\" \"Infernus EN\"");
        let data = GameData::new(FakeInstall::at(&dir));
        assert_eq!(find(&data.heroes("ja"), "hero_inferno").name, "Infernus EN");
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn art_urls_come_through_from_the_bundled_facet() {
        let data = GameData::new(FakeInstall::none());
        let list = data.heroes("en");
        let inferno = find(&list, "hero_inferno");
        assert!(inferno.portrait.is_some() || inferno.card.is_some());
    }

    #[test]
    fn the_catalog_is_built_once_until_the_archive_changes() {
        let dir = temp_dir("stamp");
        let archive = fake_archive(&dir);
        let data = GameData::new(FakeInstall::at(&dir));
        data.heroes("en");
        data.heroes("de");
        data.items("en");
        assert_eq!(data.builds(), 1);

        let file = fs::OpenOptions::new().write(true).open(&archive).unwrap();
        file.set_modified(SystemTime::now() + std::time::Duration::from_secs(60)).unwrap();
        drop(file);
        data.heroes("en");
        assert_eq!(data.builds(), 2);
        data.heroes("en");
        assert_eq!(data.builds(), 2);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_new_install_is_picked_up_after_none() {
        let dir = temp_dir("late");
        write_hero_names(&dir, "english", "\"hero_inferno\" \"Infernus Installed\"");
        fake_archive(&dir);
        let data = GameData::new(FakeInstall::none());
        assert_eq!(find(&data.heroes("en"), "hero_inferno").name, "Infernus");
        *data.shared.install.0.lock().unwrap() = Some(dir.clone());
        assert_eq!(find(&data.heroes("en"), "hero_inferno").name, "Infernus Installed");
        fs::remove_dir_all(dir).ok();
    }

    fn installed_roster() -> ItemCatalog {
        ItemCatalog::from_json(
            r#"[
                {"id": 3681399397, "class_name": "ability_ratking_ratnibble", "name": "ability_ratking_ratnibble", "type": "ability"},
                {"id": 690412829, "class_name": "ability_ratking_ratarmor", "name": "ability_ratking_ratarmor", "type": "ability"},
                {"id": 1548066885, "class_name": "upgrade_clip_size", "name": "upgrade_clip_size", "type": "weapon"}
            ]"#,
        )
        .unwrap()
    }

    #[test]
    fn abilities_of_heroes_released_after_the_snapshot_are_added_from_the_installed_roster() {
        let mut catalog = ItemCatalog::bundled();
        assert!(catalog.by_class_name("ability_ratking_ratnibble").is_none());
        let added = add_missing(&mut catalog, &installed_roster());
        assert_eq!(added, 2);
        let item = catalog.by_class_name("ability_ratking_ratnibble").unwrap();
        assert_eq!(item.id.get(), 3681399397);
        assert_eq!(catalog.get(item.id).unwrap().class_name, "ability_ratking_ratnibble");
    }

    #[test]
    fn rows_the_snapshot_already_has_are_left_alone() {
        let mut catalog = ItemCatalog::bundled();
        let before = catalog.by_class_name("upgrade_clip_size").unwrap().clone();
        add_missing(&mut catalog, &installed_roster());
        assert_eq!(catalog.by_class_name("upgrade_clip_size").unwrap(), &before);
    }

    #[test]
    #[ignore = "needs an installed game; set DEADLOCK_CITADEL_DIR"]
    fn the_installed_game_names_abilities_of_new_heroes() {
        let dir = PathBuf::from(std::env::var("DEADLOCK_CITADEL_DIR").expect("set DEADLOCK_CITADEL_DIR"));
        let data = GameData::new(FakeInstall::at(&dir));
        let items = data.items("en");
        for (class, name) in [
            ("ability_ratking_ratnibble", "Rat Swarm"),
            ("ability_baba_hexing_brew", "Baba's Brew"),
            ("ability_chessmaster_queen", "Develop Queen"),
        ] {
            let entry = items.iter().find(|i| i.class_name == class).unwrap_or_else(|| panic!("{class} missing"));
            assert_eq!(entry.name, name);
            assert!(entry.localised);
        }
        let accolades = data.accolades("en");
        assert!(accolades.len() >= 31, "only {} accolades", accolades.len());
        assert_eq!(accolades.iter().find(|a| a.id == 24).map(|a| a.name.as_str()), Some("The Zapper"));
        assert!(data.accolades("de").iter().any(|a| a.id == 24));
        let zapper = accolades.iter().find(|a| a.id == 24).unwrap();
        assert!(zapper.description.as_deref().is_some_and(|d| d.contains("stat_value")));
        assert_eq!(zapper.tracked_stat.as_deref(), Some("ability_damage"));
    }

    #[test]
    #[ignore = "needs an installed game; set DEADLOCK_CITADEL_DIR"]
    fn the_installed_game_files_solomons_abilities_as_abilities_and_shop_items_as_upgrades() {
        let dir = PathBuf::from(std::env::var("DEADLOCK_CITADEL_DIR").expect("set DEADLOCK_CITADEL_DIR"));
        let items = GameData::new(FakeInstall::at(&dir)).items("en");
        let kind = |id: u32| items.iter().find(|i| i.id == id).map(|i| i.kind.as_str());
        for id in [1389230689, 2424652896, 4011110259, 4180486641] {
            assert_eq!(kind(id), Some("ability"), "chessmaster ability {id}");
        }
        assert_eq!(kind(1998374645), Some("upgrade"));
        assert!(items.iter().filter(|i| i.class_name.starts_with("upgrade_")).all(|i| i.kind != "ability"));
    }

    fn accolade(id: u32, key: &str, token: Option<&str>) -> Accolade {
        Accolade {
            id,
            key: key.to_string(),
            tracked_stat: None,
            flavor_token: token.map(str::to_string),
            description_token: None,
        }
    }

    fn bundle(language: &str, body: &str) -> LocalizationFile {
        LocalizationFile::parse(
            &format!(
                "\"lang\"
{{
\"Tokens\"
{{
{body}
}}
}}
"
            ),
            language,
        )
    }

    #[test]
    fn accolade_ids_resolve_to_their_flavour_names() {
        let defs = [
            accolade(24, "ability_damage", Some("Citadel_VData_accolades_ability_damage_FlavorName")),
            accolade(1, "kills", Some("Citadel_VData_accolades_kills_FlavorName")),
        ];
        let loc = bundle(
            "english",
            "\"Citadel_VData_accolades_ability_damage_FlavorName\" \"The Zapper\"
\"Citadel_VData_accolades_kills_FlavorName\" \"Killer Instinct\"",
        );
        let names = accolade_entries(&defs, Some(&loc), None);
        assert_eq!(
            names,
            vec![
                AccoladeEntry { id: 24, name: "The Zapper".into(), description: None, tracked_stat: None },
                AccoladeEntry { id: 1, name: "Killer Instinct".into(), description: None, tracked_stat: None },
            ]
        );
    }

    #[test]
    fn a_token_missing_in_the_language_falls_back_to_english_and_unnamed_ones_are_left_out() {
        let defs = [
            accolade(24, "ability_damage", Some("Citadel_VData_accolades_ability_damage_FlavorName")),
            accolade(1, "kills", Some("Citadel_VData_accolades_kills_FlavorName")),
            accolade(99, "mystery", None),
        ];
        let german = bundle("german", "\"Citadel_VData_accolades_kills_FlavorName\" \"Killerinstinkt\"");
        let english = bundle("english", "\"Citadel_VData_accolades_ability_damage_FlavorName\" \"The Zapper\"");
        let names = accolade_entries(&defs, Some(&german), Some(&english));
        assert_eq!(
            names,
            vec![
                AccoladeEntry { id: 24, name: "The Zapper".into(), description: None, tracked_stat: None },
                AccoladeEntry { id: 1, name: "Killerinstinkt".into(), description: None, tracked_stat: None },
            ]
        );
    }

    #[test]
    fn accolades_carry_their_description_template_and_tracked_stat() {
        let defs = [Accolade {
            id: 1,
            key: "kills".into(),
            tracked_stat: Some("kills".into()),
            flavor_token: Some("Citadel_VData_accolades_kills_FlavorName".into()),
            description_token: Some("Citadel_VData_accolades_kills_Description:f".into()),
        }];
        let english = bundle(
            "english",
            "\"Citadel_VData_accolades_kills_FlavorName\" \"Killer Instinct\"
\"Citadel_VData_accolades_kills_Description:f\" \"{stat_value} kills\"",
        );
        let entries = accolade_entries(&defs, Some(&english), None);
        assert_eq!(entries[0].description.as_deref(), Some("{stat_value} kills"));
        assert_eq!(entries[0].tracked_stat.as_deref(), Some("kills"));
    }

    #[test]
    fn an_accolade_without_a_description_token_has_no_description() {
        let defs = [accolade(1, "kills", Some("Citadel_VData_accolades_kills_FlavorName"))];
        let english = bundle("english", "\"Citadel_VData_accolades_kills_FlavorName\" \"Killer Instinct\"");
        assert_eq!(accolade_entries(&defs, Some(&english), None)[0].description, None);
    }

    #[test]
    fn a_description_missing_in_the_language_falls_back_to_english() {
        let defs = [Accolade { description_token: Some("Desc".into()), ..accolade(1, "kills", Some("Flavor")) }];
        let german = bundle("german", "\"Flavor\" \"Killerinstinkt\"");
        let english = bundle(
            "english",
            "\"Flavor\" \"Killer\"
\"Desc\" \"{stat_value} kills\"",
        );
        let entries = accolade_entries(&defs, Some(&german), Some(&english));
        assert_eq!(entries[0].name, "Killerinstinkt");
        assert_eq!(entries[0].description.as_deref(), Some("{stat_value} kills"));
    }

    #[test]
    fn escaped_quotes_stay_inside_a_localised_value() {
        let text = "\"lang\"
{
\"Tokens\"
{
	\"Desc:f\"	\"<span class=\\\"StatValue\\\">{stat_value}</span> kills\"
	\"Name\"	\"Zapper\"
}
}
";
        let file = parse_escaped_bundle(text, "english");
        assert_eq!(file.get("Desc"), Some("<span class=\"StatValue\">{stat_value}</span> kills"));
        assert_eq!(file.get("Name"), Some("Zapper"));
    }

    #[test]
    fn without_an_install_the_bundled_cc_set_answers() {
        let data = GameData::new(FakeInstall::none());
        let set = data.cc_abilities();
        assert!(set.contains("ability_necro_gravestone"));
        assert_eq!(set.fingerprint(), CcSet::bundled().fingerprint());
    }

    #[test]
    fn an_install_that_cannot_be_read_keeps_the_bundled_cc_set() {
        let dir = temp_dir("cc-unreadable");
        fake_archive(&dir);
        let data = GameData::new(FakeInstall::at(&dir));
        assert_eq!(*data.cc_abilities(), CcSet::bundled());
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn the_cc_set_is_built_once_per_game_build() {
        let data = GameData::new(FakeInstall::none());
        let first = data.cc_abilities();
        assert!(Arc::ptr_eq(&first, &data.cc_abilities()));
    }

    #[test]
    #[ignore = "needs an installed game; set DEADLOCK_CITADEL_DIR"]
    fn the_installed_cc_set_replaces_the_bundled_one() {
        let dir = PathBuf::from(std::env::var("DEADLOCK_CITADEL_DIR").expect("set DEADLOCK_CITADEL_DIR"));
        let set = GameData::new(FakeInstall::at(&dir)).cc_abilities();
        assert!(set.contains("ability_necro_gravestone"));
        assert!(!set.contains("citadel_ability_tangotether"));
    }

    #[test]
    fn items_are_named_and_typed() {
        let data = GameData::new(FakeInstall::none());
        let items = data.items("en");
        assert!(items.len() > 100);
        assert!(items.iter().any(|i| i.kind == "upgrade" && i.localised));
        assert!(items.iter().any(|i| i.kind == "ability"));
    }
}
