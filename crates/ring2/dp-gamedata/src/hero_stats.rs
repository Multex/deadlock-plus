use std::collections::{BTreeMap, HashMap};

use serde::Serialize;
use source2_kv3::{Object, Value};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct InvestmentTier {
    /// Souls spent on the slot to reach this tier.
    pub souls: u32,
    pub bonus: f64,
    pub percent_on_graph: f64,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct SlotInvestment {
    pub weapon: Vec<InvestmentTier>,
    pub spirit: Vec<InvestmentTier>,
    pub vitality: Vec<InvestmentTier>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct HeroStatsData {
    pub hero_id: u32,
    /// `m_mapStartingStats`, keyed by the game's stat enum (`EMaxHealth`).
    pub base: BTreeMap<String, f64>,
    /// `m_mapStandardLevelUpUpgrades`, keyed `MODIFIER_VALUE_*`, gained on every level.
    pub per_level: BTreeMap<String, f64>,
    /// `m_MapModCostBonuses`: `EItemSlotType_WeaponMod` -> weapon, `_Tech` -> spirit, `_Armor` -> vitality.
    pub investment: SlotInvestment,
    /// The primary weapon's `m_mapWeaponInfos.primary.m_flBulletDamage` from the abilities vdata ([`hero_bullet_damage`]); None until it is read.
    pub bullet_damage: Option<f64>,
}

/// Every playable hero's stats; a hero's own entries override `hero_base`'s.
pub fn hero_stats(heroes: &Object) -> HashMap<u32, HeroStatsData> {
    heroes
        .values()
        .filter_map(|hero| {
            let hero_id = hero.get("m_HeroID").and_then(Value::as_u32).filter(|id| *id != 0)?;
            let lineage = lineage(heroes, hero);
            let slot = |slot_type: &str| investment_tiers(&lineage, slot_type);
            Some((
                hero_id,
                HeroStatsData {
                    hero_id,
                    base: merged_numbers(&lineage, "m_mapStartingStats"),
                    per_level: merged_numbers(&lineage, "m_mapStandardLevelUpUpgrades"),
                    investment: SlotInvestment {
                        weapon: slot("EItemSlotType_WeaponMod"),
                        spirit: slot("EItemSlotType_Tech"),
                        vitality: slot("EItemSlotType_Armor"),
                    },
                    bullet_damage: None,
                },
            ))
        })
        .collect()
}

/// Base bullet damage per hero, from the `ESlot_Weapon_Primary` ability `heroes` binds and its `primary` weapon info in
/// `abilities` (`scripts/abilities.vdata_c`). Heroes whose weapon has no bullet damage are left out.
pub fn hero_bullet_damage(heroes: &Object, abilities: &Object) -> HashMap<u32, f64> {
    heroes
        .values()
        .filter_map(|hero| {
            let hero_id = hero.get("m_HeroID").and_then(Value::as_u32).filter(|id| *id != 0)?;
            let weapon = lineage(heroes, hero)
                .iter()
                .rev()
                .find_map(|entry| entry.get("m_mapBoundAbilities")?.get("ESlot_Weapon_Primary")?.as_str())?;
            let damage = abilities
                .get(weapon)?
                .get("m_mapWeaponInfos")?
                .get("primary")?
                .get("m_flBulletDamage")?
                .to_f64_lossy()?;
            Some((hero_id, damage))
        })
        .collect()
}

/// Guards against a `_base` cycle; real heroes are one level deep.
const MAX_INHERITANCE: usize = 8;

/// The hero and the entries it inherits through `_base`, the furthest ancestor first.
fn lineage<'a>(heroes: &'a Object, hero: &'a Value) -> Vec<&'a Value> {
    let mut chain = vec![hero];
    let mut current = hero;
    while let Some(parent) = current.get("_base").and_then(Value::as_str).and_then(|name| heroes.get(name)) {
        if chain.len() > MAX_INHERITANCE {
            break;
        }
        chain.push(parent);
        current = parent;
    }
    chain.reverse();
    chain
}

fn merged_numbers(lineage: &[&Value], table: &str) -> BTreeMap<String, f64> {
    let mut out = BTreeMap::new();
    for entries in lineage.iter().filter_map(|entry| entry.get(table)?.as_object()) {
        for (key, value) in entries.iter() {
            if let Some(number) = value.to_f64_lossy() {
                out.insert(key.to_string(), number);
            }
        }
    }
    out
}

/// A slot table the hero sets replaces the inherited one whole.
fn investment_tiers(lineage: &[&Value], slot_type: &str) -> Vec<InvestmentTier> {
    let Some(rows) =
        lineage.iter().rev().find_map(|entry| entry.get("m_MapModCostBonuses")?.get(slot_type)?.as_array())
    else {
        return Vec::new();
    };
    let mut tiers: Vec<InvestmentTier> = rows
        .iter()
        .filter_map(|row| {
            let number = |key: &str| row.get(key).and_then(Value::to_f64_lossy);
            Some(InvestmentTier {
                souls: row.get("nGoldThreshold").and_then(Value::as_u32)?,
                bonus: number("flBonus")?,
                percent_on_graph: number("flPercentOnGraph").unwrap_or(0.0),
            })
        })
        .collect();
    tiers.sort_by_key(|t| t.souls);
    tiers
}

#[cfg(test)]
mod tests {
    use super::*;
    use source2_kv3::Document;

    fn root(text: &str) -> Object {
        Document::from_text(text).unwrap().root.as_object().unwrap().clone()
    }

    fn tiers(rows: &[(u32, f64, f64)]) -> String {
        let rows: Vec<String> = rows
            .iter()
            .map(|(souls, bonus, pct)| {
                format!("{{ nGoldThreshold = {souls} flBonus = {bonus:?} flPercentOnGraph = {pct:?} }}")
            })
            .collect();
        format!("[ {} ]", rows.join(", "))
    }

    /// Shaped like `scripts/heroes.vdata_c`: Infernus overrides part of `hero_base`, Kali inherits all of it.
    fn heroes() -> Object {
        root(&format!(
            "{{
                generic_data_type = \"CitadelHeroData_t\"
                hero_base = {{
                    m_HeroID = 0
                    m_mapStartingStats = {{ EMaxHealth = 780.0 EMaxMoveSpeed = 7.2 ELightMeleeDamage = 50 }}
                    m_mapStandardLevelUpUpgrades = {{
                        MODIFIER_VALUE_BASE_HEALTH_FROM_LEVEL = 62.0
                        MODIFIER_VALUE_BASE_MELEE_DAMAGE_FROM_LEVEL = 1.58
                        MODIFIER_VALUE_BOON_COUNT = 1
                    }}
                    m_MapModCostBonuses = {{
                        EItemSlotType_WeaponMod = {weapon}
                        EItemSlotType_Tech = {spirit}
                        EItemSlotType_Armor = {vitality}
                    }}
                }}
                hero_inferno = {{
                    _base = \"hero_base\"
                    m_HeroID = 1
                    m_mapStartingStats = {{ EMaxHealth = 800.0 EBulletArmorDamageReduction = 0 }}
                    m_mapStandardLevelUpUpgrades = {{ MODIFIER_VALUE_BASE_BULLET_DAMAGE_FROM_LEVEL = 0.24 }}
                    m_MapModCostBonuses = {{ EItemSlotType_WeaponMod = {inferno_weapon} }}
                }}
                hero_kali = {{ _base = \"hero_base\" m_HeroID = 21 }}
            }}",
            // Out of order on purpose: tiers come out sorted by souls.
            weapon = tiers(&[(1600, 12.0, 7.0), (800, 9.0, 7.0), (28800, 115.0, 20.0)]),
            spirit = tiers(&[(800, 7.0, 7.0), (28800, 100.0, 20.0)]),
            vitality = tiers(&[(800, 9.0, 7.0), (28800, 66.0, 20.0)]),
            inferno_weapon = tiers(&[(800, 10.0, 7.0)]),
        ))
    }

    fn tier(souls: u32, bonus: f64, percent_on_graph: f64) -> InvestmentTier {
        InvestmentTier { souls, bonus, percent_on_graph }
    }

    #[test]
    fn a_hero_merges_its_own_stats_over_hero_base() {
        let stats = hero_stats(&heroes());
        let inferno = stats.get(&1).expect("Infernus has stats");
        assert_eq!(inferno.hero_id, 1);
        assert_eq!(inferno.base.get("EMaxHealth"), Some(&800.0));
        assert_eq!(inferno.base.get("EMaxMoveSpeed"), Some(&7.2));
        assert_eq!(inferno.base.get("ELightMeleeDamage"), Some(&50.0));
        assert_eq!(inferno.base.get("EBulletArmorDamageReduction"), Some(&0.0));
        assert_eq!(inferno.per_level.get("MODIFIER_VALUE_BASE_HEALTH_FROM_LEVEL"), Some(&62.0));
        assert_eq!(inferno.per_level.get("MODIFIER_VALUE_BASE_BULLET_DAMAGE_FROM_LEVEL"), Some(&0.24));
        assert_eq!(inferno.per_level.get("MODIFIER_VALUE_BOON_COUNT"), Some(&1.0));
    }

    #[test]
    fn investment_tables_map_slot_types_and_sort_by_souls() {
        let stats = hero_stats(&heroes());
        let kali = &stats[&21].investment;
        assert_eq!(kali.weapon, [tier(800, 9.0, 7.0), tier(1600, 12.0, 7.0), tier(28800, 115.0, 20.0)]);
        assert_eq!(kali.spirit, [tier(800, 7.0, 7.0), tier(28800, 100.0, 20.0)]);
        assert_eq!(kali.vitality, [tier(800, 9.0, 7.0), tier(28800, 66.0, 20.0)]);
    }

    #[test]
    fn a_slot_table_a_hero_sets_replaces_the_inherited_one_whole() {
        let investment = &hero_stats(&heroes())[&1].investment;
        assert_eq!(investment.weapon, [tier(800, 10.0, 7.0)]);
        assert_eq!(investment.spirit.len(), 2);
    }

    #[test]
    fn a_hero_without_its_own_tables_gets_hero_base_and_the_base_is_left_out() {
        let stats = hero_stats(&heroes());
        assert_eq!(stats.len(), 2);
        assert!(!stats.contains_key(&0));
        assert_eq!(stats[&21].base.get("EMaxHealth"), Some(&780.0));
        assert_eq!(stats[&21].per_level.get("MODIFIER_VALUE_BASE_MELEE_DAMAGE_FROM_LEVEL"), Some(&1.58));
    }

    #[test]
    fn non_numeric_entries_are_skipped() {
        let stats =
            hero_stats(&root("{ hero_x = { m_HeroID = 5 m_mapStartingStats = { EMaxHealth = 700 ETag = \"x\" } } }"));
        assert_eq!(stats[&5].base, BTreeMap::from([("EMaxHealth".to_string(), 700.0)]));
        assert_eq!(stats[&5].investment, SlotInvestment::default());
    }

    fn abilities() -> Object {
        root(
            "{
                citadel_weapon_inferno_set = { m_mapWeaponInfos = { primary = { m_flBulletDamage = 5.5 } } }
                citadel_weapon_kali_set = { m_mapWeaponInfos = { primary = { m_flBulletDamage = 12.98 } } }
                citadel_weapon_empty_set = { m_mapWeaponInfos = { primary = { m_flBulletSpeed = 1.0 } } }
            }",
        )
    }

    #[test]
    fn bullet_damage_comes_from_the_bound_primary_weapon_inherited_or_own() {
        let heroes = root(
            "{
                hero_base = { m_HeroID = 0 m_mapBoundAbilities = { ESlot_Weapon_Primary = \"citadel_weapon_inferno_set\" } }
                hero_inferno = { _base = \"hero_base\" m_HeroID = 1 }
                hero_kali = {
                    _base = \"hero_base\"
                    m_HeroID = 21
                    m_mapBoundAbilities = { ESlot_Weapon_Primary = \"citadel_weapon_kali_set\" }
                }
                hero_empty = { m_HeroID = 5 m_mapBoundAbilities = { ESlot_Weapon_Primary = \"citadel_weapon_empty_set\" } }
                hero_unknown = { m_HeroID = 6 m_mapBoundAbilities = { ESlot_Weapon_Primary = \"citadel_weapon_gone\" } }
            }",
        );
        assert_eq!(hero_bullet_damage(&heroes, &abilities()), HashMap::from([(1, 5.5), (21, 12.98)]));
    }

    #[test]
    fn hero_stats_leave_bullet_damage_to_the_abilities_reader() {
        assert!(hero_stats(&heroes()).values().all(|s| s.bullet_damage.is_none()));
    }

    #[test]
    #[ignore = "needs an installed game; set DEADLOCK_CITADEL_DIR"]
    fn the_installed_game_s_investment_tiers_match_deadlock_api() {
        use crate::progression::HeroesSource;
        let dir = std::path::PathBuf::from(std::env::var("DEADLOCK_CITADEL_DIR").expect("set DEADLOCK_CITADEL_DIR"));
        let doc = crate::vpk_source::VpkVdataSource.read(&dir).unwrap();
        let stats = hero_stats(doc.root.as_object().unwrap());
        let ends = |tiers: &[InvestmentTier]| {
            let (first, last) = (tiers.first().unwrap(), tiers.last().unwrap());
            [(first.souls, first.bonus), (last.souls, last.bonus)]
        };
        let inferno = &stats[&1].investment;
        assert_eq!(ends(&inferno.weapon), [(800, 9.0), (28800, 115.0)]);
        assert_eq!(ends(&inferno.spirit), [(800, 7.0), (28800, 100.0)]);
        assert_eq!(ends(&inferno.vitality), [(800, 9.0), (28800, 66.0)]);
        assert_eq!(stats[&1].per_level.get("MODIFIER_VALUE_BOON_COUNT"), Some(&1.0));
        let abilities =
            crate::shop::ShopSource::read(&crate::vpk_source::VpkVdataSource, &dir, crate::shop::ABILITIES_PATH)
                .unwrap();
        let damage = hero_bullet_damage(doc.root.as_object().unwrap(), abilities.root.as_object().unwrap());
        assert_eq!(damage.get(&2), Some(&10.8));
    }
}
