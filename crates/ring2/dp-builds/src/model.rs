use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::file::LOCAL_ID_LIMIT;
use crate::wire::{CurrencyChange, Details, HeroBuild, HeroBuildResult, ModCategory, ModEntry, Preference};

pub const CURRENCY_ABILITY_POINTS: i32 = 1;
pub const CURRENCY_ABILITY_UNLOCKS: i32 = 2;

/// AP for tiers 1, 2 and 3 of an ability; hard-coded in the game, not in vdata.
pub const ABILITY_TIER_COSTS: [i32; 3] = [1, 2, 5];

// The game's own first category of a new build (game build 6805).
const NEW_CATEGORY_NAME: &str = "#Citadel_HeroBuilds_EarlyGame";
const NEW_CATEGORY_WIDTH: f32 = 175.5;
const NEW_CATEGORY_HEIGHT: f32 = 162.75;

/// The editable part of a cached build. Counters and `preference.ignored` / `reported` are not in it
/// and pass through `apply` untouched.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct BuildView {
    pub hero_build_id: u32,
    pub hero_id: u32,
    pub author_account_id: u32,
    pub last_updated_timestamp: Option<u32>,
    pub name: String,
    pub description: String,
    pub language: u32,
    pub version: u32,
    pub origin_build_id: Option<u32>,
    pub mod_categories: Vec<ModCategoryView>,
    /// `details.ability_order.currency_changes`, in the order they are spent.
    pub ability_order: Vec<CurrencyChangeView>,
    pub tags: Vec<u32>,
    pub development_build: bool,
    pub publish_timestamp: Option<u32>,
    pub favorited: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ModCategoryView {
    pub mods: Vec<ModEntryView>,
    pub name: String,
    pub description: String,
    pub width: Option<f32>,
    pub height: Option<f32>,
    pub optional: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ModEntryView {
    pub ability_id: u32,
    pub annotation: Option<String>,
    pub required_flex_slots: Option<u32>,
    pub sell_priority: Option<u32>,
    pub imbue_target_ability_id: Option<u32>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct CurrencyChangeView {
    pub ability_id: u32,
    /// 1 = ability points, 2 = ability unlocks.
    pub currency_type: i32,
    /// Negative: the points spent.
    pub delta: i32,
    pub annotation: Option<String>,
}

#[must_use]
pub fn view(r: &HeroBuildResult) -> BuildView {
    let none = HeroBuild::default();
    let h = r.hero_build.as_ref().unwrap_or(&none);
    let details = h.details.as_ref();
    BuildView {
        hero_build_id: h.hero_build_id.unwrap_or_default(),
        hero_id: h.hero_id.unwrap_or_default(),
        author_account_id: h.author_account_id.unwrap_or_default(),
        last_updated_timestamp: h.last_updated_timestamp,
        name: h.name.clone().unwrap_or_default(),
        description: h.description.clone().unwrap_or_default(),
        language: h.language.unwrap_or_default(),
        version: h.version.unwrap_or_default(),
        origin_build_id: h.origin_build_id,
        mod_categories: details.map_or_else(Vec::new, |d| d.mod_categories.iter().map(view_category).collect()),
        ability_order: details
            .and_then(|d| d.ability_order.as_ref())
            .map_or_else(Vec::new, |a| a.currency_changes.iter().map(view_change).collect()),
        tags: h.tags.clone(),
        development_build: h.development_build.unwrap_or_default(),
        publish_timestamp: h.publish_timestamp,
        favorited: r.preference.as_ref().and_then(|p| p.favorited).unwrap_or_default(),
    }
}

fn view_category(c: &ModCategory) -> ModCategoryView {
    ModCategoryView {
        mods: c.mods.iter().map(view_mod).collect(),
        name: c.name.clone().unwrap_or_default(),
        description: c.description.clone().unwrap_or_default(),
        width: c.width,
        height: c.height,
        optional: c.optional.unwrap_or_default(),
    }
}

fn view_mod(m: &ModEntry) -> ModEntryView {
    ModEntryView {
        ability_id: m.ability_id.unwrap_or_default(),
        annotation: m.annotation.clone(),
        required_flex_slots: m.required_flex_slots,
        sell_priority: m.sell_priority,
        imbue_target_ability_id: m.imbue_target_ability_id,
    }
}

fn view_change(c: &CurrencyChange) -> CurrencyChangeView {
    CurrencyChangeView {
        ability_id: c.ability_id.unwrap_or_default(),
        currency_type: c.currency_type.unwrap_or_default(),
        delta: c.delta.unwrap_or_default(),
        annotation: c.annotation.clone(),
    }
}

/// Writes `edit` onto a copy of `base`. Every field `edit` leaves at its base value keeps its exact
/// encoding (an explicit zero stays explicit, an absent field stays absent), and every unknown byte
/// survives. Categories, items and ability steps are matched by position: one kept at its index keeps
/// its unknown bytes, a new one gets the game's shape and none.
#[must_use]
pub fn apply(base: &HeroBuildResult, edit: &BuildView) -> HeroBuildResult {
    let mut out = base.clone();
    out.hero_build = rebuild(&base.hero_build, |h| apply_hero_build(h, edit));
    out.preference = rebuild(&base.preference, |p| p.favorited = keep(&p.favorited, &edit.favorited));
    // The game resets both on launch; a stale value from a session must not be written back.
    out.num_favorites = Some(0);
    out.rollup_category = Some(0);
    out
}

fn apply_hero_build(h: &mut HeroBuild, e: &BuildView) {
    h.hero_build_id = keep(&h.hero_build_id, &e.hero_build_id);
    h.hero_id = keep(&h.hero_id, &e.hero_id);
    h.author_account_id = keep(&h.author_account_id, &e.author_account_id);
    h.last_updated_timestamp = e.last_updated_timestamp;
    h.name = keep(&h.name, &e.name);
    h.description = keep(&h.description, &e.description);
    h.language = keep(&h.language, &e.language);
    h.version = keep(&h.version, &e.version);
    h.origin_build_id = e.origin_build_id;
    h.details = rebuild(&h.details, |d| {
        d.mod_categories = merge(&d.mod_categories, &e.mod_categories, apply_category);
        d.ability_order = rebuild(&d.ability_order, |a| {
            a.currency_changes = merge(&a.currency_changes, &e.ability_order, apply_change)
        });
    });
    h.tags.clone_from(&e.tags);
    h.development_build = keep(&h.development_build, &e.development_build);
    h.publish_timestamp = e.publish_timestamp;
}

fn apply_category(base: Option<&ModCategory>, e: &ModCategoryView) -> ModCategory {
    let fresh = base.is_none();
    let mut c = base.cloned().unwrap_or_default();
    c.mods = merge(&c.mods, &e.mods, apply_mod);
    c.name = set(fresh, &c.name, &e.name);
    c.description = set(fresh, &c.description, &e.description);
    c.width = e.width;
    c.height = e.height;
    // The game leaves `optional` out on a category that is not optional.
    c.optional = if fresh { e.optional.then_some(true) } else { keep(&c.optional, &e.optional) };
    c
}

fn apply_mod(base: Option<&ModEntry>, e: &ModEntryView) -> ModEntry {
    let fresh = base.is_none();
    let mut m = base.cloned().unwrap_or_default();
    m.ability_id = set(fresh, &m.ability_id, &e.ability_id);
    m.annotation.clone_from(&e.annotation);
    m.required_flex_slots = e.required_flex_slots;
    m.sell_priority = e.sell_priority;
    m.imbue_target_ability_id = e.imbue_target_ability_id;
    m
}

fn apply_change(base: Option<&CurrencyChange>, e: &CurrencyChangeView) -> CurrencyChange {
    let fresh = base.is_none();
    let mut c = base.cloned().unwrap_or_default();
    c.ability_id = set(fresh, &c.ability_id, &e.ability_id);
    c.currency_type = set(fresh, &c.currency_type, &e.currency_type);
    c.delta = set(fresh, &c.delta, &e.delta);
    c.annotation.clone_from(&e.annotation);
    c
}

/// `base` itself while `v` is what it reads as, so an explicit default and an absent field both survive.
fn keep<T: Clone + Default + PartialEq>(base: &Option<T>, v: &T) -> Option<T> {
    match base {
        Some(b) if b == v => base.clone(),
        None if *v == T::default() => None,
        _ => Some(v.clone()),
    }
}

/// Like [`keep`], but a new message writes the field even at its default, as the game does.
fn set<T: Clone + Default + PartialEq>(fresh: bool, base: &Option<T>, v: &T) -> Option<T> {
    if fresh {
        Some(v.clone())
    } else {
        keep(base, v)
    }
}

/// Edits a copy of an optional message; an absent one stays absent while the edit leaves it empty.
fn rebuild<T: Clone + Default + PartialEq>(base: &Option<T>, f: impl FnOnce(&mut T)) -> Option<T> {
    let mut m = base.clone().unwrap_or_default();
    f(&mut m);
    if base.is_none() && m == T::default() {
        None
    } else {
        Some(m)
    }
}

fn merge<B, V>(base: &[B], edit: &[V], f: fn(Option<&B>, &V) -> B) -> Vec<B> {
    edit.iter().enumerate().map(|(i, v)| f(base.get(i), v)).collect()
}

/// A new local build in the exact shape the game writes on create: version 0, no `origin_build_id`,
/// an empty name and description, one empty default category and an empty preference message.
#[must_use]
pub fn new_local(id: u32, author_account_id: u32, hero_id: u32, language: u32, now_unix: u32) -> HeroBuildResult {
    HeroBuildResult {
        hero_build: Some(HeroBuild {
            hero_build_id: Some(id),
            hero_id: Some(hero_id),
            author_account_id: Some(author_account_id),
            last_updated_timestamp: Some(now_unix),
            name: Some(String::new()),
            description: Some(String::new()),
            language: Some(language),
            version: Some(0),
            details: Some(Details {
                mod_categories: vec![ModCategory {
                    name: Some(NEW_CATEGORY_NAME.into()),
                    description: Some(String::new()),
                    width: Some(NEW_CATEGORY_WIDTH),
                    height: Some(NEW_CATEGORY_HEIGHT),
                    ..Default::default()
                }],
                ..Default::default()
            }),
            ..Default::default()
        }),
        preference: Some(Preference::default()),
        num_favorites: Some(0),
        rollup_category: Some(0),
        ..Default::default()
    }
}

/// A new local build copied from `source`, as the game's copy of a public build: `origin_build_id`
/// names the source, and its `publish_timestamp`, tags and contents stay. A local source has no GC
/// id to point at, so its copy keeps the source's own origin.
#[must_use]
pub fn copy_as_new(source: &HeroBuildResult, id: u32, author_account_id: u32, now_unix: u32) -> HeroBuildResult {
    let src = source.hero_build.clone().unwrap_or_default();
    let origin = match src.hero_build_id {
        Some(gc) if gc >= LOCAL_ID_LIMIT => Some(gc),
        _ => src.origin_build_id,
    };
    HeroBuildResult {
        hero_build: Some(HeroBuild {
            hero_build_id: Some(id),
            author_account_id: Some(author_account_id),
            last_updated_timestamp: Some(now_unix),
            version: Some(0),
            origin_build_id: origin,
            ..src
        }),
        preference: Some(Preference::default()),
        num_favorites: Some(0),
        rollup_category: Some(0),
        unknown: source.unknown.clone(),
        ..Default::default()
    }
}

/// [`copy_as_new`] for a public build that only exists as a view (the API has no blob). The copy
/// points at the source's id and keeps its publish time, tags and contents; whatever only a blob
/// carries (unknown bytes) is absent. A source language of 0 falls back to `language`.
#[must_use]
pub fn copy_from_view(
    source: &BuildView,
    id: u32,
    author_account_id: u32,
    language: u32,
    now_unix: u32,
) -> HeroBuildResult {
    let mut out = apply(&HeroBuildResult::default(), source);
    let h = out.hero_build.get_or_insert_with(Default::default);
    h.hero_build_id = Some(id);
    h.author_account_id = Some(author_account_id);
    h.last_updated_timestamp = Some(now_unix);
    h.version = Some(0);
    h.origin_build_id =
        if source.hero_build_id >= LOCAL_ID_LIMIT { Some(source.hero_build_id) } else { source.origin_build_id };
    h.language = Some(if source.language == 0 { language } else { source.language });
    h.hero_id = Some(source.hero_id);
    h.name = Some(source.name.clone());
    h.description = Some(source.description.clone());
    out.preference = Some(Preference::default());
    out
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AbilityOrderError {
    UnknownAbility { step: usize },
    UnknownCurrency { step: usize },
    WrongCost { step: usize, expected: i32 },
    UnknownCost { step: usize },
    AlreadyUnlocked { step: usize },
    UltimateBeforeOthers { step: usize },
    NotUnlocked { step: usize },
    AlreadyMaxed { step: usize },
}

impl std::fmt::Display for AbilityOrderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AbilityOrderError::UnknownAbility { step } => write!(f, "step {step}: not one of the hero's abilities"),
            AbilityOrderError::UnknownCurrency { step } => write!(f, "step {step}: unknown currency type"),
            AbilityOrderError::WrongCost { step, expected } => write!(f, "step {step}: costs {}", -expected),
            AbilityOrderError::UnknownCost { step } => write!(f, "step {step}: not a cost the game uses"),
            AbilityOrderError::AlreadyUnlocked { step } => write!(f, "step {step}: ability already unlocked"),
            AbilityOrderError::UltimateBeforeOthers { step } => {
                write!(f, "step {step}: the ultimate unlocks only after the other 3 abilities")
            }
            AbilityOrderError::NotUnlocked { step } => write!(f, "step {step}: ability points on a locked ability"),
            AbilityOrderError::AlreadyMaxed { step } => write!(f, "step {step}: ability already at its last tier"),
        }
    }
}

