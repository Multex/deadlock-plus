use std::collections::HashMap;
use std::path::Path;

use deadlock_data::LocalizationFile;
use serde::Serialize;
use source2_kv3::{Document, Object, Value};
use ts_rs::TS;

use crate::item_tooltip::{localised, raw_sections, RawSection, TooltipSection};
use crate::progression::ability_id;
use crate::tooltip::{bundle_localisation, token_map};

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ItemStat {
    /// The game's property name; the same key on two items is the same stat.
    pub key: String,
    pub value: f64,
    pub unit: Option<String>,
    pub label: String,
    /// Always on while the item is owned, so it sums with the same key on other items.
    pub flat: bool,
    /// The game's `m_eProvidedPropertyType`; stats with different keys can provide the same thing.
    pub provides: Option<String>,
    /// The first tooltip section that shows the stat.
    pub section: Option<StatSection>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum StatSection {
    Innate,
    Passive,
    Active,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ItemStats {
    pub item_id: u32,
    pub stats: Vec<ItemStat>,
    /// What the game's tooltip shows, section by section, in its order.
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sections: Option<Vec<TooltipSection>>,
}

/// The localisation bundles holding `<property>_label` and `<property>_postfix` tokens.
pub const STAT_BUNDLES: [&str; 2] = ["citadel_attributes", "citadel_mods"];

/// The stats each item shows in its shop tooltip, keyed by item id. `localisation` is searched in order.
pub fn item_stats(abilities: &Document, localisation: &[LocalizationFile]) -> HashMap<u32, Vec<ItemStat>> {
    labelled(&raw_item_stats(abilities), localisation).into_iter().map(|i| (i.item_id, i.stats)).collect()
}

/// An item before localisation, so one read of the abilities file serves every language.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct RawItem {
    stats: Vec<RawStat>,
    sections: Vec<RawSection>,
    values: HashMap<String, f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct RawStat {
    key: String,
    token: String,
    value: f64,
    metres: bool,
    flat: bool,
    provides: Option<String>,
    section: Option<StatSection>,
}

pub(crate) fn raw_item_stats(abilities: &Document) -> HashMap<u32, RawItem> {
    let Some(root) = abilities.root.as_object() else { return HashMap::new() };
    root.iter()
        .filter_map(|(class_name, entry)| {
            let entry = entry.as_object()?;
            // `_not_pickable` marks the per-slot and per-tier templates the real items inherit from.
            if entry.get("m_eAbilityType").and_then(Value::as_str) != Some("EAbilityType_Item")
                || entry.contains_key("_not_pickable")
            {
                return None;
            }
            let stats = raw_stats(entry);
            let (sections, values) = raw_sections(entry);
            (!stats.is_empty() || !sections.is_empty())
                .then(|| (ability_id(class_name), RawItem { stats, sections, values }))
        })
        .collect()
}

fn raw_stats(entry: &Object) -> Vec<RawStat> {
    let Some(properties) = entry.get("m_mapAbilityProperties").and_then(Value::as_object) else { return Vec::new() };
    let sections = tooltip_sections(entry);
    let intrinsic = intrinsic_properties(entry);
    properties
        .iter()
        .filter_map(|(key, property)| {
            let property = property.as_object()?;
            let text = |field: &str| property.get(field).and_then(Value::as_str).unwrap_or_default();
            let shown_in: Vec<&str> = sections.iter().filter(|(_, p)| *p == key).map(|(s, _)| *s).collect();
            let provided = property.contains_key("m_eProvidedPropertyType");
            let intrinsic = intrinsic.contains(&key);
            if shown_in.is_empty() && !(intrinsic && provided) {
                return None;
            }
            let (value, metres) = number(property.get("m_strValue")?)?;
            if value == 0.0 {
                return None;
            }
            // Range- and proc-gated bonuses sit in the passive section with no usage flag, so only
            // a stat shown solely as innate (or registered on the item and shown nowhere) is flat.
            let always_on = if shown_in.is_empty() { intrinsic } else { shown_in.iter().all(|s| *s == INNATE) };
            let flat = provided
                && always_on
                && !text("m_eStatsUsageFlags").contains("Conditionally")
                && !property.contains_key("m_eApplyFilter");
            let token = match text("m_strLocTokenOverride") {
                "" => key,
                token => token.trim_start_matches('#'),
            };
            let section = shown_in.first().and_then(|kind| match *kind {
                INNATE => Some(StatSection::Innate),
                "EArea_Passive" => Some(StatSection::Passive),
                "EArea_Active" => Some(StatSection::Active),
                _ => None,
            });
            let provides = property.get("m_eProvidedPropertyType").and_then(Value::as_str).map(str::to_string);
            Some(RawStat { key: key.to_string(), token: token.to_string(), value, metres, flat, provides, section })
        })
        .collect()
}

const INNATE: &str = "EArea_Innate";

/// `(section type, property name)` for every property a tooltip section shows.
fn tooltip_sections(entry: &Object) -> Vec<(&str, &str)> {
    let mut shown = Vec::new();
    for section in entry.get("m_vecTooltipSectionInfo").and_then(Value::as_array).unwrap_or_default() {
        let kind = section.get("m_eAbilitySectionType").and_then(Value::as_str).unwrap_or_default();
        for attributes in section.get("m_vecSectionAttributes").and_then(Value::as_array).unwrap_or_default() {
            for list in ["m_vecElevatedAbilityProperties", "m_vecImportantAbilityProperties", "m_vecAbilityProperties"]
            {
                for name in attributes.get(list).and_then(Value::as_array).unwrap_or_default() {
                    // Important properties are objects naming the property in `m_strImportantProperty`.
                    let name = name.as_str().or_else(|| name.get("m_strImportantProperty").and_then(Value::as_str));
                    shown.extend(name.map(|n| (kind, n)));
                }
            }
        }
    }
    shown
}

/// Properties the item's always-present modifiers register as modifier values.
fn intrinsic_properties(entry: &Object) -> Vec<&str> {
    entry
        .get("m_AutoIntrinsicModifiers")
        .and_then(Value::as_array)
        .unwrap_or_default()
        .iter()
        .filter_map(|m| m.get("m_vecAutoRegisterModifierValueFromAbilityPropertyName").and_then(Value::as_array))
        .flatten()
        .filter_map(Value::as_str)
        .collect()
}

/// `m_strValue` is a string; distances carry an `m` suffix (`"2.0m"`).
pub(crate) fn number(value: &Value) -> Option<(f64, bool)> {
    if let Some(n) = value.as_f64() {
        return Some((n, false));
    }
    let text = value.as_str()?.trim();
    let (digits, metres) = text.strip_suffix('m').map_or((text, false), |d| (d, true));
    Some((digits.trim().parse().ok()?, metres))
}

pub(crate) fn labelled(raw: &HashMap<u32, RawItem>, localisation: &[LocalizationFile]) -> Vec<ItemStats> {
    let tokens = token_map(localisation);
    let lookup = |token: &str| tokens.get(&token.to_ascii_lowercase()).copied();
    let find = |token: &str, suffix: &str| lookup(&format!("{token}{suffix}")).filter(|t| !t.is_empty());
    let mut list: Vec<ItemStats> = raw
        .iter()
        .map(|(&item_id, item)| ItemStats {
            item_id,
            sections: Some(localised(&item.sections, &item.values, &lookup)),
            stats: item
                .stats
                .iter()
                .filter_map(|s| {
                    let label = find(&s.token, "_label").or_else(|| find(&s.token, "_postvalue_label"))?;
                    let unit = find(&s.token, "_postfix").map(str::to_string).or_else(|| s.metres.then(|| "m".into()));
                    Some(ItemStat {
                        key: s.key.clone(),
                        value: s.value,
                        unit,
                        label: label.to_string(),
                        flat: s.flat,
                        provides: s.provides.clone(),
                        section: s.section,
                    })
                })
                .collect(),
        })
        .filter(|i| !i.stats.is_empty() || i.sections.as_ref().is_some_and(|s| !s.is_empty()))
        .collect();
    list.sort_by_key(|i| i.item_id);
    list
}

/// The stat bundles for `language`, then English to fill its gaps.
pub(crate) fn stat_localisation(citadel_dir: &Path, language: &str) -> Vec<LocalizationFile> {
    bundle_localisation(citadel_dir, language, &STAT_BUNDLES)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::progression::ability_id;

    fn doc(text: &str) -> Document {
        Document::from_text(text).expect("test document parses")
    }

    fn english(body: &str) -> LocalizationFile {
        LocalizationFile::parse(&format!("\"lang\"\n{{\n\"Tokens\"\n{{\n{body}\n}}\n}}"), "english")
    }

    fn labels() -> LocalizationFile {
        english(
            "\"BonusHealth_label\" \"Bonus Health\"\n\
             \"BonusFireRate_label\" \"Fire Rate\"\n\"BonusFireRate_postfix\" \"%\"\n\
             \"TechPower_label\" \"Spirit Power\"\n\
             \"StatusResistancePercent_label\" \"Debuff Resist\"\n\"StatusResistancePercent_postfix\" \"%\"\n\
             \"BonusSprintSpeed_label\" \"Sprint Speed\"\n\
             \"HeadShotBonusDamage_label\" \"Headshot Damage\"",
        )
    }

    /// One item entry: `properties` go into `m_mapAbilityProperties`, `sections` into `m_vecTooltipSectionInfo`.
    fn entry(properties: &str, sections: &str, intrinsic: &[&str]) -> String {
        let names: Vec<String> = intrinsic.iter().map(|n| format!("\"{n}\"")).collect();
        format!(
            "{{\n_class = \"citadel_item\"\nm_eAbilityType = \"EAbilityType_Item\"\n\
             m_mapAbilityProperties = {{\n{properties}\n}}\n\
             m_vecTooltipSectionInfo = [\n{sections}\n]\n\
             m_AutoIntrinsicModifiers = [ {{ _class = \"modifier_intrinsic_base\"\n\
             m_vecAutoRegisterModifierValueFromAbilityPropertyName = [ {} ] }} ]\n}}",
            names.join(", ")
        )
    }

    fn property(name: &str, value: &str, extra: &str) -> String {
        format!("{name} = {{\nm_strValue = \"{value}\"\n{extra}\n}}")
    }

    fn typed(name: &str, value: &str, kind: &str, flags: &str) -> String {
        property(name, value, &format!("m_eProvidedPropertyType = \"{kind}\"\nm_eStatsUsageFlags = \"{flags}\""))
    }

    fn section(kind: &str, properties: &[&str]) -> String {
        let names: Vec<String> = properties.iter().map(|n| format!("\"{n}\"")).collect();
        format!(
            "{{\nm_eAbilitySectionType = \"{kind}\"\n\
             m_vecSectionAttributes = [ {{ m_vecAbilityProperties = [ {} ] }} ]\n}},",
            names.join(", ")
        )
    }

    fn stats_of(class: &str, body: &str, localisation: &[LocalizationFile]) -> Vec<ItemStat> {
        let mut all = item_stats(&doc(&format!("{{\n{class} = {body}\n}}")), localisation);
        all.remove(&ability_id(class)).unwrap_or_default()
    }

    fn stats(body: &str) -> Vec<ItemStat> {
        stats_of("upgrade_x", body, &[labels()])
    }

    fn flat_of(stats: &[ItemStat]) -> Vec<(&str, bool)> {
        stats.iter().map(|s| (s.key.as_str(), s.flat)).collect()
    }

    #[test]
    fn an_innate_provided_property_is_a_flat_stat() {
        let body = entry(
            &typed("BonusHealth", "210", "MODIFIER_VALUE_HEALTH_MAX", ""),
            &section("EArea_Innate", &["BonusHealth"]),
            &["BonusHealth"],
        );
        assert_eq!(
            stats(&body),
            [ItemStat {
                key: "BonusHealth".into(),
                value: 210.0,
                unit: None,
                label: "Bonus Health".into(),
                flat: true,
                provides: Some("MODIFIER_VALUE_HEALTH_MAX".into()),
                section: Some(StatSection::Innate),
            }]
        );
    }

    #[test]
    fn a_conditionally_applied_property_is_not_flat() {
        let props = [
            typed("BonusFireRate", "25", "MODIFIER_VALUE_FIRE_RATE", "ConditionallyApplied"),
            typed("TechPower", "15", "MODIFIER_VALUE_TECH_POWER", "ConditionallyApplied"),
        ]
        .join("\n");
        let sections =
            [section("EArea_Passive", &["BonusFireRate"]), section("EArea_Innate", &["TechPower"])].join("\n");
        assert_eq!(flat_of(&stats(&entry(&props, &sections, &[]))), [("BonusFireRate", false), ("TechPower", false)]);
    }

    #[test]
    fn a_passive_section_property_is_not_flat_even_when_unflagged() {
        // The game leaves `m_eStatsUsageFlags` empty on range- and proc-gated bonuses; only the section says so.
        let props = typed("TechPower", "15", "MODIFIER_VALUE_TECH_POWER", "IntrinsicallyProvidedInAbility");
        let body = entry(&props, &section("EArea_Passive", &["TechPower"]), &["TechPower"]);
        assert_eq!(flat_of(&stats(&body)), [("TechPower", false)]);
    }

    #[test]
    fn an_active_section_property_is_not_flat() {
        let props = [
            typed("StatusResistancePercent", "35", "MODIFIER_VALUE_STATUS_RESISTANCE", ""),
            typed("BonusFireRate", "35", "MODIFIER_VALUE_FIRE_RATE", "ConditionallyApplied"),
        ]
        .join("\n");
        let body = entry(&props, &section("EArea_Active", &["StatusResistancePercent", "BonusFireRate"]), &[]);
        assert_eq!(flat_of(&stats(&body)), [("StatusResistancePercent", false), ("BonusFireRate", false)]);
    }

    fn sections_of(stats: &[ItemStat]) -> Vec<(&str, Option<StatSection>)> {
        stats.iter().map(|s| (s.key.as_str(), s.section)).collect()
    }

    #[test]
    fn each_stat_names_the_first_section_that_shows_it() {
        let props = [
            typed("BonusHealth", "75", "MODIFIER_VALUE_HEALTH_MAX", ""),
            typed("BonusFireRate", "25", "MODIFIER_VALUE_FIRE_RATE", "ConditionallyApplied"),
            typed("StatusResistancePercent", "35", "MODIFIER_VALUE_STATUS_RESISTANCE", ""),
            typed("TechPower", "10", "MODIFIER_VALUE_TECH_POWER", ""),
            property("HeadShotBonusDamage", "45", ""),
        ]
        .join(
            "
",
        );
        let sections = [
            section("EArea_Innate", &["BonusHealth"]),
            section("EArea_Passive", &["BonusFireRate", "TechPower"]),
            section("EArea_Active", &["StatusResistancePercent", "TechPower"]),
            section("", &["HeadShotBonusDamage"]),
        ]
        .join(
            "
",
        );
        assert_eq!(
            sections_of(&stats(&entry(&props, &sections, &[]))),
            [
                ("BonusHealth", Some(StatSection::Innate)),
                ("BonusFireRate", Some(StatSection::Passive)),
                ("StatusResistancePercent", Some(StatSection::Active)),
                ("TechPower", Some(StatSection::Passive)),
                ("HeadShotBonusDamage", None),
            ]
        );
    }

    #[test]
    fn a_stat_shown_nowhere_has_no_section() {
        let props = typed("BonusHealth", "75", "MODIFIER_VALUE_HEALTH_MAX", "");
        assert_eq!(sections_of(&stats(&entry(&props, "", &["BonusHealth"]))), [("BonusHealth", None)]);
    }

    #[test]
    fn provides_is_the_provided_property_type() {
        let props = [
            typed("TechPower", "6", "MODIFIER_VALUE_TECH_POWER", ""),
            typed("BonusSpirit", "30", "MODIFIER_VALUE_TECH_POWER", "IntrinsicallyProvidedInAbility"),
            property("HeadShotBonusDamage", "45", ""),
        ]
        .join(
            "
",
        );
        let loc = english("\"BonusSpirit_label\" \"Spirit Power\"");
        let body = entry(&props, &section("EArea_Innate", &["TechPower", "BonusSpirit", "HeadShotBonusDamage"]), &[]);
        let provides: Vec<Option<String>> =
            stats_of("upgrade_x", &body, &[labels(), loc]).into_iter().map(|s| s.provides).collect();
        let tech = Some("MODIFIER_VALUE_TECH_POWER".to_string());
        assert_eq!(provides, [tech.clone(), tech, None]);
    }

    #[test]
    fn a_property_shown_in_two_sections_is_not_flat() {
        let props = typed("TechPower", "10", "MODIFIER_VALUE_TECH_POWER", "");
        let sections = [section("EArea_Innate", &["TechPower"]), section("EArea_Active", &["TechPower"])].join("\n");
        assert_eq!(flat_of(&stats(&entry(&props, &sections, &["TechPower"]))), [("TechPower", false)]);
    }

    #[test]
    fn an_apply_filter_makes_a_property_not_flat() {
        let props = property(
            "TechPower",
            "28",
            "m_eProvidedPropertyType = \"MODIFIER_VALUE_TECH_POWER\"\nm_eApplyFilter = \"EApplyFilter_OnlyIfImbued\"",
        );
        assert_eq!(
            flat_of(&stats(&entry(&props, &section("EArea_Innate", &["TechPower"]), &[]))),
            [("TechPower", false)]
        );
    }

    #[test]
    fn a_shown_property_without_a_provided_type_is_listed_but_not_flat() {
        let props = property("HeadShotBonusDamage", "45", "");
        let body = entry(&props, &section("EArea_Innate", &["HeadShotBonusDamage"]), &[]);
        assert_eq!(flat_of(&stats(&body)), [("HeadShotBonusDamage", false)]);
    }

    #[test]
    fn an_intrinsic_provided_property_outside_every_section_is_flat() {
        let props = typed("BonusHealth", "75", "MODIFIER_VALUE_HEALTH_MAX", "");
        assert_eq!(flat_of(&stats(&entry(&props, "", &["BonusHealth"]))), [("BonusHealth", true)]);
    }

    #[test]
    fn zero_and_unshown_properties_are_left_out() {
        let props = [
            property("AbilityCooldown", "0", "m_strCSSClass = \"cooldown\""),
            typed("TechPower", "0", "MODIFIER_VALUE_TECH_POWER", ""),
            typed("BonusHealth", "75", "MODIFIER_VALUE_HEALTH_MAX", ""),
            property("HeadShotBonusDamage", "45", ""),
        ]
        .join("\n");
        let body = entry(&props, &section("EArea_Innate", &["AbilityCooldown", "TechPower"]), &[]);
        assert!(stats(&body).is_empty(), "{:?}", stats(&body));
    }

    #[test]
    fn a_metre_suffix_is_stripped_into_the_unit() {
        let props = typed("BonusSprintSpeed", "2.0m", "MODIFIER_VALUE_SPRINT_SPEED_BONUS", "");
        let parsed = stats(&entry(&props, &section("EArea_Innate", &["BonusSprintSpeed"]), &[]));
        assert_eq!((parsed[0].value, parsed[0].unit.as_deref()), (2.0, Some("m")));
    }

    #[test]
    fn the_postfix_token_is_the_unit() {
        let props = typed("BonusFireRate", "9", "MODIFIER_VALUE_FIRE_RATE", "");
        let parsed = stats(&entry(&props, &section("EArea_Innate", &["BonusFireRate"]), &[]));
        assert_eq!((parsed[0].value, parsed[0].unit.as_deref()), (9.0, Some("%")));
    }

    #[test]
    fn the_loc_token_override_names_the_label() {
        let loc = english("\"BonusClipSize_label\" \"Ammo\"\n\"TemporaryBonusClipSize_label\" \"Temporary Ammo\"");
        let props = property("BonusClipSize", "6", "m_strLocTokenOverride = \"#TemporaryBonusClipSize\"");
        let body = entry(&props, &section("EArea_Passive", &["BonusClipSize"]), &[]);
        assert_eq!(stats_of("upgrade_x", &body, &[loc])[0].label, "Temporary Ammo");
    }

    #[test]
    fn labels_match_any_case_and_fall_back_to_the_postvalue_label() {
        let loc = english(
            "\"TechArmorDamageReduction_Label\" \"Spirit Resist\"\n\"SpiritPower_postvalue_label\" \"Spirit Power\"",
        );
        let props = [property("TechArmorDamageReduction", "-8", ""), property("SpiritPower", "5", "")].join("\n");
        let body = entry(&props, &section("EArea_Passive", &["TechArmorDamageReduction", "SpiritPower"]), &[]);
        let labels: Vec<String> = stats_of("upgrade_x", &body, &[loc]).into_iter().map(|s| s.label).collect();
        assert_eq!(labels, ["Spirit Resist", "Spirit Power"]);
    }

    #[test]
    fn earlier_localisation_wins_and_later_fills_its_gaps() {
        let german = LocalizationFile::parse(
            "\"lang\" { \"Tokens\" {\n\"BonusHealth_label\" \"Bonuslebenspunkte\"\n} }",
            "german",
        );
        let props = [
            typed("BonusHealth", "75", "MODIFIER_VALUE_HEALTH_MAX", ""),
            typed("TechPower", "5", "MODIFIER_VALUE_TECH_POWER", ""),
        ]
        .join("\n");
        let body = entry(&props, &section("EArea_Innate", &["BonusHealth", "TechPower"]), &[]);
        let labels: Vec<String> =
            stats_of("upgrade_x", &body, &[german, labels()]).into_iter().map(|s| s.label).collect();
        assert_eq!(labels, ["Bonuslebenspunkte", "Spirit Power"]);
    }

    #[test]
    fn a_stat_without_any_label_is_left_out() {
        let props = typed("HealAmpRegenPercent", "20", "MODIFIER_VALUE_HEAL_AMP_REGEN_PERCENT", "");
        assert!(stats(&entry(&props, "", &["HealAmpRegenPercent"])).is_empty());
    }

    #[test]
    fn templates_and_non_items_have_no_stats() {
        let health = typed("BonusHealth", "75", "MODIFIER_VALUE_HEALTH_MAX", "");
        let template =
            entry(&health, &section("EArea_Innate", &["BonusHealth"]), &[]).replacen('{', "{\n_not_pickable = 2", 1);
        let hero_ability = entry(&health, &section("EArea_Innate", &["BonusHealth"]), &[])
            .replace("EAbilityType_Item", "EAbilityType_Signature");
        let item = entry(&health, &section("EArea_Innate", &["BonusHealth"]), &[]);
        let text = format!("{{\ngeneric_data_type = \"CitadelAbilityVData\"\narmor_upgrade_t1 = {template}\nability_x = {hero_ability}\nupgrade_y = {item}\n}}");
        let all = item_stats(&doc(&text), &[labels()]);
        assert_eq!(all.keys().copied().collect::<Vec<_>>(), [ability_id("upgrade_y")]);
    }

    #[test]
    fn labelled_lists_items_by_id_in_order() {
        let health = typed("BonusHealth", "75", "MODIFIER_VALUE_HEALTH_MAX", "");
        let item = entry(&health, &section("EArea_Innate", &["BonusHealth"]), &[]);
        let text = format!("{{\nupgrade_a = {item}\nupgrade_b = {item}\nupgrade_c = {item}\n}}");
        let list = labelled(&raw_item_stats(&doc(&text)), &[labels()]);
        let ids: Vec<u32> = list.iter().map(|i| i.item_id).collect();
        let mut sorted = ids.clone();
        sorted.sort_unstable();
        assert_eq!(ids.len(), 3);
        assert_eq!(ids, sorted);
    }

    #[test]
    fn stat_localisation_reads_both_bundles_then_english() {
        let dir = std::env::temp_dir().join(format!("dp-gamedata-item-stats-loc-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        for (bundle, language, body) in [
            ("citadel_attributes", "german", "\"BonusHealth_label\" \"Bonuslebenspunkte\""),
            ("citadel_mods", "german", "\"RicochetDamagePercent_label\" \"Abprallschaden\""),
            ("citadel_attributes", "english", "\"TechPower_label\" \"Spirit Power\""),
            ("citadel_mods", "english", "\"RicochetDamagePercent_label\" \"Ricochet Damage\""),
        ] {
            let path = dir.join(LocalizationFile::relative_path(bundle, language));
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, format!("\"lang\"\n{{\n\"Tokens\"\n{{\n{body}\n}}\n}}")).unwrap();
        }
        let files = stat_localisation(&dir, "german");
        let languages: Vec<&str> = files.iter().map(|f| f.language.as_str()).collect();
        assert_eq!(languages, ["german", "german", "english", "english"]);
        assert_eq!(files[1].get("RicochetDamagePercent_label"), Some("Abprallschaden"));
        assert_eq!(stat_localisation(&dir, "english").len(), 2);
        std::fs::remove_dir_all(dir).ok();
    }
}

#[cfg(test)]
mod installed_tests {
    use std::path::PathBuf;

    use super::*;
    use crate::catalog::{Install, SteamInstall};
    use crate::progression::ability_id;
    use crate::shop::{ShopSource, ABILITIES_PATH};
    use crate::vpk_source::VpkVdataSource;

    /// The installed game, or `None` to skip: these tests only read it.
    fn installed() -> Option<PathBuf> {
        let dir = std::env::var_os("DEADLOCK_CITADEL_DIR").map(PathBuf::from).or_else(|| SteamInstall.citadel_dir());
        let dir = dir.filter(|d| d.join(deadlock_data::vdata::ARCHIVE).is_file());
        if dir.is_none() {
            eprintln!("skipped: no installed Deadlock");
        }
        dir
    }

    fn stat<'a>(stats: &'a [ItemStat], key: &str) -> &'a ItemStat {
        stats.iter().find(|s| s.key == key).unwrap_or_else(|| panic!("{key} missing from {stats:?}"))
    }

    fn flat(stats: &[ItemStat]) -> Vec<(&str, f64, Option<&str>, &str)> {
        stats
            .iter()
            .filter(|s| s.flat)
            .map(|s| (s.key.as_str(), s.value, s.unit.as_deref(), s.label.as_str()))
            .collect()
    }

    // Values from `scripts/abilities.vdata_c` and labels from `citadel_attributes_english.txt`, game build 6805.
    #[test]
    fn the_installed_items_carry_their_tooltip_stats() {
        let Some(dir) = installed() else { return };
        let abilities = ShopSource::read(&VpkVdataSource, &dir, ABILITIES_PATH).expect("abilities.vdata reads");
        let all = item_stats(&abilities, &stat_localisation(&dir, "english"));
        let of = |class: &str| all.get(&ability_id(class)).unwrap_or_else(|| panic!("{class} missing"));

        assert_eq!(flat(of("upgrade_health")), [("BonusHealth", 210.0, None, "Bonus Health")]);
        assert_eq!(flat(of("upgrade_improved_spirit")), [("TechPower", 10.0, None, "Spirit Power")]);
        assert_eq!(flat(of("upgrade_rapid_rounds")), [("BonusFireRate", 9.0, Some("%"), "Fire Rate")]);

        let kinetic_dash = of("upgrade_kinetic_sash");
        assert!(!stat(kinetic_dash, "BonusFireRate").flat, "conditional: ConditionallyApplied, passive section");
        assert!(stat(kinetic_dash, "Stamina").flat);

        let blood_tribute = of("upgrade_blood_tribute");
        assert!(!stat(blood_tribute, "StatusResistancePercent").flat, "active section only");
        assert!(stat(blood_tribute, "InnateStatusResistancePercent").flat);

        let placed = |s: &ItemStat| (s.provides.clone(), s.section);
        let provides = |kind: &str| Some(kind.to_string());
        assert_eq!(
            placed(stat(of("upgrade_health"), "BonusHealth")),
            (provides("MODIFIER_VALUE_HEALTH_MAX"), Some(StatSection::Innate))
        );
        assert_eq!(
            placed(stat(kinetic_dash, "BonusFireRate")),
            (provides("MODIFIER_VALUE_FIRE_RATE"), Some(StatSection::Passive))
        );
        assert_eq!(
            placed(stat(blood_tribute, "StatusResistancePercent")),
            (provides("MODIFIER_VALUE_STATUS_RESISTANCE"), Some(StatSection::Active))
        );
        assert_eq!(stat(blood_tribute, "BonusMoveSpeed").unit.as_deref(), Some("m"));
    }

    // Checked against in-game tooltips at 1440p (Spirit Burn, Silencer, Veil Walker), game build 6805.
    #[test]
    fn the_installed_items_carry_their_tooltip_sections() {
        use crate::shop::GENERIC_DATA_PATH;
        use crate::tooltip::TooltipProperty;
        let Some(dir) = installed() else { return };
        let abilities = ShopSource::read(&VpkVdataSource, &dir, ABILITIES_PATH).expect("abilities.vdata reads");
        let _ = ShopSource::read(&VpkVdataSource, &dir, GENERIC_DATA_PATH);
        let all = labelled(&raw_item_stats(&abilities), &stat_localisation(&dir, "english"));
        let sections = |class: &str| {
            all.iter().find(|i| i.item_id == ability_id(class)).and_then(|i| i.sections.clone()).expect(class)
        };
        let shown = |list: &[TooltipProperty]| -> Vec<String> {
            list.iter().map(|p| format!("{:?}{} {}", p.value, p.unit.as_deref().unwrap_or(""), p.label)).collect()
        };

        let burn = sections("upgrade_spirit_burn");
        assert_eq!(shown(&burn[0].blocks[0].properties), ["Some(6.0)% Ability Range"]);
        let passive = &burn[1].blocks[0];
        assert_eq!(
            shown(&passive.important),
            ["Some(500.0) Damage Threshold", "Some(50.0) Explosion Damage", "Some(24.0) Damage Per Second"]
        );
        assert_eq!(
            shown(&passive.properties),
            ["Some(20.0)s Immunity Duration", "Some(8.0)s Debuff Duration", "Some(-70.0)% Incoming Healing"]
        );
        let description = passive.description.as_deref().unwrap();
        assert!(description.starts_with("Dealing significant <span class=\"inline-attribute-label SpiritDamage\">spirit damage</span> to an enemy within {s:DamageThresholdDuration}s"), "{description}");
        assert!(description.contains("<span class=\"diminish\">The cooldown is per enemy"), "{description}");
        assert_eq!(passive.values.get("DamageThresholdDuration"), Some(&5.0));

        let silencer = sections("upgrade_proc_silence");
        let kinds: Vec<StatSection> = silencer.iter().map(|s| s.kind).collect();
        assert_eq!(kinds, [StatSection::Innate, StatSection::Passive, StatSection::Passive]);
        assert_eq!(shown(&silencer[2].blocks[0].important), ["Some(2.5)s Silenced"]);
        // The game rescales the base value per hero (14.1% on one), so only the base and its display type are fixed.
        let buildup = &silencer[2].blocks[0].properties[1];
        assert_eq!((buildup.key.as_str(), buildup.value), ("BuildUpPerShot", Some(1.04)));
        assert_eq!(buildup.display_type.as_deref(), Some("EBuildUpRate"));
        assert_eq!(buildup.scale.as_ref().map(|s| (s.stat.as_deref(), s.factor)), Some((Some("EBuildUpRate"), None)));

        let warp = sections("upgrade_warp_stone");
        assert_eq!((warp[0].kind, warp[0].cooldown), (StatSection::Active, Some(16.0)));
        assert!(warp[0].blocks[0].properties.iter().all(|p| p.key != "AbilityCooldown"));

        let veil = sections("upgrade_veil_walker");
        let cells = &veil[1].blocks[0].important;
        assert_eq!((cells[0].label.as_str(), cells[0].value, cells[0].status_effect), ("Invisible", None, true));
        assert_eq!(cells[2].label, "Heal");

        let find = |class: &str, key: &str| -> TooltipProperty {
            let all = sections(class);
            let mut shown = all
                .iter()
                .flat_map(|s| &s.blocks)
                .flat_map(|b| b.elevated.iter().chain(&b.important).chain(&b.properties));
            shown.find(|p| p.key == key).cloned().unwrap_or_else(|| panic!("{class} shows no {key}"))
        };
        let sash = find("upgrade_kinetic_sash", "BonusFireRate");
        assert_eq!((sash.conditional, sash.negative), (true, false));
        let glass = find("upgrade_glass_cannon", "MaxHealthLossPercent");
        assert_eq!((glass.value, glass.negative), (Some(-13.0), true));
        assert!(!find("upgrade_spirit_burn", "DPS").negative);
    }
}
