use std::collections::{BTreeMap, HashMap};
use std::path::Path;

use deadlock_data::LocalizationFile;
use serde::Serialize;
use source2_kv3::{Object, Value};
use ts_rs::TS;

use crate::item_stats::number;

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct TooltipProperty {
    /// The property name, or the status effect (`StatusEffectInvisible`) for a status cell.
    pub key: String,
    /// None for a status cell that names the effect without a number.
    pub value: Option<f64>,
    pub unit: Option<String>,
    pub label: String,
    /// The `<property>_prefix` token asks for a `+` on positive values.
    pub signed: bool,
    /// Literal text the `<property>_prefix` token puts before the value, such as `-` on a slow.
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prefix: Option<String>,
    /// `m_strCSSClass`, which picks the game's icon and label colour.
    pub css_class: Option<String>,
    /// `m_eDisplayType`, the hero stat the game shows this value as (`EBuildUpRate`).
    pub display_type: Option<String>,
    pub scale: Option<StatScale>,
    pub status_effect: bool,
    /// `m_eStatsUsageFlags` holds `ConditionallyApplied`: the stat only counts while its condition holds.
    #[ts(as = "Option<bool>", optional)]
    pub conditional: bool,
    /// `m_bIsNegativeAttribute`: a drawback of the item or ability.
    #[ts(as = "Option<bool>", optional)]
    pub negative: bool,
}

/// How a value grows with a hero stat.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct StatScale {
    /// The game's stat enum (`ETechPower`); None when the scale function does not name one.
    pub stat: Option<String>,
    /// Shown as `x factor` beside the value. None when the hero's stat rescales the value itself, with no marker.
    pub factor: Option<f64>,
    /// The scale function's class (`scale_function_tech_damage`).
    pub function: String,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct RawProperty {
    pub(crate) key: String,
    pub(crate) token: String,
    pub(crate) value: Option<f64>,
    /// The token whose `_postfix` is the unit: a status cell takes it from the property holding its number.
    pub(crate) unit_token: Option<String>,
    pub(crate) metres: bool,
    pub(crate) css_class: Option<String>,
    pub(crate) display_type: Option<String>,
    pub(crate) scale: Option<StatScale>,
    /// The value equals `m_strDisableValue`: the game hides the property.
    pub(crate) disabled: bool,
    pub(crate) status_effect: bool,
    pub(crate) conditional: bool,
    pub(crate) negative: bool,
}

/// Every numeric property of an item or ability entry, for the description placeholders.
pub(crate) fn property_values(properties: Option<&Object>) -> HashMap<String, f64> {
    properties
        .map(|p| p.iter().filter_map(|(k, v)| Some((k.to_string(), number(v.get("m_strValue")?)?.0))).collect())
        .unwrap_or_default()
}

pub(crate) fn raw_property(name: &str, properties: &Object) -> Option<RawProperty> {
    let property = properties.get(name)?.as_object()?;
    let (value, metres) = number(property.get("m_strValue")?)?;
    let text = |field: &str| property.get(field).and_then(Value::as_str).filter(|s| !s.is_empty());
    let token = text("m_strLocTokenOverride").map_or(name, |t| t.trim_start_matches('#'));
    let disabled = property.get("m_strDisableValue").and_then(number).is_some_and(|(off, _)| off == value);
    Some(RawProperty {
        key: name.to_string(),
        token: token.to_string(),
        value: Some(value),
        unit_token: Some(token.to_string()),
        metres,
        css_class: text("m_strCSSClass").map(str::to_string),
        display_type: text("m_eDisplayType").map(str::to_string),
        scale: property.get("m_subclassScaleFunction").and_then(stat_scale),
        disabled,
        status_effect: false,
        conditional: text("m_eStatsUsageFlags").is_some_and(|f| f.contains("ConditionallyApplied")),
        negative: property.get("m_bIsNegativeAttribute").and_then(Value::as_bool) == Some(true),
    })
}

/// One boxed cell: a property by name, or a status cell that names an effect, not a property; the status
/// cell's number, if any, is another property. `with_value` false drops that number.
pub(crate) fn important_cell(cell: &Value, properties: Option<&Object>, with_value: bool) -> Option<RawProperty> {
    let name = cell.get("m_strImportantProperty").and_then(Value::as_str)?;
    if let Some(property) = raw_property(name, properties?) {
        return Some(property);
    }
    let shown = cell.get("m_strStatusEffectValue").and_then(Value::as_str);
    let measured = shown.and_then(|p| raw_property(p, properties?));
    let value = measured.as_ref().and_then(|m| m.value).filter(|_| with_value);
    name.starts_with("StatusEffect").then(|| RawProperty {
        key: name.to_string(),
        token: format!("Citadel_{name}"),
        value,
        unit_token: measured.as_ref().and_then(|m| m.unit_token.clone()).filter(|_| value.is_some()),
        metres: measured.as_ref().is_some_and(|m| m.metres),
        css_class: measured.as_ref().and_then(|m| m.css_class.clone()),
        display_type: measured.as_ref().and_then(|m| m.display_type.clone()),
        scale: measured.as_ref().and_then(|m| m.scale.clone()),
        disabled: false,
        status_effect: true,
        conditional: measured.as_ref().is_some_and(|m| m.conditional),
        negative: measured.as_ref().is_some_and(|m| m.negative),
    })
}

