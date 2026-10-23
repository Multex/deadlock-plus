use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

use serde::Serialize;
use source2_kv3::{Document, Object, Value};
use ts_rs::TS;

use crate::catalog::{archive_stamp, Install, SteamInstall};
use crate::hero_stats::{hero_bullet_damage, hero_stats, HeroStatsData};
use crate::vpk_source::VpkVdataSource;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct LevelInfo {
    pub level: u32,
    /// Souls needed to reach this level.
    pub souls: u32,
    /// Ability points gained at this level, not the running total.
    pub ap: u32,
    /// Ability unlocks gained at this level, not the running total.
    pub unlocks: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct HeroProgression {
    pub levels: Vec<LevelInfo>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PopularItem {
    pub id: u32,
    pub class_name: String,
    pub pick_pct: f32,
    pub win_pct: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PopularItems {
    /// Unix seconds of the stats the game shipped with.
    pub timestamp: u32,
    pub early_game: Vec<PopularItem>,
    pub mid_game: Vec<PopularItem>,
    pub late_game: Vec<PopularItem>,
}

/// The id Source 2 gives a class name (`CUtlStringToken`): MurmurHash2, seed `0x31415926`, over the ASCII-lowercased
/// name. Builds store ability and item ids this way.
pub fn ability_id(class_name: &str) -> u32 {
    const M: u32 = 0x5bd1_e995;
    let data: Vec<u8> = class_name.bytes().map(|b| b.to_ascii_lowercase()).collect();
    let mut h = 0x3141_5926 ^ data.len() as u32;
    let (chunks, tail) = data.as_chunks::<4>();
    for chunk in chunks {
        let mut k = u32::from_le_bytes(*chunk).wrapping_mul(M);
        k ^= k >> 24;
        h = h.wrapping_mul(M) ^ k.wrapping_mul(M);
    }
    if !tail.is_empty() {
        for (i, b) in tail.iter().enumerate() {
            h ^= u32::from(*b) << (8 * i);
        }
        h = h.wrapping_mul(M);
    }
    h ^= h >> 13;
    h = h.wrapping_mul(M);
    h ^ (h >> 15)
}

/// Compiled vdata repeats the inherited table in every hero; `hero_base` is the one they all inherit.
pub fn hero_progression(heroes: &Object) -> Option<HeroProgression> {
    let table = heroes.get("hero_base")?.get("m_mapLevelInfo")?.as_object()?;
    let mut levels: Vec<LevelInfo> = table
        .iter()
        .filter_map(|(key, info)| {
            let bonus = |currency: &str| {
                info.get("m_mapBonusCurrencies").and_then(|b| b.get(currency)).and_then(Value::as_u32).unwrap_or(0)
            };
            Some(LevelInfo {
                level: key.parse().ok()?,
                souls: info.get("m_unRequiredGold").and_then(Value::as_u32).unwrap_or(0),
                ap: bonus("EAbilityPoints"),
                unlocks: bonus("EAbilityUnlocks"),
            })
        })
        .collect();
    levels.sort_by_key(|l| l.level);
    Some(HeroProgression { levels })
}

fn heroes_by_id(heroes: &Object) -> impl Iterator<Item = (u32, &Value)> {
    heroes.values().filter_map(|hero| {
        let id = hero.get("m_HeroID").and_then(Value::as_u32).filter(|id| *id != 0)?;
        Some((id, hero))
    })
}

/// Signature slots 1 to 4 per hero id; slot 4 is the ultimate.
pub fn hero_abilities(heroes: &Object) -> HashMap<u32, [u32; 4]> {
    heroes_by_id(heroes)
        .filter_map(|(id, hero)| {
            let slots = hero.get("m_mapBoundAbilities")?;
            let slot = |n: usize| slots.get(&format!("ESlot_Signature_{n}")).and_then(Value::as_str).map(ability_id);
            Some((id, [slot(1)?, slot(2)?, slot(3)?, slot(4)?]))
        })
        .collect()
}

/// Heroes whose popularity the game ships empty (unreleased ones) are left out.
pub fn popular_items(heroes: &Object) -> HashMap<u32, PopularItems> {
    heroes_by_id(heroes)
        .filter_map(|(id, hero)| {
            let popular = hero.get("m_PopularItems")?;
            let phases = popular.get("m_mapGeneratedItemPopularity")?.as_object().filter(|p| !p.is_empty())?;
            let phase = |name: &str| phases.get(name).map(phase_items).unwrap_or_default();
            Some((
                id,
                PopularItems {
                    timestamp: popular.get("m_unTimestamp").and_then(Value::as_u32).unwrap_or(0),
                    early_game: phase("ECitadelItemGamePhase_EarlyGame"),
                    mid_game: phase("ECitadelItemGamePhase_MidGame"),
                    late_game: phase("ECitadelItemGamePhase_LateGame"),
                },
            ))
        })
        .collect()
}

fn phase_items(phase: &Value) -> Vec<PopularItem> {
    let Some(items) = phase.as_object() else { return Vec::new() };
    items
        .iter()
        .map(|(class_name, stats)| {
            let pct = |key: &str| stats.get(key).and_then(Value::to_f32_lossy).unwrap_or(0.0);
            PopularItem {
                id: ability_id(class_name),
                class_name: class_name.to_string(),
                pick_pct: pct("m_flPickPct"),
                win_pct: pct("m_flWinratePct"),
            }
        })
        .collect()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct HeroAbilities {
    pub hero_id: u32,
    /// Signature slots 1 to 4; the last is the ultimate.
    pub ability_ids: [u32; 4],
}

#[derive(Debug, Clone, PartialEq)]
pub struct HeroTable {
    pub progression: HeroProgression,
    pub abilities: HashMap<u32, [u32; 4]>,
    pub popular_items: HashMap<u32, PopularItems>,
    pub stats: HashMap<u32, HeroStatsData>,
}

impl HeroTable {
    pub fn ability_list(&self) -> Vec<HeroAbilities> {
        let mut list: Vec<HeroAbilities> =
            self.abilities.iter().map(|(&hero_id, &ability_ids)| HeroAbilities { hero_id, ability_ids }).collect();
        list.sort_by_key(|h| h.hero_id);
        list
    }

    pub fn from_document(doc: &Document) -> Result<Self, String> {
        Self::from_documents(doc, None)
    }

    /// `abilities` supplies the weapon numbers; without it every hero's `bullet_damage` stays None.
    pub fn from_documents(doc: &Document, abilities: Option<&Document>) -> Result<Self, String> {
        let heroes = doc.root.as_object().ok_or("heroes.vdata: root is not an object")?;
        let progression = hero_progression(heroes).ok_or("heroes.vdata: hero_base has no level table")?;
        let mut stats = hero_stats(heroes);
        if let Some(abilities) = abilities.and_then(|doc| doc.root.as_object()) {
            for (hero_id, damage) in hero_bullet_damage(heroes, abilities) {
                if let Some(entry) = stats.get_mut(&hero_id) {
                    entry.bullet_damage = Some(damage);
                }
            }
        }
        Ok(Self { progression, abilities: hero_abilities(heroes), popular_items: popular_items(heroes), stats })
    }
}

pub trait HeroesSource: Send + Sync + 'static {
    /// `scripts/heroes.vdata_c` of the install in `citadel_dir`, as a KV3 document.
    fn read(&self, citadel_dir: &Path) -> Result<Document, String>;

    /// `scripts/abilities.vdata_c` of the same install.
    fn read_abilities(&self, citadel_dir: &Path) -> Result<Document, String>;
}

type Memo = (Option<PathBuf>, Option<SystemTime>, Option<Arc<HeroTable>>);

pub struct HeroVdata<I: Install = SteamInstall, S: HeroesSource = VpkVdataSource> {
    install: I,
    source: S,
    /// Results, bad data included, are kept until the install or its build changes; failed reads are not.
    memo: Mutex<Option<Memo>>,
}

impl Default for HeroVdata {
    fn default() -> Self {
        Self::new(SteamInstall, VpkVdataSource)
    }
}

impl<I: Install, S: HeroesSource> HeroVdata<I, S> {
    pub fn new(install: I, source: S) -> Self {
        Self { install, source, memo: Mutex::new(None) }
    }

    pub fn table(&self) -> Option<Arc<HeroTable>> {
        let dir = self.install.citadel_dir();
        let stamp = dir.as_deref().and_then(archive_stamp);
        let mut memo = self.memo.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((d, s, table)) = memo.as_ref() {
            if *d == dir && *s == stamp {
                return table.clone();
            }
        }
        let mut read_failed = false;
        let table = dir.as_deref().and_then(|dir| {
            let abilities = self.source.read_abilities(dir).map_err(|e| log::warn!("hero weapons unavailable: {e}"));
            let heroes = self.source.read(dir).map_err(|e| log::warn!("hero progression unavailable: {e}"));
            read_failed = abilities.is_err() || heroes.is_err();
            HeroTable::from_documents(&heroes.ok()?, abilities.ok().as_ref())
                .map_err(|e| log::warn!("hero progression unavailable: {e}"))
                .ok()
                .map(Arc::new)
        });
        *memo = if read_failed { None } else { Some((dir, stamp, table.clone())) };
        table
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn root(text: &str) -> Object {
        Document::from_text(text).unwrap().root.as_object().unwrap().clone()
    }

    fn level_block(level: u32, souls: u32, bonus: &str) -> String {
        format!(
            "\"{level}\" = {{ m_unRequiredGold = {souls} m_bUseStandardUpgrade = true m_mapBonusCurrencies = {{ {bonus} = 1 }} }}"
        )
    }

    /// The level table of `scripts/heroes.vdata_c` `hero_base` on game build 6805.
    const SOULS_6805: [u32; 36] = [
        0, 200, 500, 900, 1400, 2000, 2600, 3200, 3900, 4600, 5300, 6000, 6800, 7600, 8400, 9200, 10100, 11000, 11900,
        12800, 13800, 14900, 16100, 17400, 18900, 20600, 22500, 24600, 26900, 29400, 32100, 35000, 38100, 41400, 44900,
        48600,
    ];
    const UNLOCK_LEVELS_6805: [u32; 4] = [1, 3, 5, 8];

    fn heroes_6805_shape() -> String {
        // Written out of order: the file keys levels by string, and "10" sorts before "2".
        let mut levels: Vec<String> = SOULS_6805
            .iter()
            .enumerate()
            .map(|(i, souls)| {
                let level = i as u32 + 1;
                let bonus = if UNLOCK_LEVELS_6805.contains(&level) { "EAbilityUnlocks" } else { "EAbilityPoints" };
                level_block(level, *souls, bonus)
            })
            .collect();
        levels.sort();
        format!(
            "{{
                generic_data_type = \"CitadelHeroData_t\"
                hero_base = {{ m_HeroID = 0 m_mapLevelInfo = {{ {levels} }} }}
                hero_inferno = {{
                    m_HeroID = 1
                    m_mapBoundAbilities = {{
                        ESlot_Weapon_Primary = \"citadel_weapon_inferno_set\"
                        ESlot_Ability_Innate_1 = \"citadel_ability_dash\"
                        ESlot_Signature_4 = \"ability_fire_bomb\"
                        ESlot_Signature_1 = \"ability_incendiary_projectile\"
                        ESlot_Signature_2 = \"ability_flame_dash\"
                        ESlot_Signature_3 = \"ability_afterburn\"
                    }}
                    m_PopularItems = {{
                        m_unTimestamp = 1790702781
                        m_mapGeneratedItemPopularity = {{
                            ECitadelItemGamePhase_EarlyGame = {{
                                upgrade_clip_size = {{ m_flPickPct = 60.34076 m_flWinratePct = 50.475616 }}
                                upgrade_rapid_rounds = {{ m_flPickPct = 66.79318 m_flWinratePct = 49.884293 }}
                            }}
                            ECitadelItemGamePhase_MidGame = {{
                                upgrade_arcane_extension = {{ m_flPickPct = 53.275845 m_flWinratePct = 50.481747 }}
                            }}
                            ECitadelItemGamePhase_LateGame = {{ }}
                        }}
                    }}
                }}
                hero_kali = {{
                    m_HeroID = 21
                    m_mapBoundAbilities = {{
                        ESlot_Signature_1 = \"citadel_ability_kali_spinning_blade\"
                        ESlot_Signature_2 = \"citadel_ability_kali_disruptive_charge\"
                        ESlot_Signature_3 = \"ability_kali_dust_storm\"
                    }}
                    m_PopularItems = {{ m_unTimestamp = 1790702781 m_mapGeneratedItemPopularity = {{ }} }}
                }}
            }}",
            levels = levels.join(" ")
        )
    }

    #[test]
    fn levels_come_out_in_numeric_order_with_their_bonuses() {
        let progression = hero_progression(&root(&heroes_6805_shape())).expect("hero_base has a level table");
        assert_eq!(progression.levels.len(), 36);
        assert_eq!(progression.levels[0], LevelInfo { level: 1, souls: 0, ap: 0, unlocks: 1 });
        assert_eq!(progression.levels[1], LevelInfo { level: 2, souls: 200, ap: 1, unlocks: 0 });
        assert_eq!(progression.levels[9], LevelInfo { level: 10, souls: 4600, ap: 1, unlocks: 0 });
        assert!(progression.levels.windows(2).all(|w| w[0].level + 1 == w[1].level));
    }

    #[test]
    fn the_level_table_matches_the_known_unlock_and_ap_facts() {
        let progression = hero_progression(&root(&heroes_6805_shape())).unwrap();
        let unlock_souls: Vec<u32> = progression.levels.iter().filter(|l| l.unlocks > 0).map(|l| l.souls).collect();
        assert_eq!(unlock_souls, [0, 500, 1400, 3200]);
        let last = progression.levels.last().unwrap();
        assert_eq!(last.souls, 48_600);
        assert_eq!(progression.levels.iter().map(|l| l.ap).sum::<u32>(), 32);
        assert!(progression.levels.iter().all(|l| (l.ap == 1) != (l.unlocks == 1)));
    }

    #[test]
    fn a_missing_level_table_is_none() {
        assert_eq!(hero_progression(&root("{ hero_base = { m_HeroID = 0 } }")), None);
        assert_eq!(hero_progression(&root("{ generic_data_type = \"CitadelHeroData_t\" }")), None);
    }

    #[test]
    fn a_level_without_a_bonus_gains_nothing() {
        let progression =
            hero_progression(&root("{ hero_base = { m_mapLevelInfo = { \"1\" = { m_unRequiredGold = 0 } } } }"))
                .unwrap();
        assert_eq!(progression.levels, [LevelInfo { level: 1, souls: 0, ap: 0, unlocks: 0 }]);
    }

    #[test]
    fn ability_ids_hash_the_lowercased_class_name() {
        // Ids as the game's builds store them; the snapshot builds' ability orders use exactly these.
        assert_eq!(ability_id("upgrade_clip_size"), 1_548_066_885);
        assert_eq!(ability_id("gunslinger_demonMark"), 3_673_718_559);
        assert_eq!(ability_id("Upgrade_Clip_Size"), ability_id("upgrade_clip_size"));
        assert_ne!(ability_id("a"), ability_id("ab"));
    }

    #[test]
    fn three_heroes_ability_ids_match_the_game() {
        let ids = |names: [&str; 4]| names.map(ability_id);
        assert_eq!(
            ids(["ability_incendiary_projectile", "ability_flame_dash", "ability_afterburn", "ability_fire_bomb"]),
            [491_391_007, 3_516_947_824, 1_593_133_799, 1_142_270_357]
        );
        assert_eq!(
            ids([
                "citadel_ability_lightning_ball",
                "citadel_ability_static_charge",
                "ability_power_surge",
                "citadel_ability_storm_cloud"
            ]),
            [1_065_103_387, 1_074_714_947, 539_192_269, 2_061_574_352]
        );
        assert_eq!(
            ids([
                "ability_chessmaster_throwbishop",
                "ability_chessmaster_knightbuff",
                "ability_chessmaster_forkpiece",
                "ability_chessmaster_queen"
            ]),
            [4_011_110_259, 4_180_486_641, 2_424_652_896, 1_389_230_689]
        );
    }

    #[test]
    fn signature_slots_map_to_ability_ids_with_the_ultimate_last() {
        let abilities = hero_abilities(&root(&heroes_6805_shape()));
        assert_eq!(abilities.get(&1), Some(&[491_391_007, 3_516_947_824, 1_593_133_799, 1_142_270_357]));
    }

    #[test]
    fn heroes_without_all_four_signatures_and_the_base_are_left_out() {
        let abilities = hero_abilities(&root(&heroes_6805_shape()));
        assert_eq!(abilities.len(), 1);
        assert!(!abilities.contains_key(&21));
        assert!(!abilities.contains_key(&0));
    }

    #[test]
    fn popular_items_keep_each_phase_with_pick_and_win_rates() {
        let popular = popular_items(&root(&heroes_6805_shape()));
        let inferno = popular.get(&1).expect("Infernus has popular items");
        assert_eq!(inferno.timestamp, 1_790_702_781);
        assert_eq!(
            inferno.early_game,
            [
                PopularItem {
                    id: 1_548_066_885,
                    class_name: "upgrade_clip_size".into(),
                    pick_pct: 60.34076,
                    win_pct: 50.475616
                },
                PopularItem {
                    id: ability_id("upgrade_rapid_rounds"),
                    class_name: "upgrade_rapid_rounds".into(),
                    pick_pct: 66.79318,
                    win_pct: 49.884293
                },
            ]
        );
        assert_eq!(inferno.mid_game.len(), 1);
        assert_eq!(inferno.mid_game[0].class_name, "upgrade_arcane_extension");
        assert!(inferno.late_game.is_empty());
    }

    #[test]
    fn heroes_with_no_generated_popularity_have_no_entry() {
        let popular = popular_items(&root(&heroes_6805_shape()));
        assert_eq!(popular.len(), 1);
        assert!(!popular.contains_key(&21));
    }

    #[test]
    fn a_table_reads_all_three_parts_from_one_document() {
        let table = HeroTable::from_document(&Document::from_text(&heroes_6805_shape()).unwrap()).unwrap();
        assert_eq!(table.progression.levels.len(), 36);
        assert_eq!(table.abilities.len(), 1);
        assert_eq!(table.popular_items.len(), 1);
    }

    #[test]
    fn a_table_carries_every_hero_s_stats() {
        let table = HeroTable::from_document(&Document::from_text(&heroes_6805_shape()).unwrap()).unwrap();
        let mut ids: Vec<u32> = table.stats.keys().copied().collect();
        ids.sort();
        assert_eq!(ids, [1, 21]);
        assert_eq!(table.stats[&21].hero_id, 21);
    }

    const ABILITIES_SHAPE: &str = "{
        citadel_weapon_inferno_set = { m_mapWeaponInfos = { primary = { m_flBulletDamage = 5.5 } } }
        citadel_weapon_other = { m_mapWeaponInfos = { primary = { m_flBulletDamage = 9 } } }
    }";

    fn heroes_with_weapons() -> Document {
        Document::from_text(&heroes_6805_shape()).unwrap()
    }

    #[test]
    fn a_table_fills_bullet_damage_from_the_abilities_document() {
        let abilities = Document::from_text(ABILITIES_SHAPE).unwrap();
        let table = HeroTable::from_documents(&heroes_with_weapons(), Some(&abilities)).unwrap();
        assert_eq!(table.stats[&1].bullet_damage, Some(5.5));
        assert_eq!(table.stats[&21].bullet_damage, None);
    }

    #[test]
    fn a_table_without_abilities_leaves_bullet_damage_unset() {
        let table = HeroTable::from_documents(&heroes_with_weapons(), None).unwrap();
        assert_eq!(table.stats[&1].bullet_damage, None);
    }

    #[test]
    fn the_source_s_abilities_reach_the_table() {
        let dir = temp_install("abilities");
        let (data, _) = vdata(Some(&dir), Some(heroes_6805_shape()));
        assert_eq!(data.table().unwrap().stats[&1].bullet_damage, Some(5.5));
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn the_ability_list_is_sorted_by_hero_id() {
        let mut table = HeroTable::from_document(&Document::from_text(&heroes_6805_shape()).unwrap()).unwrap();
        table.abilities.insert(21, [5, 6, 7, 8]);
        table.abilities.insert(2, [1, 2, 3, 4]);
        let list = table.ability_list();
        assert_eq!(list.iter().map(|h| h.hero_id).collect::<Vec<_>>(), [1, 2, 21]);
        assert_eq!(list[1], HeroAbilities { hero_id: 2, ability_ids: [1, 2, 3, 4] });
    }

    #[test]
    fn a_document_without_a_level_table_is_an_error() {
        let doc = Document::from_text("{ hero_inferno = { m_HeroID = 1 } }").unwrap();
        assert!(HeroTable::from_document(&doc).is_err());
    }

    struct FakeInstall(Mutex<Option<PathBuf>>);

    impl Install for FakeInstall {
        fn citadel_dir(&self) -> Option<PathBuf> {
            self.0.lock().unwrap().clone()
        }
    }

    struct FakeSource {
        reads: Arc<AtomicUsize>,
        text: Mutex<Option<String>>,
        abilities: Mutex<bool>,
    }

    impl HeroesSource for FakeSource {
        fn read(&self, _citadel_dir: &Path) -> Result<Document, String> {
            self.reads.fetch_add(1, Ordering::Relaxed);
            let text = self.text.lock().unwrap().clone().ok_or("no archive")?;
            Document::from_text(&text).map_err(|e| e.to_string())
        }

        fn read_abilities(&self, _citadel_dir: &Path) -> Result<Document, String> {
            if !*self.abilities.lock().unwrap() {
                return Err("abilities locked".into());
            }
            Document::from_text(ABILITIES_SHAPE).map_err(|e| e.to_string())
        }
    }

    fn temp_install(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dp-gamedata-progression-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("pak01_dir.vpk"), b"not a real archive").unwrap();
        dir
    }

    fn vdata(dir: Option<&Path>, text: Option<String>) -> (HeroVdata<FakeInstall, FakeSource>, Arc<AtomicUsize>) {
        let reads = Arc::new(AtomicUsize::new(0));
        let install = FakeInstall(Mutex::new(dir.map(Path::to_path_buf)));
        let source = FakeSource { reads: Arc::clone(&reads), text: Mutex::new(text), abilities: Mutex::new(true) };
        (HeroVdata::new(install, source), reads)
    }

    #[test]
    fn the_table_is_read_once_until_the_archive_changes() {
        let dir = temp_install("stamp");
        let (data, reads) = vdata(Some(&dir), Some(heroes_6805_shape()));
        let first = data.table().expect("the fake install has a table");
        assert!(Arc::ptr_eq(&first, &data.table().unwrap()));
        assert_eq!(reads.load(Ordering::Relaxed), 1);

        let file = fs::OpenOptions::new().write(true).open(dir.join("pak01_dir.vpk")).unwrap();
        file.set_modified(SystemTime::now() + std::time::Duration::from_secs(60)).unwrap();
        drop(file);
        data.table();
        assert_eq!(reads.load(Ordering::Relaxed), 2);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn without_an_install_there_is_no_table_and_nothing_is_read() {
        let (data, reads) = vdata(None, Some(heroes_6805_shape()));
        assert_eq!(data.table(), None);
        assert_eq!(reads.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn a_failed_heroes_read_is_retried_for_the_same_build() {
        let dir = temp_install("failed");
        let (data, reads) = vdata(Some(&dir), None);
        assert_eq!(data.table(), None);
        assert_eq!(reads.load(Ordering::Relaxed), 1);
        *data.source.text.lock().unwrap() = Some(heroes_6805_shape());
        assert!(data.table().is_some());
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_failed_abilities_read_is_retried_for_the_same_build() {
        let dir = temp_install("failed-abilities");
        let (data, _) = vdata(Some(&dir), Some(heroes_6805_shape()));
        *data.source.abilities.lock().unwrap() = false;
        assert_eq!(data.table().unwrap().stats[&1].bullet_damage, None);
        *data.source.abilities.lock().unwrap() = true;
        assert_eq!(data.table().unwrap().stats[&1].bullet_damage, Some(5.5));
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_heroes_file_without_a_level_table_is_not_read_again_for_the_same_build() {
        let dir = temp_install("no-levels");
        let (data, reads) = vdata(Some(&dir), Some("{ hero_inferno = { m_HeroID = 1 } }".into()));
        assert_eq!(data.table(), None);
        assert_eq!(data.table(), None);
        assert_eq!(reads.load(Ordering::Relaxed), 1);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_new_install_is_picked_up_after_none() {
        let dir = temp_install("late");
        let (data, _) = vdata(None, Some(heroes_6805_shape()));
        assert_eq!(data.table(), None);
        *data.install.0.lock().unwrap() = Some(dir.clone());
        assert!(data.table().is_some());
        fs::remove_dir_all(dir).ok();
    }
}