impl std::error::Error for AbilityOrderError {}

/// Checks an ability order the editor is about to write. `hero_ability_ids` are the hero's 4
/// ability slots with the ultimate last.
///
/// The order holds no levels, only the sequence of spends, and the game keeps unspent points: any
/// sequence can wait until its points are earned. The only way to spend AP not yet earned is on an
/// ability that is still locked ([`AbilityOrderError::NotUnlocked`]). A total cap needs no check:
/// 3 tiers on each of 4 abilities is 4 x (1 + 2 + 5) = 32 AP, every point the game hands out.
pub fn validate_ability_order(
    steps: &[CurrencyChangeView],
    hero_ability_ids: &[u32; 4],
) -> Result<(), AbilityOrderError> {
    walk(steps, hero_ability_ids, true).map(drop)
}

/// Quirks in an order the game wrote, which [`validate_ability_order`] would refuse as an edit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AbilityOrderWarning {
    /// Not one of the hero's abilities now (older builds keep ids of reworked abilities).
    UnknownAbility { step: usize },
    /// An unlock written with delta 0 instead of -1.
    FreeUnlock { step: usize },
    /// The ultimate among the first 3 unlocks.
    UltimateEarly { step: usize },
    /// This step unlocks an ability again or a fifth one, or buys a tier past the last; it and every step after
    /// it are a leftover tail (the game's files hold such tails, often a second copy of the order).
    Leftover { step: usize },
}