/// The names in a list of property names, as properties; unknown names are left out.
pub(crate) fn named_properties(list: Option<&Value>, properties: Option<&Object>) -> Vec<RawProperty> {
    list.and_then(Value::as_array)
        .unwrap_or_default()
        .iter()
        .filter_map(Value::as_str)
        .filter_map(|name| raw_property(name, properties?))
        .collect()
}

/// A `#token` reference, without its `#`; None when empty.
pub(crate) fn loc_token(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_str).map(|t| t.trim_start_matches('#')).filter(|t| !t.is_empty()).map(str::to_string)
}

const TECH_DAMAGE_SCALE: &str = "scale_function_tech_damage";

/// A scale with a factor, or one that names the hero stat rescaling the value. Multi-stat and switched-off
/// functions are left out: the game's tooltip shows no marker for them.
fn stat_scale(function: &Value) -> Option<StatScale> {
    if function.get("m_bFunctionDisabled").and_then(Value::as_bool) == Some(true) {
        return None;
    }
    let class = function.get("_class").and_then(Value::as_str).unwrap_or_default();
    let named = function.get("m_eSpecificStatScaleType").and_then(Value::as_str).map(str::to_string);
    let factor = match function.get("m_flStatScale").and_then(Value::as_f64) {
        Some(0.0) => return None,
        Some(f) => Some(f),
        None if named.is_some() && function.get("m_vecScalingStats").is_none() => None,
        None => return None,
    };
    // Spirit damage grows with Spirit Power without naming it.
    let stat = named.or_else(|| (factor.is_some() && class == TECH_DAMAGE_SCALE).then(|| "ETechPower".to_string()));
    Some(StatScale { stat, factor, function: class.to_string() })
}

/// Token lookup across the game language and its fallback, any case.
pub(crate) type Find<'a> = dyn Fn(&str) -> Option<&'a str> + 'a;

/// The `_label` token, or `_postvalue_label` when the game only has that one.
pub(crate) fn property_label<'a>(raw: &RawProperty, find: &Find<'a>) -> Option<&'a str> {
    let token = |suffix: &str| find(&format!("{}{suffix}", raw.token)).filter(|t| !t.is_empty());
    if raw.status_effect {
        find(&raw.token)
    } else {
        token("_label").or_else(|| token("_postvalue_label"))
    }
}

/// A shown property; a zero or the disable value shows nothing in the game: the property is switched off.
pub(crate) fn localised_property(raw: &RawProperty, find: &Find<'_>) -> Option<TooltipProperty> {
    if (raw.value == Some(0.0) || raw.disabled) && !raw.status_effect {
        return None;
    }
    labelled_property(raw, raw.value, find)
}

/// `raw` labelled with `value` in place of its own, which may be zero (an upgrade's bonus to a property that
/// starts at nothing).
pub(crate) fn labelled_property(raw: &RawProperty, value: Option<f64>, find: &Find<'_>) -> Option<TooltipProperty> {
    let label = property_label(raw, find)?;
    let token = |suffix: &str| find(&format!("{}{suffix}", raw.token)).filter(|t| !t.is_empty());
    let unit = raw.unit_token.as_ref().and_then(|t| find(&format!("{t}_postfix"))).filter(|u| !u.is_empty());
    let prefix = token("_prefix");
    let signed = prefix.is_some_and(|p| p.contains("{s:sign}") || p.contains('+'));
    Some(TooltipProperty {
        key: raw.key.clone(),
        value,
        unit: unit.map(str::to_string).or_else(|| raw.metres.then(|| "m".into())),
        label: label.to_string(),
        signed,
        prefix: prefix.filter(|_| !signed).map(str::to_string),
        css_class: raw.css_class.clone(),
        display_type: raw.display_type.clone(),
        scale: raw.scale.clone(),
        status_effect: raw.status_effect,
        conditional: raw.conditional,
        negative: raw.negative,
    })
}

