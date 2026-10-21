use std::collections::HashMap;

use serde::Serialize;
use ts_rs::TS;

/// The game's stylesheet that gives tooltip properties and status cells their icons.
pub(crate) const STYLESHEET: &str = "panorama/styles/ability_property_icons.vcss_c";
/// The game's base styles: the colour `@define`s and the inline attribute keyword icons and colours.
pub(crate) const BASE_STYLESHEET: &str = "panorama/styles/citadel_base_styles.vcss_c";

/// A local icon file for one tooltip icon class, as the game's stylesheets assign it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PropertyIconArt {
    /// A property's `cssClass` (`tech_damage`, styled as `.prop_tech_damage`), a status cell's `key`
    /// (`StatusEffectEMP`) or a description's inline attribute keyword (`SpiritDamage`).
    pub class: String,
    pub path: String,
    /// The stylesheet's `wash-color`: hex where the base styles define the name (`#ce90ff`, maybe with a
    /// Panorama `&xx` alpha), otherwise as written (`none`, `white`).
    pub wash: Option<String>,
    /// An inline attribute keyword's label colour, written like `wash`; None keeps the description's colour.
    pub color: Option<String>,
}

/// One icon class and the compiled image the stylesheet draws for it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct IconRule {
    pub(crate) class: String,
    pub(crate) image: String,
    pub(crate) wash: Option<String>,
    pub(crate) color: Option<String>,
}

const IMAGES: &str = "s2r://panorama/images/";

/// The icon classes of a compiled stylesheet in first-seen order. Each declaration takes its last value, as
/// the rules share one specificity; classes the stylesheet never gives an image are left out.
pub(crate) fn icon_rules(css: &str) -> Vec<IconRule> {
    cascade(css, |selector| icon_class(selector).map(|class| (class, Part::Icon)))
        .into_iter()
        .filter_map(|(class, d)| Some(IconRule { class, image: d.image()?, wash: d.wash, color: None }))
        .collect()
}

/// The inline attribute keywords of the game's base styles in first-seen order: `.InlineAttributeIcon.<Name>`
/// gives the image and wash, `.InlineAttributeName.<Name>` the label colour. A keyword without its own wash
/// takes the plain `.InlineAttributeIcon` one. Colours are resolved through the file's `@define`s; keywords
/// the stylesheet never gives an image are left out.
pub(crate) fn inline_attribute_rules(css: &str) -> Vec<IconRule> {
    let defines = defines(css);
    let mut base_wash = None;
    each_rule(css, |selectors, body| {
        if selectors.split(',').any(|s| s.trim() == INLINE_ICON) {
            base_wash = declaration(body, "wash-color").map(str::to_string).or(base_wash.take());
        }
    });
    cascade(css, inline_attribute)
        .into_iter()
        .filter_map(|(class, d)| {
            Some(IconRule {
                class,
                image: d.image()?,
                wash: color(d.wash.as_deref().or(base_wash.as_deref()), &defines),
                color: color(d.color.as_deref(), &defines),
            })
        })
        .collect()
}

/// Property icon washes name base-style colours (`spiritBrightColor`); `base_css` defines them.
pub(crate) fn resolve_washes(rules: &mut [IconRule], base_css: &str) {
    let defines = defines(base_css);
    for rule in rules {
        rule.wash = color(rule.wash.as_deref(), &defines);
    }
}

const INLINE_ICON: &str = ".InlineAttributeIcon";
const INLINE_NAME: &str = ".InlineAttributeName";

