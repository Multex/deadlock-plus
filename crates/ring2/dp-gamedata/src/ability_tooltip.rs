use std::collections::{BTreeMap, HashMap};

use deadlock_data::LocalizationFile;
use serde::Serialize;
use source2_kv3::{Document, Object, Value};
use ts_rs::TS;

use crate::item_stats::number;
use crate::progression::ability_id;
use crate::tooltip::{
    important_cell, labelled_property, loc_token, localised_description, localised_property, named_properties,
    property_values, raw_property, token_map, Find, RawProperty, TooltipProperty,
};

/// The localisation bundles holding hero ability names, descriptions and property labels.
pub const ABILITY_BUNDLES: [&str; 2] = ["citadel_heroes", "citadel_attributes"];

/// Ability points each upgrade tier costs. No game file carries these: the client sets the tooltip's
/// `ability_points_required` in code, and every ability's `m_nAbilityPointsCost` is 0 (build 6805).
pub const ABILITY_UPGRADE_COSTS: [u32; 3] = [1, 2, 5];

/// What the game's hero ability tooltip shows, before the hero's own stats scale it.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AbilityTooltip {
    pub ability_id: u32,
    pub class_name: String,
    pub name: String,
    /// Chips under the name, in the game's order: channel time, cast range, radius, duration, then the
    /// ability's own extra header properties.
    pub header: Vec<TooltipProperty>,
    pub charges: Option<TooltipProperty>,
    /// The wait between two charges; only with `charges`.
    pub charge_cooldown: Option<TooltipProperty>,
    pub cooldown: Option<TooltipProperty>,
    pub sections: Vec<AbilitySection>,
    /// Tiers 1 to 3.
    pub upgrades: Vec<AbilityUpgrade>,
}