/// A description token in the game language, with inline attributes resolved, and the numbers of the
/// `{s:Property}` placeholders it holds that `values` knows.
pub(crate) fn localised_description(
    token: Option<&str>,
    values: &dyn Fn(&str) -> Option<f64>,
    find: &Find<'_>,
) -> (Option<String>, BTreeMap<String, f64>) {
    let description = token.and_then(find).map(|text| inline_attributes(text, find));
    let shown = description
        .as_deref()
        .map(|text| placeholders(text).filter_map(|name| Some((name.to_string(), values(name)?))).collect())
        .unwrap_or_default();
    (description, shown)
}

pub(crate) const INLINE_ATTRIBUTE: &str = "{g:citadel_inline_attribute:'";

/// `{g:citadel_inline_attribute:'SpiritDamage'}` becomes a span holding the `InlineAttribute_SpiritDamage` text,
/// the same shape deadlock-api serves, so one parser reads both.
fn inline_attributes(text: &str, find: &Find<'_>) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find(INLINE_ATTRIBUTE) {
        out.push_str(&rest[..at]);
        let after = &rest[at + INLINE_ATTRIBUTE.len()..];
        let Some(end) = after.find("'}") else {
            rest = &rest[at..];
            break;
        };
        let name = &after[..end];
        let label = find(&format!("InlineAttribute_{name}")).unwrap_or_default();
        out.push_str(&format!("<span class=\"inline-attribute-label {name}\">{label}</span>"));
        rest = &after[end + 2..];
    }
    out.push_str(rest);
    out
}

fn placeholders(text: &str) -> impl Iterator<Item = &str> {
    text.split("{s:").skip(1).filter_map(|part| part.split_once('}').map(|(name, _)| name))
}

/// Every token of `localisation`, lowercased: token case is inconsistent in the game's own files
/// (`TechArmorDamageReduction_Label`). Earlier files win.
pub(crate) fn token_map(localisation: &[LocalizationFile]) -> HashMap<String, &str> {
    let mut tokens: HashMap<String, &str> = HashMap::new();
    for file in localisation.iter().rev() {
        tokens.extend(file.tokens.iter().map(|(k, v)| (k.to_ascii_lowercase(), v.as_str())));
    }
    tokens
}

/// `bundles` for `language`, then English to fill its gaps.
pub(crate) fn bundle_localisation(citadel_dir: &Path, language: &str, bundles: &[&str]) -> Vec<LocalizationFile> {
    let mut languages = vec![language];
    if language != deadlock_data::DEFAULT_LANGUAGE {
        languages.push(deadlock_data::DEFAULT_LANGUAGE);
    }
    languages
        .into_iter()
        .flat_map(|language| bundles.iter().map(move |bundle| (*bundle, language)))
        .filter_map(|(bundle, language)| {
            // Read with our own parser: descriptions hold `\"` inside their quotes.
            let path = citadel_dir.join(LocalizationFile::relative_path(bundle, language));
            let bytes =
                std::fs::read(&path).map_err(|e| log::debug!("{bundle} for {language} unavailable: {e}")).ok()?;
            let tokens = parse_bundle(&String::from_utf8_lossy(&bytes));
            Some(LocalizationFile { language: language.to_string(), tokens })
        })
        .collect()
}

/// Parses a localisation bundle like the game: `"key" "value"` lines whose values may hold `\"`.
pub(crate) fn parse_bundle(text: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for line in text.trim_start_matches('\u{feff}').lines() {
        let mut strings = quoted(line);
        let (Some(key), Some(value)) = (strings.next(), strings.next()) else { continue };
        let key = key.trim();
        let key = key.split(':').next().unwrap_or(key);
        if key.is_empty() || key.ends_with("_search") || key.ends_with("_sort") {
            continue;
        }
        out.insert(key.to_string(), value.trim().to_string());
    }
    out
}

fn quoted(line: &str) -> impl Iterator<Item = String> + '_ {
    let mut chars = line.chars();
    std::iter::from_fn(move || {
        if line.trim_start().starts_with("//") {
            return None;
        }
        chars.by_ref().find(|c| *c == '"')?;
        let mut text = String::new();
        while let Some(c) = chars.next() {
            match c {
                '"' => return Some(text),
                '\\' => match chars.next()? {
                    'n' => text.push('\n'),
                    other => text.push(other),
                },
                c => text.push(c),
            }
        }
        None
    })
}

#[cfg(test)]
pub(crate) mod tests {
    use source2_kv3::Document;

    use super::*;

    pub(crate) fn entry(text: &str) -> Object {
        Document::from_text(text).expect("test entry parses").root.as_object().expect("an object").clone()
    }