fn inline_attribute(selector: &str) -> Option<(&str, Part)> {
    let selector = selector.trim();
    let (name, part) = if let Some(name) = selector.strip_prefix(INLINE_ICON) {
        (name, Part::Icon)
    } else {
        (selector.strip_prefix(INLINE_NAME)?, Part::Name)
    };
    let name = name.strip_prefix('.')?;
    (!name.is_empty() && name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')).then_some((name, part))
}

#[derive(Clone, Copy)]
enum Part {
    /// `background-image` and `wash-color`.
    Icon,
    /// `color`.
    Name,
}

#[derive(Default)]
struct Declared {
    /// `Some(None)` is an image this cache may not read, which still overrides an earlier one.
    image: Option<Option<String>>,
    wash: Option<String>,
    color: Option<String>,
}

impl Declared {
    fn image(&self) -> Option<String> {
        self.image.clone().flatten()
    }
}

/// Each class `target` picks out of a selector, with the declarations its part reads, in first-seen order.
fn cascade(css: &str, target: impl Fn(&str) -> Option<(&str, Part)>) -> Vec<(String, Declared)> {
    let mut out: Vec<(String, Declared)> = Vec::new();
    each_rule(css, |selectors, body| {
        let image = declaration(body, "background-image").map(compiled_image);
        let wash = declaration(body, "wash-color");
        let color = declaration(body, "color");
        for (class, part) in selectors.split(',').filter_map(&target) {
            let at = match out.iter().position(|(c, _)| c == class) {
                Some(at) => at,
                None => {
                    out.push((class.to_string(), Declared::default()));
                    out.len() - 1
                }
            };
            let declared = &mut out[at].1;
            match part {
                Part::Icon => {
                    if let Some(image) = &image {
                        declared.image = Some(image.clone());
                    }
                    if let Some(wash) = wash {
                        declared.wash = Some(wash.to_string());
                    }
                }
                Part::Name => {
                    if let Some(color) = color {
                        declared.color = Some(color.to_string());
                    }
                }
            }
        }
    });
    out
}

/// Calls `f` with each rule's selector list and body. Comments are skipped, and so are the `@define` and
/// `@import` statements that sit between rules in the game's stylesheets.
fn each_rule(css: &str, mut f: impl FnMut(&str, &str)) {
    let css = without_comments(css);
    for rule in css.split('}') {
        let Some((mut selectors, body)) = rule.split_once('{') else { continue };
        while selectors.trim_start().starts_with('@') {
            let Some((_, rest)) = selectors.split_once(';') else { break };
            selectors = rest;
        }
        f(selectors, body);
    }
}

fn defines(css: &str) -> HashMap<String, String> {
    without_comments(css)
        .split("@define ")
        .skip(1)
        .filter_map(|statement| {
            let (name, value) = statement.split_once(';')?.0.split_once(':')?;
            Some((name.trim().to_string(), value.trim().to_string()))
        })
        .collect()
}

/// A Panorama colour with its `@define` names followed to a value and hex lowercased, keeping an `&xx` alpha
/// suffix. Names the file does not define (`none`, `white`) stay as written.
fn color(value: Option<&str>, defines: &HashMap<String, String>) -> Option<String> {
    let (mut name, alpha) = match value?.split_once('&') {
        Some((name, alpha)) => (name.trim(), Some(alpha.trim())),
        None => (value?.trim(), None),
    };
    for _ in 0..8 {
        match defines.get(name) {
            Some(next) if next != name => name = next,
            _ => break,
        }
    }
    let name = if name.starts_with('#') { name.to_ascii_lowercase() } else { name.to_string() };
    Some(match alpha {
        Some(alpha) => format!("{name}&{alpha}"),
        None => name,
    })
}

fn without_comments(css: &str) -> String {
    let mut out = String::with_capacity(css.len());
    let mut rest = css;
    while let Some(start) = rest.find("/*") {
        out.push_str(&rest[..start]);
        rest = rest[start + 2..].find("*/").map_or("", |end| &rest[start + 2 + end + 2..]);
    }
    out.push_str(rest);
    out
}

fn declaration<'a>(body: &'a str, name: &str) -> Option<&'a str> {
    body.split(';')
        .filter_map(|d| d.split_once(':'))
        .filter(|(n, _)| n.trim() == name)
        .map(|(_, v)| v.trim())
        .next_back()
}

/// `url("s2r://panorama/images/x.vsvg")` names the compiled `x.vsvg_c`. Anything else is not an image
/// this cache may read, which an explicit `None` records so it still overrides an earlier image.
fn compiled_image(value: &str) -> Option<String> {
    let path = value.strip_prefix("url(\"")?.strip_suffix("\")")?;
    let rest = path.strip_prefix(IMAGES)?;
    let safe = rest.split('/').all(|part| {
        !part.is_empty() && part != ".." && part.bytes().all(|b| b.is_ascii_alphanumeric() || b"_-.".contains(&b))
    });
    (safe && (rest.ends_with(".vsvg") || rest.ends_with(".vtex"))).then(|| format!("{}_c", &path["s2r://".len()..]))
}