/// Checks an order read from the file or the GC. Every pattern found in the game's own files
/// loads, with a warning where [`validate_ability_order`] would refuse it; an `Err` means a step the
/// game never writes (an unknown currency or cost, AP on a locked ability, tiers bought out of
/// order). Even then the build itself still loads.
pub fn ability_order_warnings(
    steps: &[CurrencyChangeView],
    hero_ability_ids: &[u32; 4],
) -> Result<Vec<AbilityOrderWarning>, AbilityOrderError> {
    walk(steps, hero_ability_ids, false)
}

/// The game runs unlocks and ability points as two queues, so where a step sits relative to the other
/// currency does not matter: unlocks are checked in stored order, then ability points in stored order, each
/// keeping its original index for errors. Points stored before their unlock simply wait for it.
fn walk(
    steps: &[CurrencyChangeView],
    hero_ability_ids: &[u32; 4],
    strict: bool,
) -> Result<Vec<AbilityOrderWarning>, AbilityOrderError> {
    let mut warnings = Vec::new();
    let head = if strict { steps.len() } else { leftover_start(steps) };

    // Tracked by id, not slot, so abilities the hero no longer has still count towards a complete order.
    let mut unlocked: Vec<u32> = Vec::new();
    for (step, s) in steps[..head].iter().enumerate() {
        if s.currency_type != CURRENCY_ABILITY_UNLOCKS {
            continue;
        }
        let slot = check_known(s, step, hero_ability_ids, strict, &mut warnings)?;
        if unlocked.contains(&s.ability_id) {
            return Err(AbilityOrderError::AlreadyUnlocked { step });
        }
        match s.delta {
            -1 => {}
            0 if !strict => warnings.push(AbilityOrderWarning::FreeUnlock { step }),
            _ => return Err(AbilityOrderError::WrongCost { step, expected: -1 }),
        }
        // Counted by id, so a slot whose ability was reworked still counts as one of the 3.
        let others_unlocked = unlocked.iter().filter(|&&id| id != hero_ability_ids[3]).count() >= 3;
        if slot == Some(3) && !others_unlocked {
            if strict {
                return Err(AbilityOrderError::UltimateBeforeOthers { step });
            }
            warnings.push(AbilityOrderWarning::UltimateEarly { step });
        }
        unlocked.push(s.ability_id);
    }

    let mut tiers: Vec<(u32, usize)> = Vec::new();
    for (step, s) in steps[..head].iter().enumerate() {
        match s.currency_type {
            CURRENCY_ABILITY_UNLOCKS => {}
            CURRENCY_ABILITY_POINTS => {
                check_known(s, step, hero_ability_ids, strict, &mut warnings)?;
                if !unlocked.contains(&s.ability_id) {
                    return Err(AbilityOrderError::NotUnlocked { step });
                }
                let at = match tiers.iter().position(|&(id, _)| id == s.ability_id) {
                    Some(at) => at,
                    None => {
                        tiers.push((s.ability_id, 0));
                        tiers.len() - 1
                    }
                };
                let tier = &mut tiers[at].1;
                let cost = *ABILITY_TIER_COSTS.get(*tier).ok_or(AbilityOrderError::AlreadyMaxed { step })?;
                if s.delta != -cost {
                    return Err(AbilityOrderError::WrongCost { step, expected: -cost });
                }
                *tier += 1;
            }
            _ => return Err(AbilityOrderError::UnknownCurrency { step }),
        }
    }

    if head < steps.len() {
        warnings.push(AbilityOrderWarning::Leftover { step: head });
        check_costs(&steps[head..], head)?;
    }
    warnings.sort_by_key(|w| match *w {
        AbilityOrderWarning::UnknownAbility { step }
        | AbilityOrderWarning::FreeUnlock { step }
        | AbilityOrderWarning::UltimateEarly { step }
        | AbilityOrderWarning::Leftover { step } => step,
    });
    Ok(warnings)
}