    pub(crate) fn tokens(body: &str) -> HashMap<String, String> {
        parse_bundle(&format!("\"lang\"\n{{\n\"Tokens\"\n{{\n{body}\n}}\n}}"))
    }

    /// A case-blind lookup over `loc`, as the game reads tokens.
    pub(crate) fn lookup(loc: &HashMap<String, String>) -> HashMap<String, &str> {
        loc.iter().map(|(k, v)| (k.to_ascii_lowercase(), v.as_str())).collect()
    }

    #[test]
    fn bundles_keep_escaped_quotes_and_drop_grammar_suffixes_and_comments() {
        let parsed = tokens(
            "\"a_desc\"\t\"Deal <span class=\\\"highlight\\\">more</span>\"\n\
             // \"commented\" \"out\"\n\
             \"hero:n\" \"Haze\"\n\"hero_search\" \"x\"\n\"Squashed\"\"together\"",
        );
        assert_eq!(parsed.get("a_desc").map(String::as_str), Some("Deal <span class=\"highlight\">more</span>"));
        assert_eq!(parsed.get("hero").map(String::as_str), Some("Haze"));
        assert_eq!(parsed.get("Squashed").map(String::as_str), Some("together"));
        assert!(!parsed.contains_key("commented") && !parsed.contains_key("hero_search"));
    }

    #[test]
    fn a_literal_prefix_is_kept_and_a_sign_prefix_is_not() {
        let properties = entry(r#"{ Slow = { m_strValue = "30" } Range = { m_strValue = "6" } }"#);
        let loc = tokens(
            "\"Slow_label\" \"Move Speed\"\n\"Slow_prefix\" \"-\"\n\
             \"Range_label\" \"Range\"\n\"Range_prefix\" \"{s:sign}\"",
        );
        let lower = lookup(&loc);
        let find = |t: &str| lower.get(&t.to_ascii_lowercase()).copied();
        let shown = |name: &str| localised_property(&raw_property(name, &properties).unwrap(), &find).unwrap();
        assert_eq!((shown("Slow").signed, shown("Slow").prefix.as_deref()), (false, Some("-")));
        assert_eq!((shown("Range").signed, shown("Range").prefix), (true, None));
    }

    #[test]
    fn a_bonus_label_is_kept_for_a_property_that_starts_at_zero() {
        let properties = entry(r#"{ Slow = { m_strValue = "0" } }"#);
        let loc = tokens("\"Slow_label\" \"Move Speed\"");
        let lower = lookup(&loc);
        let find = |t: &str| lower.get(&t.to_ascii_lowercase()).copied();
        let raw = raw_property("Slow", &properties).unwrap();
        assert_eq!(localised_property(&raw, &find), None);
        assert_eq!(
            labelled_property(&raw, Some(28.0), &find).map(|p| (p.label, p.value)),
            Some(("Move Speed".into(), Some(28.0)))
        );
    }

    #[test]
    fn a_status_cell_can_leave_out_its_number() {
        let properties = entry(r#"{ StunDuration = { m_strValue = "1.5" } }"#);
        let cell = Document::from_text(
            r#"{ m_strImportantProperty = "StatusEffectStun" m_strStatusEffectValue = "StunDuration" }"#,
        )
        .unwrap()
        .root;
        let with = important_cell(&cell, Some(&properties), true).unwrap();
        let without = important_cell(&cell, Some(&properties), false).unwrap();
        assert_eq!((with.value, with.status_effect), (Some(1.5), true));
        assert_eq!((without.value, without.unit_token, without.status_effect), (None, None, true));
    }

    #[test]
    fn a_property_says_whether_it_applies_conditionally_and_whether_it_is_a_drawback() {
        let properties = entry(
            r#"{ FireRate = { m_strValue = "25" m_eStatsUsageFlags = "ConditionallyApplied" }
                 HealthLoss = { m_strValue = "-13" m_bIsNegativeAttribute = true }
                 Plain = { m_strValue = "3" m_eStatsUsageFlags = "IntrinsicallyProvidedInAbility" m_bIsNegativeAttribute = false } }"#,
        );
        let loc = tokens("\"FireRate_label\" \"F\"\n\"HealthLoss_label\" \"H\"\n\"Plain_label\" \"P\"");
        let lower = lookup(&loc);
        let find = |t: &str| lower.get(&t.to_ascii_lowercase()).copied();
        let flags = |name: &str| {
            let p = localised_property(&raw_property(name, &properties).unwrap(), &find).unwrap();
            (p.conditional, p.negative)
        };
        assert_eq!(flags("FireRate"), (true, false));
        assert_eq!(flags("HealthLoss"), (false, true));
        assert_eq!(flags("Plain"), (false, false));
    }
}