/// One `m_vecAbilityInfoSections` entry: a description, groups of boxed cells, then a list of rows.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AbilitySection {
    /// The game's markup, as on [`crate::TooltipBlock::description`].
    pub description: Option<String>,
    pub values: BTreeMap<String, f64>,
    pub groups: Vec<AbilityCellGroup>,
    pub properties: Vec<TooltipProperty>,
    /// The upgrade tier that adds this section; None when it always shows.
    pub required_tier: Option<u8>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AbilityCellGroup {
    pub title: Option<String>,
    pub cells: Vec<TooltipProperty>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AbilityUpgrade {
    pub tier: u8,
    /// Ability points.
    pub cost: u32,
    /// The `<ability>_t<tier>_desc` markup; None when the game shows the bonuses with their labels instead.
    pub description: Option<String>,
    /// The numbers of the description's placeholders: this tier's bonus, else the property's base value.
    pub values: BTreeMap<String, f64>,
    pub bonuses: Vec<AbilityBonus>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AbilityBonus {
    /// The property's label, unit and prefix, with the bonus as its value.
    pub property: TooltipProperty,
    pub kind: UpgradeKind,
}

/// `m_eUpgradeType`: what the bonus changes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum UpgradeKind {
    /// Added to the property's value.
    AddToBase,
    /// Added to the property's stat-scale factor.
    AddToScale,
    MultiplyBase,
    MultiplyScale,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct RawAbility {
    class_name: String,
    header: Vec<RawProperty>,
    charges: Option<RawProperty>,
    charge_cooldown: Option<RawProperty>,
    cooldown: Option<RawProperty>,
    sections: Vec<RawSection>,
    upgrades: Vec<RawUpgrade>,
    values: HashMap<String, f64>,
}

#[derive(Debug, Clone, PartialEq)]
struct RawSection {
    description: Option<String>,
    groups: Vec<(Option<String>, Vec<RawProperty>)>,
    properties: Vec<RawProperty>,
    required_tier: Option<u8>,
}

#[derive(Debug, Clone, PartialEq)]
struct RawUpgrade {
    bonuses: Vec<(RawProperty, f64, UpgradeKind)>,
}

/// The ability types the hero's ability bar shows: signature slots 1 to 3, then the ultimate in slot 4.
const ABILITY_BAR_TYPES: [&str; 2] = ["EAbilityType_Signature", "EAbilityType_Ultimate"];

/// Every ability-bar ability with a tooltip in `abilities.vdata`, keyed by ability id, before localisation.
pub(crate) fn raw_abilities(abilities: &Document) -> HashMap<u32, RawAbility> {
    let Some(root) = abilities.root.as_object() else { return HashMap::new() };
    root.iter()
        .filter_map(|(class_name, entry)| {
            let entry = entry.as_object()?;
            let kind = entry.get("m_eAbilityType").and_then(Value::as_str)?;
            if !ABILITY_BAR_TYPES.contains(&kind) {
                return None;
            }
            Some((ability_id(class_name), raw_ability(class_name, entry)?))
        })
        .collect()
}

const HEADER_CHIPS: [&str; 4] = ["AbilityChannelTime", "AbilityCastRange", "Radius", "AbilityDuration"];

fn raw_ability(class_name: &str, entry: &Object) -> Option<RawAbility> {
    let details = entry.get("m_AbilityTooltipDetails")?;
    let properties = entry.get("m_mapAbilityProperties").and_then(Value::as_object);
    // Charge delays sit at -1 on abilities without charges, below their -2 disable value.
    let positive = |name: &str| {
        properties.and_then(|p| raw_property(name, p)).filter(|p| !p.disabled && p.value.is_some_and(|v| v > 0.0))
    };
    let extra = details.get("m_vecAdditionalHeaderProperties").and_then(Value::as_array).unwrap_or_default();
    let header = HEADER_CHIPS.into_iter().chain(extra.iter().filter_map(Value::as_str)).filter_map(positive).collect();
    let charges = positive("AbilityCharges");
    let charge_cooldown = charges.as_ref().and_then(|_| positive("AbilityCooldownBetweenCharge"));
    let upgrades = raw_upgrades(entry, properties);
    let sections = details
        .get("m_vecAbilityInfoSections")
        .and_then(Value::as_array)
        .unwrap_or_default()
        .iter()
        .map(|section| raw_section(section, properties, &upgrades))
        .collect();
    Some(RawAbility {
        class_name: class_name.to_string(),
        header,
        charges,
        charge_cooldown,
        cooldown: positive("AbilityCooldown"),
        sections,
        upgrades,
        values: property_values(properties),
    })
}

fn raw_section(section: &Value, properties: Option<&Object>, upgrades: &[RawUpgrade]) -> RawSection {
    let groups = section
        .get("m_vecAbilityPropertiesBlock")
        .and_then(Value::as_array)
        .unwrap_or_default()
        .iter()
        .map(|block| {
            let cells = block
                .get("m_vecAbilityProperties")
                .and_then(Value::as_array)
                .unwrap_or_default()
                .iter()
                .filter_map(|cell| {
                    let with_value = cell.get("m_bShowPropertyValue").and_then(Value::as_bool) == Some(true);
                    important_cell(cell, properties, with_value)
                })
                .collect();
            (loc_token(block.get("m_strPropertiesTitleLocString")), cells)
        })
        .collect();
    let required = section.get("m_strAbilityPropertyUpgradeRequired").and_then(Value::as_str).filter(|r| !r.is_empty());
    let required_tier = required.and_then(|name| {
        let tier = upgrades.iter().position(|u| u.bonuses.iter().any(|(p, _, _)| p.key == name))?;
        u8::try_from(tier + 1).ok()
    });
    RawSection {
        description: loc_token(section.get("m_strLocString")),
        groups,
        properties: named_properties(section.get("m_vecBasicProperties"), properties),
        required_tier,
    }
}

fn raw_upgrades(entry: &Object, properties: Option<&Object>) -> Vec<RawUpgrade> {
    let bonus = |upgrade: &Value| {
        let name = upgrade.get("m_strPropertyName").and_then(Value::as_str)?;
        let (bonus, _) = number(upgrade.get("m_strBonus")?)?;
        let kind = match upgrade.get("m_eUpgradeType").and_then(Value::as_str) {
            Some("EAddToScale") => UpgradeKind::AddToScale,
            Some("EMultiplyBase") => UpgradeKind::MultiplyBase,
            Some("EMultiplyScale") => UpgradeKind::MultiplyScale,
            _ => UpgradeKind::AddToBase,
        };
        Some((raw_property(name, properties?)?, bonus, kind))
    };
    entry
        .get("m_vecAbilityUpgrades")
        .and_then(Value::as_array)
        .unwrap_or_default()
        .iter()
        .map(|tier| RawUpgrade {
            bonuses: tier
                .get("m_vecPropertyUpgrades")
                .and_then(Value::as_array)
                .unwrap_or_default()
                .iter()
                .filter_map(bonus)
                .collect(),
        })
        .collect()
}

/// `raw` labelled in the first language of `localisation` that has each token, sorted by ability id.
pub(crate) fn localised_abilities(
    raw: &HashMap<u32, RawAbility>,
    localisation: &[LocalizationFile],
) -> Vec<AbilityTooltip> {
    let tokens = token_map(localisation);
    let find = |token: &str| tokens.get(&token.to_ascii_lowercase()).copied();
    let mut list: Vec<AbilityTooltip> =
        raw.iter().map(|(&id, ability)| localised_ability(id, ability, &find)).collect();
    list.sort_by_key(|a| a.ability_id);
    list
}

fn localised_ability(ability_id: u32, raw: &RawAbility, find: &Find<'_>) -> AbilityTooltip {
    let shown = |p: &Option<RawProperty>| p.as_ref().and_then(|p| localised_property(p, find));
    let list = |raw: &[RawProperty]| raw.iter().filter_map(|p| localised_property(p, find)).collect::<Vec<_>>();
    let sections = raw
        .sections
        .iter()
        .map(|section| {
            let (description, values) =
                localised_description(section.description.as_deref(), &|n| raw.values.get(n).copied(), find);
            let groups = section
                .groups
                .iter()
                .map(|(title, cells)| AbilityCellGroup {
                    title: title.as_deref().and_then(find).map(str::to_string),
                    cells: list(cells),
                })
                .collect();
            AbilitySection {
                description,
                values,
                groups,
                properties: list(&section.properties),
                required_tier: section.required_tier,
            }
        })
        .collect();
    let upgrades = raw
        .upgrades
        .iter()
        .zip(ABILITY_UPGRADE_COSTS)
        .zip(1u8..)
        .map(|((upgrade, cost), tier)| {
            let bonus = |name: &str| upgrade.bonuses.iter().find(|(p, _, _)| p.key == name).map(|(_, b, _)| *b);
            let token = format!("{}_t{tier}_desc", raw.class_name);
            let (description, values) =
                localised_description(Some(&token), &|n| bonus(n).or_else(|| raw.values.get(n).copied()), find);
            let bonuses = upgrade
                .bonuses
                .iter()
                .filter_map(|(property, value, kind)| {
                    Some(AbilityBonus { property: labelled_property(property, Some(*value), find)?, kind: *kind })
                })
                .collect();
            AbilityUpgrade { tier, cost, description, values, bonuses }
        })
        .collect();
    AbilityTooltip {
        ability_id,
        class_name: raw.class_name.clone(),
        name: find(&raw.class_name).filter(|n| !n.is_empty()).unwrap_or(&raw.class_name).to_string(),
        header: list(&raw.header),
        charges: shown(&raw.charges),
        charge_cooldown: shown(&raw.charge_cooldown),
        cooldown: shown(&raw.cooldown),
        sections,
        upgrades,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tooltip::tests::tokens;
    use crate::tooltip::StatScale;

    fn english(body: &str) -> LocalizationFile {
        LocalizationFile { language: "english".into(), tokens: tokens(body) }
    }

    // Shaped after `citadel_ability_lightning_ball` in `scripts/abilities.vdata_c`, game build 6805.
    const LIGHTNING_BALL: &str = r##"
        m_eAbilityType = "EAbilityType_Signature"
        m_mapAbilityProperties = {
            AbilityCooldown = { m_strValue = 26.0 m_strDisableValue = "0" m_strCSSClass = "cooldown"
                m_subclassScaleFunction = { _class = "scale_function_single_stat" m_eSpecificStatScaleType = "ETechCooldown" } }
            AbilityDuration = { m_strValue = "0" m_strDisableValue = "0" m_strCSSClass = "duration" }
            AbilityCastRange = { m_strValue = "0" m_strCSSClass = "range" }
            AbilityChannelTime = { m_strValue = "0" m_strDisableValue = "0" m_strCSSClass = "cast" }
            AbilityCharges = { m_strValue = "1" m_strDisableValue = "-1" m_strCSSClass = "cast"
                m_subclassScaleFunction = { _class = "scale_function_ability_charges" } }
            AbilityCooldownBetweenCharge = { m_strValue = "6" m_strDisableValue = "-2" m_strCSSClass = "charge_cooldown"
                m_subclassScaleFunction = { _class = "scale_function_ability_recharge_time" } }
            ShockRadius = { m_strValue = "4.25m" m_strStreetBrawlValue = "3.6m" m_strCSSClass = "distance"
                m_subclassScaleFunction = { _class = "scale_function_single_stat" m_eSpecificStatScaleType = "ETechRadius" } }
            DPS = { m_strValue = 75 m_strCSSClass = "tech_damage"
                m_subclassScaleFunction = { _class = "scale_function_tech_damage" m_eSpecificStatScaleType = "ETechPower" m_flStatScale = 0.5 } }
            MaxLifetime = { m_strValue = "5" m_strCSSClass = "duration"
                m_subclassScaleFunction = { _class = "scale_function_single_stat" m_eSpecificStatScaleType = "ETechDuration" } }
            SlowPercent = { m_strValue = "0" m_strCSSClass = "slow" }
        }
        m_vecAbilityUpgrades = [
            { m_vecPropertyUpgrades = [ { m_strPropertyName = "AbilityCharges" m_strBonus = "1" } ] },
            { m_vecPropertyUpgrades = [
                { m_strPropertyName = "SlowPercent" m_strBonus = "28" },
                { m_strPropertyName = "MaxLifetime" m_strBonus = "1" },
            ] },
            { m_vecPropertyUpgrades = [
                { m_strPropertyName = "DPS" m_strBonus = 58.5 },
                { m_strPropertyName = "ShockRadius" m_strBonus = "1.75m" m_strStreetBrawlBonus = "1.27m" },
            ] },
        ]
        m_AbilityTooltipDetails = {
            m_vecAbilityInfoSections = [ {
                m_strLocString = "#citadel_ability_lightning_ball_desc"
                m_vecAbilityPropertiesBlock = [ { m_vecAbilityProperties = [
                    { m_strImportantProperty = "DPS" },
                    { m_strImportantProperty = "ShockRadius" },
                    { m_strImportantProperty = "SlowPercent" },
                ] } ]
                m_vecBasicProperties = [ "MaxLifetime" ]
            } ]
        }
    "##;

    fn lightning_ball_tokens() -> LocalizationFile {
        english(
            r#""citadel_ability_lightning_ball" "Lightning Ball"
            "citadel_ability_lightning_ball_desc" "Shoot a ball of lightning. Does <span class=\"highlight\">damage to all targets in its radius</span>."
            "citadel_ability_lightning_ball_t2_desc" "<span class=\"highlight\">-{s:SlowPercent}%</span> move speed on hit targets and <span class=\"highlight\">+{s:MaxLifetime}s</span> Lifetime"
            "citadel_ability_lightning_ball_t3_desc" "+{s:DPS} DPS and +{s:ShockRadius}m radius"
            "AbilityCooldown_label" "Cooldown"
            "AbilityCooldown_postfix" "s"
            "AbilityCharges_label" "Charges"
            "AbilityCooldownBetweenCharge_label" "Charge Delay"
            "AbilityCooldownBetweenCharge_postfix" "s"
            "AbilityDuration_label" "Duration"
            "AbilityCastRange_label" "Cast Range"
            "AbilityChannelTime_label" "Channel Duration"
            "SlowPercent_label" "Move Speed"
            "SlowPercent_postfix" "%"
            "SlowPercent_prefix" "-"
            "DPS_prefix" ""
            "DPS_label" "Damage Per Second"
            "ShockRadius_label" "Radius"
            "ShockRadius_postfix" "m"
            "MaxLifetime_label" "Lifetime"
            "MaxLifetime_postfix" "s""#,
        )
    }

    fn abilities(body: &str) -> Document {
        Document::from_text(&format!("{{ {body} }}")).expect("test abilities parse")
    }

    fn tooltip_of(class: &str, entry: &str, loc: &[LocalizationFile]) -> AbilityTooltip {
        let all = localised_abilities(&raw_abilities(&abilities(&format!("{class} = {{ {entry} }}"))), loc);
        all.into_iter().find(|a| a.class_name == class).unwrap_or_else(|| panic!("{class} missing"))
    }

    fn lightning_ball() -> AbilityTooltip {
        tooltip_of("citadel_ability_lightning_ball", LIGHTNING_BALL, &[lightning_ball_tokens()])
    }

    /// Value, unit and label.
    fn shown(p: &TooltipProperty) -> (Option<f64>, Option<&str>, &str) {
        (p.value, p.unit.as_deref(), p.label.as_str())
    }

    #[test]
    fn an_ability_carries_its_id_class_and_name() {
        let ball = lightning_ball();
        assert_eq!(ball.ability_id, 1_065_103_387);
        assert_eq!(ball.name, "Lightning Ball");
    }

    #[test]
    fn charges_the_charge_delay_and_the_cooldown_go_to_the_header() {
        let ball = lightning_ball();
        assert_eq!(ball.charges.as_ref().map(shown), Some((Some(1.0), None, "Charges")));
        assert_eq!(ball.charge_cooldown.as_ref().map(shown), Some((Some(6.0), Some("s"), "Charge Delay")));
        let cooldown = ball.cooldown.as_ref().expect("a cooldown");
        assert_eq!(shown(cooldown), (Some(26.0), Some("s"), "Cooldown"));
        assert_eq!(cooldown.css_class.as_deref(), Some("cooldown"));
        assert_eq!(ball.charge_cooldown.as_ref().and_then(|c| c.css_class.as_deref()), Some("charge_cooldown"));
    }

    #[test]
    fn header_chips_at_zero_are_left_out() {
        assert_eq!(lightning_ball().header, []);
    }

    #[test]
    fn header_chips_keep_the_games_order_then_the_extra_header_properties() {
        let entry = r#"m_eAbilityType = "EAbilityType_Signature"
            m_mapAbilityProperties = {
                AbilityDuration = { m_strValue = "4" m_strDisableValue = "0" }
                Radius = { m_strValue = "6m" }
                AbilityCastRange = { m_strValue = "20m" }
                AbilityChannelTime = { m_strValue = "1.5" m_strDisableValue = "0" }
                SlashRadius = { m_strValue = "3m" }
                Damage = { m_strValue = "50" }
            }
            m_AbilityTooltipDetails = { m_vecAbilityInfoSections = [ ] m_vecAdditionalHeaderProperties = [ "SlashRadius" ] }"#;
        let loc = english(
            "\"AbilityDuration_label\" \"Duration\"\n\"AbilityDuration_postfix\" \"s\"\n\"Radius_label\" \"Radius\"\n\
             \"AbilityCastRange_label\" \"Cast Range\"\n\"AbilityChannelTime_label\" \"Channel Duration\"\n\
             \"SlashRadius_label\" \"Slash Radius\"",
        );
        let header = tooltip_of("ability_x", entry, &[loc]).header;
        let keys: Vec<&str> = header.iter().map(|p| p.key.as_str()).collect();
        assert_eq!(keys, ["AbilityChannelTime", "AbilityCastRange", "Radius", "AbilityDuration", "SlashRadius"]);
        assert_eq!(shown(&header[1]), (Some(20.0), Some("m"), "Cast Range"));
    }

    #[test]
    fn an_ability_without_charges_has_no_charge_chips_or_cooldown_at_zero() {
        let entry = r#"m_eAbilityType = "EAbilityType_Signature"
            m_mapAbilityProperties = {
                AbilityCooldown = { m_strValue = "0" m_strDisableValue = "0" }
                AbilityCharges = { m_strValue = "0" m_strDisableValue = "-1" }
                AbilityCooldownBetweenCharge = { m_strValue = "-1.0" m_strDisableValue = "-2" }
            }
            m_AbilityTooltipDetails = { m_vecAbilityInfoSections = [ ] }"#;
        let loc = english("\"AbilityCharges_label\" \"Charges\"\n\"AbilityCooldownBetweenCharge_label\" \"Charge Delay\"\n\"AbilityCooldown_label\" \"Cooldown\"");
        let tooltip = tooltip_of("ability_x", entry, &[loc]);
        assert_eq!((tooltip.charges, tooltip.charge_cooldown, tooltip.cooldown), (None, None, None));
    }

    #[test]
    fn a_section_has_its_description_cells_and_rows() {
        let ball = lightning_ball();
        assert_eq!(ball.sections.len(), 1);
        let section = &ball.sections[0];
        assert_eq!(
            section.description.as_deref(),
            Some(
                "Shoot a ball of lightning. Does <span class=\"highlight\">damage to all targets in its radius</span>."
            )
        );
        assert_eq!(section.groups.len(), 1);
        assert_eq!(section.groups[0].title, None);
        let cells: Vec<_> = section.groups[0].cells.iter().map(shown).collect();
        assert_eq!(cells, [(Some(75.0), None, "Damage Per Second"), (Some(4.25), Some("m"), "Radius")]);
        assert_eq!(
            section.groups[0].cells[0].scale,
            Some(StatScale {
                stat: Some("ETechPower".into()),
                factor: Some(0.5),
                function: "scale_function_tech_damage".into()
            })
        );
        let rows: Vec<_> = section.properties.iter().map(shown).collect();
        assert_eq!(rows, [(Some(5.0), Some("s"), "Lifetime")]);
        assert_eq!(section.required_tier, None);
    }

    #[test]
    fn description_placeholders_carry_the_base_values() {
        let entry = r##"m_eAbilityType = "EAbilityType_Signature"
            m_mapAbilityProperties = { Damage = { m_strValue = "40" } }
            m_AbilityTooltipDetails = { m_vecAbilityInfoSections = [ { m_strLocString = "#ability_x_desc" } ] }"##;
        let loc = english("\"ability_x_desc\" \"Deals {s:Damage} damage.\"");
        let section = &tooltip_of("ability_x", entry, &[loc]).sections[0];
        assert_eq!(section.values, BTreeMap::from([("Damage".to_string(), 40.0)]));
    }

    #[test]
    fn cell_groups_keep_their_titles_and_status_cells_show_a_number_only_when_asked() {
        let entry = r##"m_eAbilityType = "EAbilityType_Signature"
            m_mapAbilityProperties = { Damage = { m_strValue = "100" } StunDuration = { m_strValue = "1.5" } }
            m_AbilityTooltipDetails = { m_vecAbilityInfoSections = [
                { m_vecAbilityPropertiesBlock = [
                    { m_strPropertiesTitleLocString = "#ability_x_on_hero" m_vecAbilityProperties = [
                        { m_strImportantProperty = "Damage" },
                        { m_strImportantProperty = "StatusEffectDisplacement" },
                    ] },
                    { m_strPropertiesTitleLocString = "#ability_x_on_wall" m_vecAbilityProperties = [
                        { m_strImportantProperty = "StatusEffectStun" m_strStatusEffectValue = "StunDuration" m_bShowPropertyValue = true },
                        { m_strImportantProperty = "StatusEffectSlow" m_strStatusEffectValue = "StunDuration" },
                    ] },
                ] },
            ] }"##;
        let loc = english(
            "\"ability_x_on_hero\" \"On Hero Collide\"\n\"ability_x_on_wall\" \"On Wall Impact\"\n\
             \"Damage_label\" \"Damage\"\n\"Citadel_StatusEffectDisplacement\" \"Displaced\"\n\
             \"Citadel_StatusEffectStun\" \"Stunned\"\n\"Citadel_StatusEffectSlow\" \"Slowed\"\n\"StunDuration_postfix\" \"s\"",
        );
        let groups = &tooltip_of("ability_x", entry, &[loc]).sections[0].groups;
        let titles: Vec<Option<&str>> = groups.iter().map(|g| g.title.as_deref()).collect();
        assert_eq!(titles, [Some("On Hero Collide"), Some("On Wall Impact")]);
        assert_eq!(shown(&groups[0].cells[1]), (None, None, "Displaced"));
        assert_eq!(shown(&groups[1].cells[0]), (Some(1.5), Some("s"), "Stunned"));
        assert_eq!(shown(&groups[1].cells[1]), (None, None, "Slowed"));
        assert!(groups[1].cells.iter().all(|c| c.status_effect));
    }

    #[test]
    fn a_section_an_upgrade_adds_names_that_upgrades_tier() {
        let entry = r#"m_eAbilityType = "EAbilityType_Signature"
            m_mapAbilityProperties = { Damage = { m_strValue = "10" } WallImpactDamage = { m_strValue = "0" } }
            m_vecAbilityUpgrades = [
                { m_vecPropertyUpgrades = [ { m_strPropertyName = "Damage" m_strBonus = "5" } ] },
                { m_vecPropertyUpgrades = [ { m_strPropertyName = "WallImpactDamage" m_strBonus = "80" } ] },
                { m_vecPropertyUpgrades = [ { m_strPropertyName = "Damage" m_strBonus = "20" } ] },
            ]
            m_AbilityTooltipDetails = { m_vecAbilityInfoSections = [
                { m_vecBasicProperties = [ "Damage" ] m_strAbilityPropertyUpgradeRequired = "" },
                { m_vecBasicProperties = [ "Damage" ] m_strAbilityPropertyUpgradeRequired = "WallImpactDamage" },
            ] }"#;
        let loc = english("\"Damage_label\" \"Damage\"");
        let tiers: Vec<Option<u8>> =
            tooltip_of("ability_x", entry, &[loc]).sections.iter().map(|s| s.required_tier).collect();
        assert_eq!(tiers, [None, Some(2)]);
    }

    #[test]
    fn upgrades_cost_one_two_and_five_points_and_carry_their_bonuses() {
        let upgrades = lightning_ball().upgrades;
        let costs: Vec<(u8, u32)> = upgrades.iter().map(|u| (u.tier, u.cost)).collect();
        assert_eq!(costs, [(1, 1), (2, 2), (3, 5)]);
        let bonuses = |tier: usize| -> Vec<(Option<f64>, Option<&str>, &str)> {
            upgrades[tier].bonuses.iter().map(|b| shown(&b.property)).collect()
        };
        assert_eq!(bonuses(0), [(Some(1.0), None, "Charges")]);
        assert_eq!(bonuses(1), [(Some(28.0), Some("%"), "Move Speed"), (Some(1.0), Some("s"), "Lifetime")]);
        assert_eq!(bonuses(2), [(Some(58.5), None, "Damage Per Second"), (Some(1.75), Some("m"), "Radius")]);
        assert_eq!(upgrades[1].bonuses[0].property.prefix.as_deref(), Some("-"));
        assert!(upgrades.iter().flat_map(|u| &u.bonuses).all(|b| b.kind == UpgradeKind::AddToBase));
    }

    #[test]
    fn a_tier_description_takes_its_numbers_from_that_tiers_bonuses() {
        let upgrades = lightning_ball().upgrades;
        assert_eq!(upgrades[0].description, None);
        assert_eq!(upgrades[0].values, BTreeMap::new());
        assert_eq!(
            upgrades[1].description.as_deref(),
            Some("<span class=\"highlight\">-{s:SlowPercent}%</span> move speed on hit targets and <span class=\"highlight\">+{s:MaxLifetime}s</span> Lifetime")
        );
        assert_eq!(
            upgrades[1].values,
            BTreeMap::from([("MaxLifetime".to_string(), 1.0), ("SlowPercent".to_string(), 28.0)])
        );
        assert_eq!(upgrades[2].values, BTreeMap::from([("DPS".to_string(), 58.5), ("ShockRadius".to_string(), 1.75)]));
    }

    #[test]
    fn a_tier_placeholder_without_a_bonus_falls_back_to_the_base_value() {
        let entry = r#"m_eAbilityType = "EAbilityType_Signature"
            m_mapAbilityProperties = { Damage = { m_strValue = "10" } Radius = { m_strValue = "4m" } }
            m_vecAbilityUpgrades = [ { m_vecPropertyUpgrades = [ { m_strPropertyName = "Damage" m_strBonus = "5" } ] } ]
            m_AbilityTooltipDetails = { m_vecAbilityInfoSections = [ ] }"#;
        let loc = english("\"ability_x_t1_desc\" \"+{s:Damage} damage in {s:Radius}m\"");
        let upgrade = &tooltip_of("ability_x", entry, &[loc]).upgrades[0];
        assert_eq!(upgrade.values, BTreeMap::from([("Damage".to_string(), 5.0), ("Radius".to_string(), 4.0)]));
    }

    #[test]
    fn the_upgrade_type_says_what_a_bonus_changes() {
        let entry = r#"m_eAbilityType = "EAbilityType_Signature"
            m_mapAbilityProperties = { A = { m_strValue = "1" } B = { m_strValue = "1" } C = { m_strValue = "1" } D = { m_strValue = "1" } }
            m_vecAbilityUpgrades = [ { m_vecPropertyUpgrades = [
                { m_strPropertyName = "A" m_strBonus = "1" },
                { m_strPropertyName = "B" m_strBonus = "0.2" m_eUpgradeType = "EAddToScale" },
                { m_strPropertyName = "C" m_strBonus = "2" m_eUpgradeType = "EMultiplyBase" },
                { m_strPropertyName = "D" m_strBonus = "2" m_eUpgradeType = "EMultiplyScale" },
            ] } ]
            m_AbilityTooltipDetails = { m_vecAbilityInfoSections = [ ] }"#;
        let loc = english("\"A_label\" \"A\"\n\"B_label\" \"B\"\n\"C_label\" \"C\"\n\"D_label\" \"D\"");
        let kinds: Vec<UpgradeKind> =
            tooltip_of("ability_x", entry, &[loc]).upgrades[0].bonuses.iter().map(|b| b.kind).collect();
        assert_eq!(
            kinds,
            [UpgradeKind::AddToBase, UpgradeKind::AddToScale, UpgradeKind::MultiplyBase, UpgradeKind::MultiplyScale]
        );
    }

    #[test]
    fn only_abilities_with_a_tooltip_are_listed_sorted_by_id() {
        let doc = abilities(&format!(
            "citadel_ability_lightning_ball = {{ {LIGHTNING_BALL} }}
             ability_no_tooltip = {{ m_eAbilityType = \"EAbilityType_Signature\" }}
             upgrade_item = {{ m_eAbilityType = \"EAbilityType_Item\" m_AbilityTooltipDetails = {{ m_vecAbilityInfoSections = [ ] }} }}
             ability_a = {{ m_eAbilityType = \"EAbilityType_Signature\" m_AbilityTooltipDetails = {{ m_vecAbilityInfoSections = [ ] }} }}"
        ));
        let list = localised_abilities(&raw_abilities(&doc), &[lightning_ball_tokens()]);
        let classes: Vec<&str> = list.iter().map(|a| a.class_name.as_str()).collect();
        let mut sorted = list.iter().map(|a| a.ability_id).collect::<Vec<_>>();
        sorted.sort();
        assert_eq!(list.iter().map(|a| a.ability_id).collect::<Vec<_>>(), sorted);
        assert_eq!(classes.len(), 2);
        assert!(classes.contains(&"citadel_ability_lightning_ball") && classes.contains(&"ability_a"));
        let unnamed = list.iter().find(|a| a.class_name == "ability_a").unwrap();
        assert_eq!(unnamed.name, "ability_a", "an ability without a name token keeps its class name");
    }

    #[test]
    fn ultimates_are_listed_but_innate_and_weapon_abilities_are_not() {
        let with_type = |kind: &str| {
            format!("m_eAbilityType = \"{kind}\" m_AbilityTooltipDetails = {{ m_vecAbilityInfoSections = [ ] }}")
        };
        let doc = abilities(&format!(
            "ability_signature = {{ {} }}
             ability_ultimate = {{ {} }}
             ability_innate = {{ {} }}
             ability_weapon = {{ {} }}",
            with_type("EAbilityType_Signature"),
            with_type("EAbilityType_Ultimate"),
            with_type("EAbilityType_Innate"),
            with_type("EAbilityType_Weapon"),
        ));
        let mut classes: Vec<String> =
            localised_abilities(&raw_abilities(&doc), &[]).into_iter().map(|a| a.class_name).collect();
        classes.sort();
        assert_eq!(classes, ["ability_signature", "ability_ultimate"]);
    }

    #[test]
    fn an_earlier_language_wins_and_english_fills_its_gaps() {
        let german = LocalizationFile {
            language: "german".into(),
            tokens: tokens("\"citadel_ability_lightning_ball\" \"Blitzkugel\""),
        };
        let ball = tooltip_of("citadel_ability_lightning_ball", LIGHTNING_BALL, &[german, lightning_ball_tokens()]);
        assert_eq!(ball.name, "Blitzkugel");
        assert_eq!(ball.cooldown.map(|c| c.label), Some("Cooldown".into()));
    }
}

#[cfg(test)]
mod installed_tests {
    use std::path::PathBuf;

    use super::*;
    use crate::catalog::{Install, SteamInstall};
    use crate::progression::HeroesSource;
    use crate::shop::{ShopSource, ABILITIES_PATH};
    use crate::tooltip::bundle_localisation;
    use crate::vpk_source::VpkVdataSource;

    fn installed() -> Option<PathBuf> {
        let dir = std::env::var_os("DEADLOCK_CITADEL_DIR").map(PathBuf::from).or_else(|| SteamInstall.citadel_dir());
        let dir = dir.filter(|d| d.join(deadlock_data::vdata::ARCHIVE).is_file());
        if dir.is_none() {
            eprintln!("skipped: no installed Deadlock");
        }
        dir
    }

    // Checked against Seven's Lightning Ball tooltip in game at 1440p, game build 6805.
    #[test]
    fn the_installed_lightning_ball_matches_the_game() {
        let Some(dir) = installed() else { return };
        let abilities = ShopSource::read(&VpkVdataSource, &dir, ABILITIES_PATH).expect("abilities.vdata reads");
        let all =
            localised_abilities(&raw_abilities(&abilities), &bundle_localisation(&dir, "english", &ABILITY_BUNDLES));
        let ball = all.iter().find(|a| a.class_name == "citadel_ability_lightning_ball").expect("Lightning Ball");
        let shown = |p: &TooltipProperty| format!("{:?}{} {}", p.value, p.unit.as_deref().unwrap_or(""), p.label);

        assert_eq!(ball.name, "Lightning Ball");
        assert!(ball.header.is_empty());
        assert_eq!(ball.charges.as_ref().map(shown).as_deref(), Some("Some(1.0) Charges"));
        assert_eq!(ball.charge_cooldown.as_ref().map(shown).as_deref(), Some("Some(6.0)s Charge Delay"));
        assert_eq!(ball.cooldown.as_ref().map(shown).as_deref(), Some("Some(26.0)s Cooldown"));

        let section = &ball.sections[0];
        assert!(section
            .description
            .as_deref()
            .unwrap()
            .starts_with("Shoot a ball of lightning that travels in a straight line."));
        let cells: Vec<String> = section.groups[0].cells.iter().map(shown).collect();
        assert_eq!(cells, ["Some(75.0) Damage Per Second", "Some(4.25)m Radius"]);
        assert_eq!(section.groups[0].cells[0].scale.as_ref().and_then(|s| s.factor), Some(0.5));
        assert_eq!(section.properties.iter().map(shown).collect::<Vec<_>>(), ["Some(5.0)s Lifetime"]);

        let upgrades = &ball.upgrades;
        assert_eq!(upgrades.iter().map(|u| u.cost).collect::<Vec<_>>(), [1, 2, 5]);
        assert_eq!(upgrades[0].description, None);
        assert_eq!(upgrades[0].bonuses.iter().map(|b| shown(&b.property)).collect::<Vec<_>>(), ["Some(1.0) Charges"]);
        assert!(upgrades[1].description.as_deref().unwrap().contains("move speed on hit targets"));
        assert_eq!(upgrades[1].values.get("SlowPercent"), Some(&28.0));
        assert_eq!(upgrades[1].values.get("MaxLifetime"), Some(&1.0));
        assert_eq!(upgrades[2].description.as_deref(), Some("+{s:DPS} DPS and +{s:ShockRadius}m radius"));
        assert_eq!(upgrades[2].values.get("DPS"), Some(&58.5));
        assert_eq!(upgrades[2].values.get("ShockRadius"), Some(&1.75));
    }

    fn installed_tooltips(dir: &std::path::Path) -> Vec<AbilityTooltip> {
        let abilities = ShopSource::read(&VpkVdataSource, dir, ABILITIES_PATH).expect("abilities.vdata reads");
        localised_abilities(&raw_abilities(&abilities), &bundle_localisation(dir, "english", &ABILITY_BUNDLES))
    }

    #[test]
    fn every_released_heros_ability_bar_has_a_tooltip_with_three_tiers() {
        let Some(dir) = installed() else { return };
        let heroes = HeroesSource::read(&VpkVdataSource, &dir).expect("heroes.vdata reads");
        let by_id: HashMap<u32, AbilityTooltip> =
            installed_tooltips(&dir).into_iter().map(|a| (a.ability_id, a)).collect();
        let released = heroes.root.as_object().expect("heroes root").iter().filter(|(_, hero)| {
            hero.get("m_eHeroDevelopmentState").and_then(Value::as_str) == Some("EHeroDevState_Release")
        });
        let mut checked = 0;
        let mut missing = Vec::new();
        for (hero, data) in released {
            for slot in 1..=4 {
                let class = data
                    .get("m_mapBoundAbilities")
                    .and_then(|s| s.get(&format!("ESlot_Signature_{slot}")))
                    .and_then(Value::as_str);
                match class.and_then(|c| by_id.get(&ability_id(c))) {
                    Some(tooltip) if tooltip.upgrades.len() == 3 => checked += 1,
                    _ => missing.push(format!("{hero} slot {slot}: {class:?}")),
                }
            }
        }
        assert!(missing.is_empty(), "{missing:?}");
        assert!(checked >= 4 * 30, "{checked} abilities checked");
    }

    // Read from `abilities.vdata_c` of game build 6805; not yet checked against an in-game capture.
    #[test]
    fn the_installed_storm_cloud_ultimate_has_its_tooltip() {
        let Some(dir) = installed() else { return };
        let all = installed_tooltips(&dir);
        let cloud = all.iter().find(|a| a.ability_id == 2_061_574_352).expect("Seven's ultimate");
        let shown = |p: &TooltipProperty| format!("{:?}{} {}", p.value, p.unit.as_deref().unwrap_or(""), p.label);

        assert_eq!(cloud.name, "Storm Cloud");
        assert_eq!(
            cloud.header.iter().map(shown).collect::<Vec<_>>(),
            ["Some(7.0)s Channel Duration", "Some(30.0)m Radius"]
        );
        assert_eq!(cloud.cooldown.as_ref().map(shown).as_deref(), Some("Some(205.0)s Cooldown"));
        assert_eq!(cloud.charges, None);
        let cells: Vec<String> = cloud.sections[0].groups[0].cells.iter().map(shown).collect();
        assert_eq!(cells, ["Some(95.0) Damage Per Second", "Some(1.5)m Flight Speed"]);
        assert_eq!(cloud.upgrades.iter().map(|u| u.cost).collect::<Vec<_>>(), [1, 2, 5]);
        assert_eq!(cloud.upgrades[0].values.get("BulletResistOnActive"), Some(&55.0));
    }

    #[test]
    fn every_installed_section_that_needs_an_upgrade_names_its_tier() {
        let Some(dir) = installed() else { return };
        let abilities = ShopSource::read(&VpkVdataSource, &dir, ABILITIES_PATH).expect("abilities.vdata reads");
        let all =
            localised_abilities(&raw_abilities(&abilities), &bundle_localisation(&dir, "english", &ABILITY_BUNDLES));
        assert!(all.len() > 150, "{} abilities", all.len());
        let gated = all.iter().flat_map(|a| &a.sections).filter(|s| s.required_tier.is_some()).count();
        assert!(gated >= 7, "{gated} gated sections");
    }
}