fn check_known(
    s: &CurrencyChangeView,
    step: usize,
    hero_ability_ids: &[u32; 4],
    strict: bool,
    warnings: &mut Vec<AbilityOrderWarning>,
) -> Result<Option<usize>, AbilityOrderError> {
    let slot = hero_ability_ids.iter().position(|&a| a == s.ability_id);
    if slot.is_none() {
        if strict {
            return Err(AbilityOrderError::UnknownAbility { step });
        }
        warnings.push(AbilityOrderWarning::UnknownAbility { step });
    }
    Ok(slot)
}

/// Index of the first step that repeats an unlock, adds a fifth one, or buys a tier past the last, counting
/// tiers per ability across all ability point steps wherever they sit; `steps.len()` when there is none.
fn leftover_start(steps: &[CurrencyChangeView]) -> usize {
    let mut unlocked: Vec<u32> = Vec::new();
    let mut tiers: Vec<(u32, usize)> = Vec::new();
    for (step, s) in steps.iter().enumerate() {
        match s.currency_type {
            CURRENCY_ABILITY_UNLOCKS => {
                if unlocked.len() == 4 || unlocked.contains(&s.ability_id) {
                    return step;
                }
                unlocked.push(s.ability_id);
            }
            CURRENCY_ABILITY_POINTS => match tiers.iter_mut().find(|(id, _)| *id == s.ability_id) {
                Some((_, t)) if *t == ABILITY_TIER_COSTS.len() => return step,
                Some((_, t)) => *t += 1,
                None => tiers.push((s.ability_id, 1)),
            },
            _ => {}
        }
    }
    steps.len()
}

/// Prepares a loaded order for editing: free unlocks become -1 and the leftover tail is dropped.
/// Returns the steps and the warnings it fixed. Everything else stays, so an early ultimate or an
/// unknown ability still fails [`validate_ability_order`]; an order that
/// [`ability_order_warnings`] rejects comes back unchanged. Kept steps keep their positions, so
/// [`apply`] keeps their unknown bytes.
#[must_use]
pub fn normalize_ability_order(
    steps: &[CurrencyChangeView],
    hero_ability_ids: &[u32; 4],
) -> (Vec<CurrencyChangeView>, Vec<AbilityOrderWarning>) {
    let mut out = steps.to_vec();
    let mut fixed = Vec::new();
    for w in ability_order_warnings(steps, hero_ability_ids).unwrap_or_default() {
        match w {
            AbilityOrderWarning::FreeUnlock { step } => out[step].delta = -1,
            AbilityOrderWarning::Leftover { step } => out.truncate(step),
            AbilityOrderWarning::UnknownAbility { .. } | AbilityOrderWarning::UltimateEarly { .. } => continue,
        }
        fixed.push(w);
    }
    (out, fixed)
}