/// `.prop_<class>.AbilityPropertyIcon` and `.prop_<class> .ImportantStatImage` style a property;
/// `.StatusEffect<Name> .ImportantStatImage` styles a status cell.
fn icon_class(selector: &str) -> Option<&str> {
    let selector = selector.trim();
    let class = if let Some(rest) = selector.strip_prefix(".prop_") {
        rest.strip_suffix(".AbilityPropertyIcon").or_else(|| rest.strip_suffix(" .ImportantStatImage"))?
    } else if selector.starts_with(".StatusEffect") {
        selector[1..].strip_suffix(" .ImportantStatImage")?
    } else {
        return None;
    };
    (!class.is_empty() && class.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')).then_some(class)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule(class: &str, image: &str, wash: Option<&str>) -> IconRule {
        IconRule { class: class.into(), image: image.into(), wash: wash.map(str::to_string), color: None }
    }

    fn inline(name: &str, image: &str, wash: &str, color: Option<&str>) -> IconRule {
        IconRule { class: name.into(), image: image.into(), wash: Some(wash.into()), color: color.map(str::to_string) }
    }

    // Shaped after `citadel_base_styles.css`, game build 6805: defines sit between rules.
    const BASE_CSS: &str = concat!(
        "@define sans: Radiance, Retail Demo, Noto Sans, sans-serif;@define offWhite: #FFEFD7;",
        "@define spiritBrightColor: #CE90FF;@define colorEnemy: #FF410D;@define courageBrightColor: #EC9719;",
        ".InlineAttributeIcon{width: 16px;wash-color: offWhite;background-size: contain;}",
        "@keyframes Pulse{0%{opacity: 0;}100%{opacity: 1;}}",
        ".InlineAttributeIcon.Fortitude{background-image: url(\"s2r://panorama/images/shop/keystat_fortitude_png.vtex\");}",
        ".InlineAttributeIcon.Spirit{background-image: url(\"s2r://panorama/images/icons/properties/spirit.vsvg\");",
        "wash-color: spiritBrightColor;}",
        "@define soulColor: #70F8C1;",
        ".InlineAttributeIcon.Slow,.InlineAttributeIcon.Slowing{background-image: ",
        "url(\"s2r://panorama/images/upgrades/property_slow_large_psd.vtex\");}",
        ".InlineAttributeIcon.Debuff{background-image: url(\"s2r://panorama/images/hud/modifiers/icon_toxic.vsvg\");",
        "wash-color: #99f051;}",
        ".InlineAttributeIcon.PureDamage{background-image: url(\"s2r://panorama/images/hud/core/icon_damage_force.vsvg\");",
        "wash-color: white;}",
        ".InlineAttributeName{font-weight: semi-bold;}",
        ".InlineAttributeName.Fortitude{color: #7bb02a;}",
        ".InlineAttributeName.Slow,.InlineAttributeName.Debuff{color: offWhite;}",
        ".InlineAttributeName.Spirit{color: spiritBrightColor&ea;}",
        ".InlineAttributeName.PureDamage{color: white;}",
        ".InlineAttributeName.OnlyColour{color: courageBrightColor;}",
        ".InlineAttributeIcon .Fortitude{background-image: url(\"s2r://panorama/images/wrong.vsvg\");}",
    );

    #[test]
    fn inline_attributes_get_their_image_wash_and_label_colour_in_hex() {
        assert_eq!(
            inline_attribute_rules(BASE_CSS),
            [
                inline("Fortitude", "panorama/images/shop/keystat_fortitude_png.vtex_c", "#ffefd7", Some("#7bb02a")),
                inline("Spirit", "panorama/images/icons/properties/spirit.vsvg_c", "#ce90ff", Some("#ce90ff&ea")),
                inline("Slow", "panorama/images/upgrades/property_slow_large_psd.vtex_c", "#ffefd7", Some("#ffefd7")),
                inline("Slowing", "panorama/images/upgrades/property_slow_large_psd.vtex_c", "#ffefd7", None),
                inline("Debuff", "panorama/images/hud/modifiers/icon_toxic.vsvg_c", "#99f051", Some("#ffefd7")),
                inline("PureDamage", "panorama/images/hud/core/icon_damage_force.vsvg_c", "white", Some("white")),
            ]
        );
    }

    #[test]
    fn property_icon_washes_resolve_through_the_base_styles_defines() {
        let mut rules = vec![
            rule("souls", "a.vsvg_c", Some("spiritBrightColor")),
            rule("cast", "b.vsvg_c", Some("none")),
            rule("distance", "c.vsvg_c", None),
            rule("health", "d.vsvg_c", Some("notDefined")),
        ];
        resolve_washes(&mut rules, BASE_CSS);
        let washes: Vec<Option<&str>> = rules.iter().map(|r| r.wash.as_deref()).collect();
        assert_eq!(washes, [Some("#ce90ff"), Some("none"), None, Some("notDefined")]);
    }

    #[test]
    fn a_define_that_names_another_define_resolves_to_the_end_of_the_chain() {
        let css = "@define base: #ABCDEF;@define alias: base;@define loop: loop;";
        let defines = defines(css);
        assert_eq!(color(Some("alias"), &defines).as_deref(), Some("#abcdef"));
        assert_eq!(color(Some("loop"), &defines).as_deref(), Some("loop"));
    }

    // Shaped after `ability_property_icons.css`, game build 6805.
    const CSS: &str = concat!(
        ".ImportantStatImage{background-size: contain;}",
        ".prop_souls.AbilityPropertyIcon,.prop_souls .ImportantStatImage{background-image: ",
        "url(\"s2r://panorama/images/hud/icons/icon_soul.vsvg\");wash-color: shardColor;}",
        ".prop_cast.AbilityPropertyIcon,.prop_cast .ImportantStatImage{background-image: ",
        "url(\"s2r://panorama/images/upgrades/property_cast_psd.vtex\");}",
        "/* .prop_commented .ImportantStatImage{background-image: url(\"s2r://panorama/images/x.vsvg\");} */",
        ".StatDesc_TechRange,.prop_distance.AbilityPropertyIcon,.prop_distance .ImportantStatImage{background-image: ",
        "url(\"s2r://panorama/images/icons/properties/range.vsvg\");opacity: 1;}",
        ".PropertiesIcon.Ammo{background-image: url(\"s2r://panorama/images/icons/properties/ammo.vsvg\");}",
        ".StatusEffectEMP .ImportantStatImage{background-image: ",
        "url(\"s2r://panorama/images/icons/properties/condition_silence.vsvg\");wash-color: spiritBrightColor;}",
    );

    #[test]
    fn property_and_status_classes_get_the_compiled_image_and_wash_the_stylesheet_names() {
        assert_eq!(
            icon_rules(CSS),
            [
                rule("souls", "panorama/images/hud/icons/icon_soul.vsvg_c", Some("shardColor")),
                rule("cast", "panorama/images/upgrades/property_cast_psd.vtex_c", None),
                rule("distance", "panorama/images/icons/properties/range.vsvg_c", None),
                rule(
                    "StatusEffectEMP",
                    "panorama/images/icons/properties/condition_silence.vsvg_c",
                    Some("spiritBrightColor")
                ),
            ]
        );
    }

    #[test]
    fn a_later_rule_wins_per_declaration_like_the_cascade() {
        let css = concat!(
            ".prop_bullet_damage.AbilityPropertyIcon{background-image: url(\"s2r://panorama/images/a.vsvg\");",
            "wash-color: none;}",
            ".prop_bullet_damage .ImportantStatImage{background-image: url(\"s2r://panorama/images/b.vsvg\");}",
            ".prop_health .ImportantStatImage{wash-color: armorColor;}",
            ".prop_health.AbilityPropertyIcon{background-image: url(\"s2r://panorama/images/health.vsvg\");}",
            ".prop_nothing .ImportantStatImage{wash-color: armorColor;}",
        );
        assert_eq!(
            icon_rules(css),
            [
                rule("bullet_damage", "panorama/images/b.vsvg_c", Some("none")),
                rule("health", "panorama/images/health.vsvg_c", Some("armorColor")),
            ]
        );
    }

    #[test]
    fn images_outside_the_panorama_images_tree_are_ignored() {
        let css = concat!(
            ".prop_a .ImportantStatImage{background-image: url(\"file://{images}/a.png\");}",
            ".prop_b .ImportantStatImage{background-image: url(\"s2r://panorama/images/../../b.vsvg\");}",
            ".prop_c .ImportantStatImage{background-image: url(\"s2r://panorama/images/c.png\");}",
            ".prop_d .ImportantStatImage{background-image: url(\"s2r://panorama/images/d e.vsvg\");}",
        );
        assert_eq!(icon_rules(css), []);
    }
}
