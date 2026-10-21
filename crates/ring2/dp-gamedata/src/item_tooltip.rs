use std::collections::{BTreeMap, HashMap};

use serde::Serialize;
use source2_kv3::{Object, Value};
use ts_rs::TS;

use crate::item_stats::StatSection;
use crate::tooltip::{
    important_cell, loc_token, localised_description, localised_property, named_properties, property_values,
    raw_property, Find, RawProperty, TooltipProperty,
};

/// One `m_vecSectionAttributes` block of a tooltip section: a description, then boxed cells, then rows.
/// Item and hero ability entries share this layout.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct TooltipBlock {
    /// The localised description in the game's markup: `<span class="highlight">`, `<span class="diminish">`,
    /// `<br>`, inline attributes as `<span class="inline-attribute-label Name">label</span>` and `{s:Property}`
    /// placeholders, whose numbers are in `values`.
    pub description: Option<String>,
    pub values: BTreeMap<String, f64>,
    /// Shown first, bright and bold.
    pub elevated: Vec<TooltipProperty>,
    /// Boxed cells with an icon, a big value and a coloured label.
    pub important: Vec<TooltipProperty>,
    pub properties: Vec<TooltipProperty>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct TooltipSection {
    pub kind: StatSection,
    /// Seconds, shown in the section's header bar; None when the section has no cooldown.
    pub cooldown: Option<f64>,
    pub blocks: Vec<TooltipBlock>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct RawSection {
    kind: StatSection,
    cooldown: Option<f64>,
    blocks: Vec<RawBlock>,
}

#[derive(Debug, Clone, PartialEq)]
struct RawBlock {
    description: Option<String>,
    elevated: Vec<RawProperty>,
    important: Vec<RawProperty>,
    properties: Vec<RawProperty>,
}

/// The tooltip sections of an item entry, in the game's order, before localisation.
/// `values` collects every numeric property, for the description placeholders.
pub(crate) fn raw_sections(entry: &Object) -> (Vec<RawSection>, HashMap<String, f64>) {
    let properties = entry.get("m_mapAbilityProperties").and_then(Value::as_object);
    let values = property_values(properties);
    let sections = entry
        .get("m_vecTooltipSectionInfo")
        .and_then(Value::as_array)
        .unwrap_or_default()
        .iter()
        .filter_map(|section| {
            // The game titles a section with no type "Passive" (27 items on build 6805, all passive).
            let kind = match section.get("m_eAbilitySectionType").and_then(Value::as_str) {
                Some("EArea_Innate") => StatSection::Innate,
                Some("EArea_Active") => StatSection::Active,
                Some("EArea_Passive") | None => StatSection::Passive,
                Some(_) => return None,
            };
            let mut blocks: Vec<RawBlock> = section
                .get("m_vecSectionAttributes")
                .and_then(Value::as_array)
                .unwrap_or_default()
                .iter()
                .map(|attributes| raw_block(attributes, properties))
                .collect();
            let cooldown = section_cooldown(kind, &mut blocks, properties);
            Some(RawSection { kind, cooldown, blocks })
        })
        .collect();
    (sections, values)
}

const PROC_COOLDOWN: &str = "ProcCooldown";
const ABILITY_COOLDOWN: &str = "AbilityCooldown";

/// The game shows a section's cooldown in its header, not as a row: a proc cooldown wins over the item's
/// cooldown, and an active section that names neither still shows the item's cooldown.
fn section_cooldown(kind: StatSection, blocks: &mut [RawBlock], properties: Option<&Object>) -> Option<f64> {
    let shown = |p: &RawProperty| p.value.filter(|_| !p.disabled);
    let named = |key: &str| blocks.iter().flat_map(|b| &b.properties).find(|p| p.key == key).map(shown);
    let cooldown = match (named(PROC_COOLDOWN), named(ABILITY_COOLDOWN)) {
        (Some(proc), _) => proc,
        (None, Some(item)) => item,
        (None, None) if kind == StatSection::Active => {
            properties.and_then(|p| raw_property(ABILITY_COOLDOWN, p)).and_then(|p| shown(&p))
        }
        (None, None) => None,
    };
    for block in blocks {
        block.properties.retain(|p| p.key != PROC_COOLDOWN && p.key != ABILITY_COOLDOWN);
    }
    cooldown.filter(|c| *c != 0.0)
}

fn raw_block(attributes: &Value, properties: Option<&Object>) -> RawBlock {
    let important = attributes
        .get("m_vecImportantAbilityProperties")
        .and_then(Value::as_array)
        .unwrap_or_default()
        .iter()
        .filter_map(|cell| important_cell(cell, properties, true))
        .collect();
    RawBlock {
        description: loc_token(attributes.get("m_strLocString")),
        elevated: named_properties(attributes.get("m_vecElevatedAbilityProperties"), properties),
        important,
        properties: named_properties(attributes.get("m_vecAbilityProperties"), properties),
    }
}

pub(crate) fn localised(raw: &[RawSection], values: &HashMap<String, f64>, find: &Find<'_>) -> Vec<TooltipSection> {
    raw.iter()
        .map(|section| TooltipSection {
            kind: section.kind,
            cooldown: section.cooldown,
            blocks: section.blocks.iter().map(|b| localised_block(b, values, find)).collect(),
        })
        .filter(|s| !s.blocks.is_empty())
        .collect()
}

fn localised_block(block: &RawBlock, values: &HashMap<String, f64>, find: &Find<'_>) -> TooltipBlock {
    let list = |raw: &[RawProperty]| raw.iter().filter_map(|p| localised_property(p, find)).collect();
    let (description, values) = localised_description(block.description.as_deref(), &|n| values.get(n).copied(), find);
    TooltipBlock {
        description,
        values,
        elevated: list(&block.elevated),
        important: list(&block.important),
        properties: list(&block.properties),
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::tooltip::tests::{entry, lookup, tokens};
    use crate::tooltip::StatScale;

    fn sections_of(text: &str, loc: &HashMap<String, String>) -> Vec<TooltipSection> {
        let (raw, values) = raw_sections(&entry(text));
        let lower = lookup(loc);
        localised(&raw, &values, &|t: &str| lower.get(&t.to_ascii_lowercase()).copied())
    }

    // Shaped after `upgrade_spirit_burn` in `scripts/abilities.vdata_c`, game build 6805.
    const SPIRIT_BURN: &str = r##"{
        m_mapAbilityProperties = {
            AbilityCooldown = { m_strValue = "0" m_strCSSClass = "cooldown" }
            TechRangeMultiplier = { m_strValue = "6" m_strCSSClass = "distance" m_eProvidedPropertyType = "MODIFIER_VALUE_TECH_RANGE_PERCENT" }
            TechRadiusMultiplier = { m_strValue = "6" m_strCSSClass = "distance" m_eProvidedPropertyType = "MODIFIER_VALUE_TECH_RADIUS_PERCENT" }
            DamageThreshold = { m_strCSSClass = "tech_armor_up" m_strValue = "500" }
            DamageThresholdDuration = { m_strValue = "5" }
            ExplosionDamage = { m_strValue = "50" m_strCSSClass = "tech_damage"
                m_subclassScaleFunction = { _class = "scale_function_tech_damage" m_flStatScale = 0.0 } }
            DPS = { m_strValue = "24" m_strCSSClass = "tech_damage"
                m_subclassScaleFunction = { _class = "scale_function_tech_damage" m_eSpecificStatScaleType = "ETechPower" m_flStatScale = 0.06 } }
            DebuffDuration = { m_strValue = "8" m_strCSSClass = "tech_damage" }
            HealAmpReceivePenaltyPercent = { m_strValue = "-70" }
            ImmunityDuration = { m_strValue = "20" m_strCSSClass = "cooldown" }
        }
        m_vecTooltipSectionInfo = [
            { m_eAbilitySectionType = "EArea_Innate"
              m_vecSectionAttributes = [ { m_vecElevatedAbilityProperties = [ ] m_vecAbilityProperties = [ "TechRangeMultiplier" ] } ] },
            { m_eAbilitySectionType = "EArea_Passive"
              m_vecSectionAttributes = [ {
                m_strLocString = "#upgrade_spirit_burn_desc"
                m_vecImportantAbilityProperties = [
                    { m_strImportantProperty = "DamageThreshold" },
                    { m_strImportantProperty = "ExplosionDamage" },
                    { m_strImportantProperty = "DPS" },
                ]
                m_vecAbilityProperties = [ "ImmunityDuration", "DebuffDuration", "HealAmpReceivePenaltyPercent" ]
              } ] },
        ]
    }"##;

    pub(crate) fn spirit_burn_tokens() -> HashMap<String, String> {
        tokens(
            r#""upgrade_spirit_burn_desc"	"Dealing significant {g:citadel_inline_attribute:'SpiritDamage'} to an enemy within {s:DamageThresholdDuration}s causes an explosion.<br><span class=\"diminish\">The cooldown is per enemy.</span>"
            "InlineAttribute_SpiritDamage"	"spirit damage"
            "TechRangeMultiplier_label" "Ability Range"
            "TechRangeMultiplier_prefix" "{s:sign}"
            "TechRangeMultiplier_postfix" "%"
            "TechRadiusMultiplier_label" "Radius"
            "DamageThreshold_label" "Damage Threshold"
            "ExplosionDamage_label" "Explosion Damage"
            "DPS_label" "Damage Per Second"
            "DebuffDuration_label" "Debuff Duration"
            "DebuffDuration_postfix" "s"
            "HealAmpReceivePenaltyPercent_label" "Incoming Healing"
            "HealAmpReceivePenaltyPercent_postfix" "%"
            "HealAmpReceivePenaltyPercent_prefix" ""
            "ImmunityDuration_label" "Immunity Duration"
            "ImmunityDuration_postfix" "s""#,
        )
    }

    /// Key, value, unit, label and whether it is a status cell.
    type ShownCell<'a> = (&'a str, Option<f64>, Option<&'a str>, &'a str, bool);

    fn keys(list: &[TooltipProperty]) -> Vec<&str> {
        list.iter().map(|p| p.key.as_str()).collect()
    }

    #[test]
    fn sections_keep_the_games_order_and_only_the_properties_they_name() {
        let sections = sections_of(SPIRIT_BURN, &spirit_burn_tokens());
        let kinds: Vec<StatSection> = sections.iter().map(|s| s.kind).collect();
        assert_eq!(kinds, [StatSection::Innate, StatSection::Passive]);
        assert_eq!(keys(&sections[0].blocks[0].properties), ["TechRangeMultiplier"]);
        let passive = &sections[1].blocks[0];
        assert_eq!(keys(&passive.important), ["DamageThreshold", "ExplosionDamage", "DPS"]);
        assert_eq!(keys(&passive.properties), ["ImmunityDuration", "DebuffDuration", "HealAmpReceivePenaltyPercent"]);
    }

    #[test]
    fn a_property_carries_its_label_unit_sign_and_css_class() {
        let sections = sections_of(SPIRIT_BURN, &spirit_burn_tokens());
        assert_eq!(
            sections[0].blocks[0].properties[0],
            TooltipProperty {
                key: "TechRangeMultiplier".into(),
                value: Some(6.0),
                unit: Some("%".into()),
                label: "Ability Range".into(),
                signed: true,
                prefix: None,
                css_class: Some("distance".into()),
                display_type: None,
                scale: None,
                status_effect: false,
                conditional: false,
                negative: false,
            }
        );
        let healing = &sections[1].blocks[0].properties[2];
        assert_eq!((healing.value, healing.signed), (Some(-70.0), false));
    }

    #[test]
    fn only_a_non_zero_stat_scale_is_kept_and_tech_functions_scale_with_spirit() {
        let sections = sections_of(SPIRIT_BURN, &spirit_burn_tokens());
        let important = &sections[1].blocks[0].important;
        assert_eq!(important[1].scale, None, "Explosion Damage scales by 0");
        assert_eq!(
            important[2].scale,
            Some(StatScale {
                stat: Some("ETechPower".into()),
                factor: Some(0.06),
                function: "scale_function_tech_damage".into()
            })
        );
        let unnamed = r#"{ m_mapAbilityProperties = { Barrier = { m_strValue = "325"
            m_subclassScaleFunction = { _class = "scale_function_tech_damage" m_flStatScale = 2.0 } } }
            m_vecTooltipSectionInfo = [ { m_vecSectionAttributes = [ {
                m_vecImportantAbilityProperties = [ { m_strImportantProperty = "Barrier" } ] } ] } ] }"#;
        let loc = tokens("\"Barrier_label\" \"Barrier\"");
        let scale = sections_of(unnamed, &loc)[0].blocks[0].important[0].scale.clone();
        assert_eq!(
            scale,
            Some(StatScale {
                stat: Some("ETechPower".into()),
                factor: Some(2.0),
                function: "scale_function_tech_damage".into()
            })
        );
    }

    #[test]
    fn the_description_is_localised_with_inline_attributes_and_its_placeholder_values() {
        let sections = sections_of(SPIRIT_BURN, &spirit_burn_tokens());
        let passive = &sections[1].blocks[0];
        assert_eq!(
            passive.description.as_deref(),
            Some(
                "Dealing significant <span class=\"inline-attribute-label SpiritDamage\">spirit damage</span> to an \
                 enemy within {s:DamageThresholdDuration}s causes an explosion.<br><span class=\"diminish\">The \
                 cooldown is per enemy.</span>"
            )
        );
        assert_eq!(passive.values, BTreeMap::from([("DamageThresholdDuration".to_string(), 5.0)]));
        assert_eq!(sections[0].blocks[0].description, None);
    }

    #[test]
    fn a_section_without_a_type_is_passive_and_several_sections_of_one_kind_stay_apart() {
        let text = r#"{ m_mapAbilityProperties = { A = { m_strValue = "1" } B = { m_strValue = "2" } }
            m_vecTooltipSectionInfo = [
                { m_vecSectionAttributes = [ { m_vecAbilityProperties = [ "A" ] } ] },
                { m_eAbilitySectionType = "EArea_Passive" m_vecSectionAttributes = [ { m_vecAbilityProperties = [ "B" ] } ] },
                { m_eAbilitySectionType = "EArea_Active" m_vecSectionAttributes = [ { m_vecAbilityProperties = [ "B" ] } ] },
            ] }"#;
        let loc = tokens("\"A_label\" \"A\"\n\"B_label\" \"B\"");
        let kinds: Vec<StatSection> = sections_of(text, &loc).iter().map(|s| s.kind).collect();
        assert_eq!(kinds, [StatSection::Passive, StatSection::Passive, StatSection::Active]);
    }

    #[test]
    fn a_status_cell_is_named_by_its_effect_with_an_optional_duration() {
        let text = r#"{ m_mapAbilityProperties = { SilenceDuration = { m_strValue = "2.5" } }
            m_vecTooltipSectionInfo = [ { m_eAbilitySectionType = "EArea_Passive" m_vecSectionAttributes = [ {
                m_vecImportantAbilityProperties = [
                    { m_strImportantProperty = "StatusEffectEMP" m_strStatusEffectValue = "SilenceDuration" },
                    { m_strImportantProperty = "StatusEffectInvisible" },
                    { m_strImportantProperty = "NoSuchProperty" },
                ] } ] } ] }"#;
        let loc = tokens(
            "\"Citadel_StatusEffectEMP\" \"Silenced\"\n\"Citadel_StatusEffectInvisible\" \"Invisible\"\n\
             \"SilenceDuration_postfix\" \"s\"",
        );
        let cells = &sections_of(text, &loc)[0].blocks[0].important;
        let shown: Vec<ShownCell<'_>> = cells
            .iter()
            .map(|c| (c.key.as_str(), c.value, c.unit.as_deref(), c.label.as_str(), c.status_effect))
            .collect();
        assert_eq!(
            shown,
            [
                ("StatusEffectEMP", Some(2.5), Some("s"), "Silenced", true),
                ("StatusEffectInvisible", None, None, "Invisible", true),
            ]
        );
    }

    #[test]
    fn a_property_carries_its_display_type() {
        let text = r#"{ m_mapAbilityProperties = { BuildUpPerShot = { m_strValue = "1.04" m_eDisplayType = "EBuildUpRate" } }
            m_vecTooltipSectionInfo = [ { m_vecSectionAttributes = [ { m_vecAbilityProperties = [ "BuildUpPerShot" ] } ] } ] }"#;
        let loc = tokens("\"BuildUpPerShot_label\" \"Buildup Per Shot\"");
        let shown = &sections_of(text, &loc)[0].blocks[0].properties[0];
        assert_eq!((shown.value, shown.display_type.as_deref()), (Some(1.04), Some("EBuildUpRate")));
    }

    #[test]
    fn a_scale_that_names_a_stat_is_kept_without_a_factor_and_multi_stat_or_disabled_ones_are_not() {
        let text = r#"{ m_mapAbilityProperties = {
                BuildUp = { m_strValue = "1.04"
                    m_subclassScaleFunction = { _class = "scale_function_single_stat" m_eSpecificStatScaleType = "EBuildUpRate" } }
                Multi = { m_strValue = "3"
                    m_subclassScaleFunction = { _class = "scale_function_multi_stats" m_vecScalingStats = [ "EChannelDuration", "ETechDuration" ] } }
                Off = { m_strValue = "4"
                    m_subclassScaleFunction = { _class = "scale_function_single_stat" m_eSpecificStatScaleType = "ETechRange" m_bFunctionDisabled = true } }
                Unnamed = { m_strValue = "5" m_subclassScaleFunction = { _class = "scale_function_tech_duration" } }
            }
            m_vecTooltipSectionInfo = [ { m_vecSectionAttributes = [ {
                m_vecAbilityProperties = [ "BuildUp", "Multi", "Off", "Unnamed" ] } ] } ] }"#;
        let loc =
            tokens("\"BuildUp_label\" \"B\"\n\"Multi_label\" \"M\"\n\"Off_label\" \"O\"\n\"Unnamed_label\" \"U\"");
        let scales: Vec<Option<StatScale>> =
            sections_of(text, &loc)[0].blocks[0].properties.iter().map(|p| p.scale.clone()).collect();
        assert_eq!(
            scales,
            [
                Some(StatScale {
                    stat: Some("EBuildUpRate".into()),
                    factor: None,
                    function: "scale_function_single_stat".into()
                }),
                None,
                None,
                None,
            ]
        );
    }

    #[test]
    fn a_status_cell_takes_its_css_class_scale_and_display_type_from_its_value_property() {
        let text = r#"{ m_mapAbilityProperties = { SilenceDuration = { m_strValue = "2.5" m_strCSSClass = "duration"
                m_eDisplayType = "ETechDuration"
                m_subclassScaleFunction = { _class = "scale_function_single_stat" m_eSpecificStatScaleType = "ETechDuration" } } }
            m_vecTooltipSectionInfo = [ { m_vecSectionAttributes = [ {
                m_vecImportantAbilityProperties = [ { m_strImportantProperty = "StatusEffectEMP" m_strStatusEffectValue = "SilenceDuration" } ]
            } ] } ] }"#;
        let loc = tokens("\"Citadel_StatusEffectEMP\" \"Silenced\"");
        let cell = &sections_of(text, &loc)[0].blocks[0].important[0];
        assert_eq!(cell.css_class.as_deref(), Some("duration"));
        assert_eq!(cell.display_type.as_deref(), Some("ETechDuration"));
        assert_eq!(cell.scale.as_ref().and_then(|s| s.stat.as_deref()), Some("ETechDuration"));
    }

    #[test]
    fn a_property_at_its_disable_value_is_left_out() {
        let text = r#"{ m_mapAbilityProperties = {
                Charges = { m_strValue = "-1" m_strDisableValue = "-1" }
                Shown = { m_strValue = "2" m_strDisableValue = "-1" }
            }
            m_vecTooltipSectionInfo = [ { m_vecSectionAttributes = [ { m_vecAbilityProperties = [ "Charges", "Shown" ] } ] } ] }"#;
        let loc = tokens("\"Charges_label\" \"Charges\"\n\"Shown_label\" \"Shown\"");
        assert_eq!(keys(&sections_of(text, &loc)[0].blocks[0].properties), ["Shown"]);
    }

    #[test]
    fn a_section_shows_its_cooldown_instead_of_a_row_and_a_proc_cooldown_wins() {
        let text = r#"{ m_mapAbilityProperties = {
                AbilityCooldown = { m_strValue = "16" m_strCSSClass = "cooldown" }
                ProcCooldown = { m_strValue = "8" m_strCSSClass = "cooldown" }
                Duration = { m_strValue = "3" }
            }
            m_vecTooltipSectionInfo = [
                { m_eAbilitySectionType = "EArea_Innate" m_vecSectionAttributes = [ { m_vecAbilityProperties = [ "Duration" ] } ] },
                { m_eAbilitySectionType = "EArea_Passive" m_vecSectionAttributes = [ {
                    m_vecAbilityProperties = [ "Duration", "AbilityCooldown", "ProcCooldown" ] } ] },
                { m_eAbilitySectionType = "EArea_Passive" m_vecSectionAttributes = [ { m_vecAbilityProperties = [ "Duration" ] } ] },
                { m_eAbilitySectionType = "EArea_Passive" m_vecSectionAttributes = [ {
                    m_vecAbilityProperties = [ "Duration", "AbilityCooldown" ] } ] },
                { m_eAbilitySectionType = "EArea_Active" m_vecSectionAttributes = [ { m_vecAbilityProperties = [ "Duration" ] } ] },
            ] }"#;
        let loc = tokens(
            "\"AbilityCooldown_label\" \"Cooldown\"\n\"ProcCooldown_label\" \"Cooldown\"\n\"Duration_label\" \"Duration\"",
        );
        let sections = sections_of(text, &loc);
        let cooldowns: Vec<Option<f64>> = sections.iter().map(|s| s.cooldown).collect();
        assert_eq!(cooldowns, [None, Some(8.0), None, Some(16.0), Some(16.0)]);
        for section in &sections {
            assert_eq!(keys(&section.blocks[0].properties), ["Duration"]);
        }
    }

    #[test]
    fn an_active_section_without_an_item_cooldown_has_none() {
        let text = r#"{ m_mapAbilityProperties = { AbilityCooldown = { m_strValue = "0" } Duration = { m_strValue = "3" } }
            m_vecTooltipSectionInfo = [ { m_eAbilitySectionType = "EArea_Active"
                m_vecSectionAttributes = [ { m_vecAbilityProperties = [ "Duration" ] } ] } ] }"#;
        let loc = tokens("\"Duration_label\" \"Duration\"");
        assert_eq!(sections_of(text, &loc)[0].cooldown, None);
    }

    #[test]
    fn zero_and_unlabelled_properties_are_left_out() {
        let text = r#"{ m_mapAbilityProperties = { Off = { m_strValue = "0" } Nameless = { m_strValue = "4" } Shown = { m_strValue = "3m" } }
            m_vecTooltipSectionInfo = [ { m_eAbilitySectionType = "EArea_Innate" m_vecSectionAttributes = [ {
                m_vecAbilityProperties = [ "Off", "Nameless", "Shown", "Missing" ] } ] } ] }"#;
        let loc = tokens("\"Off_label\" \"Off\"\n\"Shown_label\" \"Shown\"");
        let shown = &sections_of(text, &loc)[0].blocks[0].properties;
        assert_eq!(keys(shown), ["Shown"]);
        assert_eq!((shown[0].value, shown[0].unit.as_deref()), (Some(3.0), Some("m")));
    }

    #[test]
    fn the_loc_token_override_names_the_label() {
        let text = r##"{ m_mapAbilityProperties = { HealOnVeil = { m_strValue = "85" m_strLocTokenOverride = "#VeilWalker_Heal" } }
            m_vecTooltipSectionInfo = [ { m_vecSectionAttributes = [ {
                m_vecImportantAbilityProperties = [ { m_strImportantProperty = "HealOnVeil" } ] } ] } ] }"##;
        let loc = tokens("\"VeilWalker_Heal_label\" \"Heal\"");
        assert_eq!(sections_of(text, &loc)[0].blocks[0].important[0].label, "Heal");
    }
}