fn check_costs(steps: &[CurrencyChangeView], first: usize) -> Result<(), AbilityOrderError> {
    for (step, s) in steps.iter().enumerate().map(|(i, s)| (first + i, s)) {
        let known = match s.currency_type {
            CURRENCY_ABILITY_UNLOCKS => matches!(s.delta, -1 | 0),
            CURRENCY_ABILITY_POINTS => ABILITY_TIER_COSTS.contains(&-s.delta),
            _ => return Err(AbilityOrderError::UnknownCurrency { step }),
        };
        if !known {
            return Err(AbilityOrderError::UnknownCost { step });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wire::{AbilityOrder, CurrencyChange, Details, HeroBuild, ModCategory, ModEntry, Preference};

    const ACCOUNT: u32 = 387_246_372;

    // Field 99 (varint) with a per-message marker value.
    fn unk(n: u8) -> Vec<u8> {
        vec![0x98, 0x06, n]
    }

    fn base() -> HeroBuildResult {
        let built = HeroBuildResult {
            hero_build: Some(HeroBuild {
                hero_build_id: Some(916_319),
                hero_id: Some(2),
                author_account_id: Some(ACCOUNT),
                last_updated_timestamp: Some(1_792_541_625),
                name: Some("Seven".into()),
                description: Some(String::new()),
                language: Some(0),
                version: Some(3),
                origin_build_id: None,
                details: Some(Details {
                    mod_categories: vec![
                        ModCategory {
                            mods: vec![
                                ModEntry {
                                    ability_id: Some(1),
                                    annotation: Some("a".into()),
                                    sell_priority: Some(0),
                                    unknown: unk(5),
                                    ..Default::default()
                                },
                                ModEntry { ability_id: Some(2), unknown: unk(6), ..Default::default() },
                            ],
                            name: Some("Early".into()),
                            description: Some(String::new()),
                            width: Some(175.5),
                            height: Some(162.75),
                            optional: None,
                            unknown: unk(4),
                        },
                        ModCategory {
                            mods: vec![ModEntry { ability_id: Some(3), ..Default::default() }],
                            name: Some("Late".into()),
                            description: None,
                            width: None,
                            height: None,
                            optional: Some(false),
                            unknown: unk(7),
                        },
                    ],
                    ability_order: Some(AbilityOrder {
                        currency_changes: vec![CurrencyChange {
                            ability_id: Some(10),
                            currency_type: Some(2),
                            delta: Some(-1),
                            annotation: None,
                            unknown: unk(9),
                        }],
                        unknown: unk(8),
                    }),
                    unknown: unk(3),
                }),
                tags: vec![539_192_269, 1_065_103_387],
                development_build: Some(false),
                publish_timestamp: Some(1_792_272_604),
                unknown: unk(2),
            }),
            preference: Some(Preference { favorited: None, ignored: Some(false), reported: None, unknown: unk(10) }),
            num_favorites: Some(0),
            rollup_category: Some(0),
            unknown: unk(1),
            ..Default::default()
        };
        HeroBuildResult::decode(&built.encode()).unwrap()
    }

    fn hb(r: &mut HeroBuildResult) -> &mut HeroBuild {
        r.hero_build.as_mut().unwrap()
    }

    fn categories(r: &mut HeroBuildResult) -> &mut Vec<ModCategory> {
        &mut hb(r).details.as_mut().unwrap().mod_categories
    }

    #[test]
    fn view_of_apply_of_view_is_the_view() {
        let b = base();
        assert_eq!(view(&apply(&b, &view(&b))), view(&b));
        assert_eq!(view(&b).name, "Seven");
    }

    #[test]
    fn applying_an_unchanged_view_keeps_every_byte() {
        let b = base();
        assert_eq!(apply(&b, &view(&b)).encode(), b.encode());
        let mut sparse = base();
        sparse.preference = None;
        hb(&mut sparse).details.as_mut().unwrap().ability_order = None;
        assert_eq!(apply(&sparse, &view(&sparse)).encode(), sparse.encode());
    }

    #[test]
    fn renaming_keeps_unknown_bytes() {
        let b = base();
        let mut v = view(&b);
        v.name = "New".into();
        let mut expected = b.clone();
        hb(&mut expected).name = Some("New".into());
        assert_eq!(apply(&b, &v), expected);
    }

    #[test]
    fn an_item_added_at_the_end_keeps_earlier_items_unknown() {
        let b = base();
        let mut v = view(&b);
        v.mod_categories[0].mods.push(ModEntryView { ability_id: 99, ..Default::default() });
        let mut expected = b.clone();
        categories(&mut expected)[0].mods.push(ModEntry { ability_id: Some(99), ..Default::default() });
        assert_eq!(apply(&b, &v), expected);
    }

    #[test]
    fn a_new_category_takes_the_game_shape() {
        let b = base();
        let mut v = view(&b);
        v.mod_categories.push(ModCategoryView {
            mods: vec![ModEntryView { ability_id: 5, ..Default::default() }],
            width: Some(100.0),
            height: Some(162.75),
            ..Default::default()
        });
        let mut expected = b.clone();
        categories(&mut expected).push(ModCategory {
            mods: vec![ModEntry { ability_id: Some(5), ..Default::default() }],
            name: Some(String::new()),
            description: Some(String::new()),
            width: Some(100.0),
            height: Some(162.75),
            optional: None,
            unknown: Vec::new(),
        });
        assert_eq!(apply(&b, &v), expected);
    }

    #[test]
    fn a_new_ability_step_is_written_in_full() {
        let b = base();
        let mut v = view(&b);
        v.ability_order.push(CurrencyChangeView { ability_id: 10, currency_type: 1, delta: -1, annotation: None });
        let order = apply(&b, &v).hero_build.unwrap().details.unwrap().ability_order.unwrap();
        assert_eq!(order.unknown, unk(8));
        assert_eq!(order.currency_changes[0].unknown, unk(9));
        assert_eq!(
            order.currency_changes[1],
            CurrencyChange {
                ability_id: Some(10),
                currency_type: Some(1),
                delta: Some(-1),
                annotation: None,
                unknown: Vec::new()
            }
        );
    }

    #[test]
    fn favouriting_sets_only_the_favorited_flag() {
        let b = base();
        let mut v = view(&b);
        v.favorited = true;
        let mut expected = b.clone();
        expected.preference.as_mut().unwrap().favorited = Some(true);
        assert_eq!(apply(&b, &v), expected);
    }

    #[test]
    fn counters_the_game_resets_are_written_as_zero() {
        let mut b = base();
        b.num_favorites = Some(7);
        b.rollup_category = Some(3);
        let out = apply(&b, &view(&b));
        assert_eq!((out.num_favorites, out.rollup_category), (Some(0), Some(0)));
    }

    fn ability_ids(v: &BuildView) -> Vec<Vec<u32>> {
        v.mod_categories.iter().map(|c| c.mods.iter().map(|m| m.ability_id).collect()).collect()
    }

    // The game's shop refuses an item twice in one build, but the file allows it and players ask for it.
    #[test]
    fn a_stored_duplicate_item_survives_a_round_trip_byte_for_byte() {
        let mut b = base();
        categories(&mut b)[0].mods.push(ModEntry { ability_id: Some(1), unknown: unk(11), ..Default::default() });
        categories(&mut b)[1].mods.push(ModEntry { ability_id: Some(1), ..Default::default() });
        let b = HeroBuildResult::decode(&b.encode()).unwrap();
        let encoded = apply(&b, &view(&b)).encode();
        assert_eq!(encoded, b.encode());
        assert_eq!(ability_ids(&view(&HeroBuildResult::decode(&encoded).unwrap())), vec![vec![1, 2, 1], vec![3, 1]]);
    }

    #[test]
    fn a_duplicate_item_added_in_an_edit_is_written_in_order() {
        let b = base();
        let mut v = view(&b);
        v.mod_categories[0].mods.insert(1, ModEntryView { ability_id: 1, ..Default::default() });
        v.mod_categories[1].mods.push(ModEntryView { ability_id: 1, ..Default::default() });
        let decoded = HeroBuildResult::decode(&apply(&b, &v).encode()).unwrap();
        assert_eq!(view(&decoded), v);
        assert_eq!(ability_ids(&view(&decoded)), vec![vec![1, 1, 2], vec![3, 1]]);
    }

    // A new build exactly as the game wrote it on create (game build 6805), with its name and items
    // as parameters.
    fn template(id: u32, ts: u32, name: &str, account: u32, hero: u32, items: &[u32]) -> HeroBuildResult {
        let mods = items.iter().map(|a| ModEntry { ability_id: Some(*a), ..Default::default() }).collect();
        HeroBuildResult {
            hero_build: Some(HeroBuild {
                hero_build_id: Some(id),
                hero_id: Some(hero),
                author_account_id: Some(account),
                last_updated_timestamp: Some(ts),
                name: Some(name.into()),
                description: Some(String::new()),
                language: Some(0),
                version: Some(0),
                details: Some(Details {
                    mod_categories: vec![ModCategory {
                        mods,
                        name: Some("#Citadel_HeroBuilds_EarlyGame".into()),
                        description: Some(String::new()),
                        width: Some(175.5),
                        height: Some(162.75),
                        optional: None,
                        unknown: Vec::new(),
                    }],
                    ability_order: None,
                    unknown: Vec::new(),
                }),
                ..Default::default()
            }),
            preference: Some(Preference::default()),
            num_favorites: Some(0),
            rollup_category: Some(0),
            ..Default::default()
        }
    }

    #[test]
    fn new_local_matches_the_game_template() {
        let ts = 1_792_540_000;
        assert_eq!(new_local(57, ACCOUNT, 2, 0, ts).encode(), template(57, ts, "", ACCOUNT, 2, &[]).encode());
    }

    #[test]
    fn new_local_named_and_filled_matches_the_game_build() {
        let ts = 1_792_540_000;
        let fresh = new_local(57, ACCOUNT, 2, 0, ts);
        let mut v = view(&fresh);
        v.name = "[D+ test] create".into();
        v.mod_categories[0].mods = [1_342_610_602, 3_862_866_912]
            .into_iter()
            .map(|a| ModEntryView { ability_id: a, ..Default::default() })
            .collect();
        let game = template(57, ts, "[D+ test] create", ACCOUNT, 2, &[1_342_610_602, 3_862_866_912]);
        assert_eq!(apply(&fresh, &v).encode(), game.encode());
    }

    #[test]
    fn new_local_uses_the_given_language() {
        let r = new_local(1, ACCOUNT, 2, 7, 0);
        assert_eq!(r.hero_build.unwrap().language, Some(7));
    }

    fn public(id: u32, origin: Option<u32>) -> HeroBuildResult {
        let mut r = base();
        let h = hb(&mut r);
        h.hero_build_id = Some(id);
        h.author_account_id = Some(1_694_025_232);
        h.origin_build_id = origin;
        h.version = Some(77);
        r.preference = Some(Preference { favorited: Some(true), ..Default::default() });
        r.rollup_category = Some(3);
        r
    }

    #[test]
    fn a_copy_points_at_its_source_and_keeps_publish_time_and_tags() {
        let source = public(398_750, Some(395_336));
        let copy = copy_as_new(&source, 61, ACCOUNT, 1_792_541_625);
        let mut expected = source.clone();
        let h = hb(&mut expected);
        h.hero_build_id = Some(61);
        h.author_account_id = Some(ACCOUNT);
        h.origin_build_id = Some(398_750);
        h.version = Some(0);
        h.last_updated_timestamp = Some(1_792_541_625);
        expected.preference = Some(Preference::default());
        expected.rollup_category = Some(0);
        assert_eq!(copy, expected);
    }

    #[test]
    fn a_copy_of_a_build_without_origin_points_at_it() {
        let copy = copy_as_new(&public(236_324, None), 60, ACCOUNT, 0);
        assert_eq!(copy.hero_build.unwrap().origin_build_id, Some(236_324));
    }

    #[test]
    fn a_copy_of_a_local_build_keeps_its_origin() {
        let mut source = public(57, Some(236_324));
        hb(&mut source).author_account_id = Some(ACCOUNT);
        assert_eq!(copy_as_new(&source, 58, ACCOUNT, 0).hero_build.unwrap().origin_build_id, Some(236_324));
        let fresh = new_local(57, ACCOUNT, 2, 0, 0);
        assert_eq!(copy_as_new(&fresh, 58, ACCOUNT, 0).hero_build.unwrap().origin_build_id, None);
    }

    fn strip_unknown(r: &mut HeroBuildResult) {
        r.unknown.clear();
        if let Some(p) = r.preference.as_mut() {
            p.unknown.clear();
        }
        let Some(h) = r.hero_build.as_mut() else { return };
        h.unknown.clear();
        let Some(d) = h.details.as_mut() else { return };
        d.unknown.clear();
        for c in &mut d.mod_categories {
            c.unknown.clear();
            c.mods.iter_mut().for_each(|m| m.unknown.clear());
        }
        if let Some(a) = d.ability_order.as_mut() {
            a.unknown.clear();
            a.currency_changes.iter_mut().for_each(|c| c.unknown.clear());
        }
    }

    #[test]
    fn a_view_copy_matches_the_blob_copy_but_for_unknown_bytes() {
        let mut source = public(398_750, Some(395_336));
        {
            let h = hb(&mut source);
            h.language = Some(5);
            h.publish_timestamp = Some(1_700_000_000);
            h.tags = vec![3, 9];
            h.development_build = None;
            let d = h.details.as_mut().unwrap();
            d.mod_categories[1].description = Some(String::new());
            d.mod_categories[1].optional = None;
        }
        let from_blob = copy_as_new(&source, 61, ACCOUNT, 1_792_541_625);
        let from_view = copy_from_view(&view(&source), 61, ACCOUNT, 7, 1_792_541_625);
        assert_ne!(from_view, from_blob);
        let mut expected = from_blob;
        strip_unknown(&mut expected);
        assert_eq!(from_view.encode(), expected.encode());
        let h = from_view.hero_build.unwrap();
        assert_eq!(h.origin_build_id, Some(398_750));
        assert_eq!((h.publish_timestamp, h.tags, h.version), (Some(1_700_000_000), vec![3, 9], Some(0)));
    }

    #[test]
    fn a_view_copy_without_a_language_takes_the_given_one() {
        let mut v = view(&public(398_750, None));
        v.language = 0;
        assert_eq!(copy_from_view(&v, 61, ACCOUNT, 7, 0).hero_build.unwrap().language, Some(7));
    }

    const HERO: [u32; 4] = [11, 22, 33, 44];

    fn unlock(a: u32) -> CurrencyChangeView {
        CurrencyChangeView { ability_id: a, currency_type: CURRENCY_ABILITY_UNLOCKS, delta: -1, annotation: None }
    }

    fn ap(a: u32, delta: i32) -> CurrencyChangeView {
        CurrencyChangeView { ability_id: a, currency_type: CURRENCY_ABILITY_POINTS, delta, annotation: None }
    }

    #[test]
    fn a_full_valid_order_passes() {
        let mut steps = vec![unlock(11), ap(11, -1), unlock(22), unlock(33), ap(11, -2), unlock(44), ap(11, -5)];
        for a in [22, 33, 44] {
            steps.extend([ap(a, -1), ap(a, -2), ap(a, -5)]);
        }
        assert_eq!(validate_ability_order(&steps, &HERO), Ok(()));
        assert_eq!(validate_ability_order(&[], &HERO), Ok(()));
    }

    #[test]
    fn ability_points_on_a_locked_ability_are_rejected() {
        assert_eq!(validate_ability_order(&[ap(11, -1)], &HERO), Err(AbilityOrderError::NotUnlocked { step: 0 }));
        assert_eq!(
            validate_ability_order(&[unlock(11), ap(22, -1)], &HERO),
            Err(AbilityOrderError::NotUnlocked { step: 1 })
        );
    }

    #[test]
    fn the_users_real_order_validates() {
        let code = include_str!("../tests/fixtures/build_code.txt");
        let build = crate::code::decode_code(code).unwrap();
        let steps: Vec<_> =
            build.details.unwrap().ability_order.unwrap().currency_changes.iter().map(view_change).collect();
        let unlocks: Vec<u32> =
            steps.iter().filter(|s| s.currency_type == CURRENCY_ABILITY_UNLOCKS).map(|s| s.ability_id).collect();
        let hero: [u32; 4] = unlocks[..4].try_into().unwrap();
        assert_eq!(validate_ability_order(&steps, &hero), Ok(()));
    }

    #[test]
    fn ability_points_stored_before_their_unlock_wait_for_it() {
        let steps = [ap(11, -1), unlock(11), ap(11, -2), ap(22, -1), unlock(22), unlock(33), unlock(44)];
        assert_eq!(validate_ability_order(&steps, &HERO), Ok(()));
        assert_eq!(ability_order_warnings(&steps, &HERO), Ok(Vec::new()));
    }

    #[test]
    fn tiers_are_counted_per_ability_in_ap_order_wherever_they_sit() {
        assert_eq!(
            validate_ability_order(&[ap(11, -2), unlock(11), ap(11, -1)], &HERO),
            Err(AbilityOrderError::WrongCost { step: 0, expected: -1 })
        );
    }

    #[test]
    fn ability_points_on_an_ability_the_order_never_unlocks_are_rejected() {
        assert_eq!(
            validate_ability_order(&[ap(22, -1), unlock(11)], &HERO),
            Err(AbilityOrderError::NotUnlocked { step: 0 })
        );
    }

    #[test]
    fn the_ultimate_among_the_first_three_unlocks_is_rejected() {
        assert_eq!(
            validate_ability_order(&[unlock(11), unlock(44)], &HERO),
            Err(AbilityOrderError::UltimateBeforeOthers { step: 1 })
        );
        assert_eq!(
            validate_ability_order(&[unlock(11), unlock(22), unlock(44)], &HERO),
            Err(AbilityOrderError::UltimateBeforeOthers { step: 2 })
        );
    }

    #[test]
    fn a_wrong_tier_cost_is_rejected() {
        assert_eq!(
            validate_ability_order(&[unlock(11), ap(11, -2)], &HERO),
            Err(AbilityOrderError::WrongCost { step: 1, expected: -1 })
        );
        assert_eq!(
            validate_ability_order(&[unlock(11), ap(11, -1), ap(11, -5)], &HERO),
            Err(AbilityOrderError::WrongCost { step: 2, expected: -2 })
        );
        let mut zero_unlock = unlock(11);
        zero_unlock.delta = 0;
        assert_eq!(
            validate_ability_order(&[zero_unlock], &HERO),
            Err(AbilityOrderError::WrongCost { step: 0, expected: -1 })
        );
    }

    #[test]
    fn other_invalid_steps_are_rejected() {
        assert_eq!(validate_ability_order(&[unlock(99)], &HERO), Err(AbilityOrderError::UnknownAbility { step: 0 }));
        let mut gold = unlock(11);
        gold.currency_type = 0;
        assert_eq!(validate_ability_order(&[gold], &HERO), Err(AbilityOrderError::UnknownCurrency { step: 0 }));
        assert_eq!(
            validate_ability_order(&[unlock(11), unlock(11)], &HERO),
            Err(AbilityOrderError::AlreadyUnlocked { step: 1 })
        );
        assert_eq!(
            validate_ability_order(&[unlock(11), ap(11, -1), ap(11, -2), ap(11, -5), ap(11, -5)], &HERO),
            Err(AbilityOrderError::AlreadyMaxed { step: 4 })
        );
    }

    // "U2" unlocks slot 2, "U2z" unlocks it at delta 0, "2:5" spends 5 AP on it; "?" is an ability the
    // hero no longer has.
    fn order(s: &str) -> Vec<CurrencyChangeView> {
        let id = |slot: &str| if slot == "?" { 99 } else { HERO[slot.parse::<usize>().unwrap()] };
        s.split(' ')
            .map(|t| match t.strip_prefix('U') {
                Some(u) => {
                    let mut step = unlock(id(&u[..1]));
                    if u.ends_with('z') {
                        step.delta = 0;
                    }
                    step
                }
                None => {
                    let (slot, cost) = t.split_once(':').unwrap();
                    ap(id(slot), -cost.parse::<i32>().unwrap())
                }
            })
            .collect()
    }

    const COMPLETE: &str = "U0 U1 U2 U3 1:1 1:2 0:1 0:2 0:5 3:1 3:2 3:5 2:1 2:2 2:5 1:5";

    #[test]
    fn a_clean_order_loads_without_warnings() {
        assert_eq!(ability_order_warnings(&order(COMPLETE), &HERO), Ok(Vec::new()));
    }

    #[test]
    fn free_unlocks_the_game_wrote_load_with_a_warning() {
        let steps = order("U2z U0z 0:1 U1z 0:2 U3z 2:1 2:2 2:5 1:1 1:2 0:5 1:5 3:1 3:2");
        assert!(validate_ability_order(&steps, &HERO).is_err());
        let free = [0, 1, 3, 5].map(|step| AbilityOrderWarning::FreeUnlock { step });
        assert_eq!(ability_order_warnings(&steps, &HERO), Ok(free.to_vec()));
    }

    #[test]
    fn an_early_ultimate_the_game_wrote_loads_with_a_warning() {
        let steps = order("U1 1:1 U2 U3 U0 2:1 2:2 2:5 3:1 3:2 3:5 1:2 1:5 0:1 0:2 0:5");
        assert!(validate_ability_order(&steps, &HERO).is_err());
        assert_eq!(ability_order_warnings(&steps, &HERO), Ok(vec![AbilityOrderWarning::UltimateEarly { step: 3 }]));
    }

    #[test]
    fn a_leftover_tail_loads_with_one_warning() {
        for tail in ["3:2", "U0 0:1 0:2 U1 1:1 1:2 U2 2:1 2:2 U3 3:1 3:2", "U? ?:1 ?:2 2:5 2:5"] {
            let steps = order(&format!("{COMPLETE} {tail}"));
            assert!(validate_ability_order(&steps, &HERO).is_err(), "{tail}");
            assert_eq!(ability_order_warnings(&steps, &HERO), Ok(vec![AbilityOrderWarning::Leftover { step: 16 }]));
        }
        let early = order("U2 U1 1:1 U0 0:1 0:2 U3 0:5 1:2 3:1 1:5 3:2 2:1 2:2 U1 U? ?:1 U2 2:1");
        assert_eq!(ability_order_warnings(&early, &HERO), Ok(vec![AbilityOrderWarning::Leftover { step: 14 }]));
        let maxed = order("U0 0:1 0:2 0:5 0:5");
        assert_eq!(ability_order_warnings(&maxed, &HERO), Ok(vec![AbilityOrderWarning::Leftover { step: 4 }]));
    }

    #[test]
    fn abilities_the_hero_no_longer_has_load_with_a_warning() {
        let steps = order("U1 U0 U? U3 1:1 0:1 ?:1 ?:2 1:2 1:5 0:2 0:5 ?:5 3:1 3:2 3:5");
        let unknown = [2, 6, 7, 12].map(|step| AbilityOrderWarning::UnknownAbility { step });
        assert_eq!(ability_order_warnings(&steps, &HERO), Ok(unknown.to_vec()));
    }

    #[test]
    fn orders_the_game_never_wrote_are_still_rejected_on_load() {
        let mut gold = unlock(11);
        gold.currency_type = 0;
        let cases = [
            (vec![gold], AbilityOrderError::UnknownCurrency { step: 0 }),
            (order("0:1"), AbilityOrderError::NotUnlocked { step: 0 }),
            (order("U0 0:2"), AbilityOrderError::WrongCost { step: 1, expected: -1 }),
            (order("U0 0:1 1:1"), AbilityOrderError::NotUnlocked { step: 2 }),
            (
                vec![CurrencyChangeView { delta: -2, ..unlock(11) }],
                AbilityOrderError::WrongCost { step: 0, expected: -1 },
            ),
            (order(&format!("{COMPLETE} 3:3")), AbilityOrderError::UnknownCost { step: 16 }),
        ];
        for (steps, err) in cases {
            assert_eq!(ability_order_warnings(&steps, &HERO), Err(err), "{steps:?}");
        }
    }

    #[test]
    fn normalizing_fixes_free_unlocks_and_drops_the_tail() {
        let free = COMPLETE.replace("U0 U1 U2 U3", "U0z U1z U2 U3z");
        let steps = order(&format!("{free} U0 0:1 1:1"));
        let (fixed, notes) = normalize_ability_order(&steps, &HERO);
        assert_eq!(fixed, order(COMPLETE));
        let mut expected: Vec<_> = [0, 1, 3].map(|step| AbilityOrderWarning::FreeUnlock { step }).to_vec();
        expected.push(AbilityOrderWarning::Leftover { step: 16 });
        assert_eq!(notes, expected);
        assert_eq!(validate_ability_order(&fixed, &HERO), Ok(()));
    }

    #[test]
    fn normalizing_leaves_what_it_cannot_fix() {
        for s in [
            "U1 1:1 U2 U3 U0 2:1 2:2 2:5 3:1 3:2 3:5 1:2 1:5 0:1 0:2 0:5",
            "U1 U0 U? U3 1:1 0:1 ?:1 ?:2 1:2 1:5 0:2 0:5 ?:5 3:1 3:2 3:5",
        ] {
            let steps = order(s);
            assert_eq!(normalize_ability_order(&steps, &HERO), (steps.clone(), Vec::new()));
            assert!(validate_ability_order(&steps, &HERO).is_err());
        }
    }

    #[test]
    fn normalized_steps_keep_their_unknown_bytes() {
        let mut b = base();
        let changes = order(&format!("{COMPLETE} 3:2"))
            .iter()
            .enumerate()
            .map(|(i, s)| CurrencyChange {
                ability_id: Some(s.ability_id),
                currency_type: Some(s.currency_type),
                delta: Some(s.delta),
                annotation: None,
                unknown: unk(20 + i as u8),
            })
            .collect();
        hb(&mut b).details.as_mut().unwrap().ability_order.as_mut().unwrap().currency_changes = changes;
        let mut v = view(&b);
        v.ability_order = normalize_ability_order(&v.ability_order, &HERO).0;
        let kept = apply(&b, &v).hero_build.unwrap().details.unwrap().ability_order.unwrap().currency_changes;
        assert_eq!(kept.len(), 16);
        for (i, c) in kept.iter().enumerate() {
            assert_eq!(c.unknown, unk(20 + i as u8));
        }
    }

    // Stand-in hero slots for a sample build: its first 4 distinct unlocks, the last of them as the
    // ultimate, so only the order's own structure decides the warnings.
    fn slots_from(steps: &[CurrencyChangeView]) -> [u32; 4] {
        let mut ids = Vec::new();
        for s in steps.iter().filter(|s| s.currency_type == CURRENCY_ABILITY_UNLOCKS) {
            if !ids.contains(&s.ability_id) && ids.len() < 4 {
                ids.push(s.ability_id);
            }
        }
        ids.resize(4, 0);
        [ids[0], ids[1], ids[2], ids[3]]
    }

    /// Runs only when `DP_BUILDS_SAMPLES` names a directory of real `cached_hero_builds.kv3` copies.
    /// No order the game wrote may be rejected, and one whose only quirks are free unlocks and a
    /// leftover tail must pass the strict check once normalized.
    #[test]
    fn sample_ability_orders_all_load() {
        let Some(dir) = std::env::var_os("DP_BUILDS_SAMPLES") else { return };
        let (mut checked, mut normalized) = (0, 0);
        for entry in std::fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.extension().is_none_or(|e| e != "kv3") {
                continue;
            }
            let file = crate::file::BuildsFile::parse(&std::fs::read(&path).unwrap()).unwrap();
            for section in crate::file::Section::ALL {
                for blob in file.entries(section) {
                    let v = view(&HeroBuildResult::decode(blob).unwrap());
                    let at = format!("{} {section:?} build {}", path.display(), v.hero_build_id);
                    let slots = slots_from(&v.ability_order);
                    let warnings = ability_order_warnings(&v.ability_order, &slots);
                    let Ok(warnings) = warnings else { panic!("{at}: {warnings:?}") };
                    let fixable = warnings.iter().all(|w| {
                        matches!(w, AbilityOrderWarning::FreeUnlock { .. } | AbilityOrderWarning::Leftover { .. })
                    });
                    if fixable {
                        let (fixed, _) = normalize_ability_order(&v.ability_order, &slots);
                        assert_eq!(validate_ability_order(&fixed, &slots), Ok(()), "{at}");
                        normalized += 1;
                    }
                    checked += 1;
                }
            }
        }
        eprintln!("checked {checked} sample ability orders, {normalized} normalized");
        assert!(checked > 0);
    }

    #[test]
    fn the_view_serializes_in_camel_case() {
        let json = serde_json::to_string(&view(&base())).unwrap();
        assert!(json.contains("\"heroBuildId\":916319"), "{json}");
    }
}
