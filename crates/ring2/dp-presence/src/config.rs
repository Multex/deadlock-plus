use crate::state::{StateId, VariantId};
use serde::de::value::{Error as ValueError, StrDeserializer};
use serde::de::{Deserializer, IgnoredAny, IntoDeserializer};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use ts_rs::TS;

/// A stored or imported document may come from a newer build or be edited by hand, so an entry this build cannot read is
/// dropped instead of failing the whole document.
#[derive(Deserialize)]
#[serde(untagged)]
enum Lenient<T> {
    Ok(T),
    Unreadable(IgnoredAny),
}

fn enum_key<K: Deserialize<'static>>(key: &str) -> Option<K> {
    let de: StrDeserializer<'_, ValueError> = key.into_deserializer();
    K::deserialize(de).ok()
}

fn lenient_map<'de, D, K, V>(de: D, key: fn(&str) -> Option<K>) -> Result<BTreeMap<K, V>, D::Error>
where
    D: Deserializer<'de>,
    K: Ord,
    V: Deserialize<'de>,
{
    let raw = BTreeMap::<String, Lenient<V>>::deserialize(de)?;
    Ok(raw
        .into_iter()
        .filter_map(|(k, v)| match v {
            Lenient::Ok(v) => Some((key(&k)?, v)),
            Lenient::Unreadable(_) => None,
        })
        .collect())
}

struct ByVariant(BTreeMap<VariantId, PartialSlot>);

impl<'de> Deserialize<'de> for ByVariant {
    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, D::Error> {
        lenient_map(de, enum_key).map(Self)
    }
}

fn states<'de, D: Deserializer<'de>>(de: D) -> Result<BTreeMap<StateId, PartialSlot>, D::Error> {
    lenient_map(de, enum_key)
}

fn variants<'de, D: Deserializer<'de>>(de: D) -> Result<BTreeMap<StateId, BTreeMap<VariantId, PartialSlot>>, D::Error> {
    let nested: BTreeMap<StateId, ByVariant> = lenient_map(de, enum_key)?;
    Ok(nested.into_iter().map(|(k, v)| (k, v.0)).collect())
}

fn heroes<'de, D: Deserializer<'de>>(de: D) -> Result<BTreeMap<u32, HeroOverrides>, D::Error> {
    lenient_map(de, |k| k.parse().ok())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename = "PresenceImageSource")]
#[serde(rename_all = "camelCase")]
pub enum ImageSource {
    HeroPortrait,
    HeroIcon,
    RankBadge,
    ModeIcon,
    CustomUrl(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[ts(export, rename = "PresenceTimer")]
#[serde(rename_all = "camelCase")]
pub enum Timer {
    #[default]
    None,
    ElapsedInState,
    MatchTime,
    QueueTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename = "PresenceImage")]
#[serde(rename_all = "camelCase")]
pub struct Image {
    pub enabled: bool,
    pub source: ImageSource,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[ts(export, rename = "PresencePartialImage", optional_fields)]
#[serde(default, rename_all = "camelCase")]
pub struct PartialImage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<ImageSource>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename = "PresenceSlot")]
#[serde(rename_all = "camelCase")]
pub struct Slot {
    pub enabled: bool,
    pub details: String,
    pub state: String,
    pub large_image: Image,
    pub small_image: Image,
    pub large_text: String,
    pub small_text: String,
    pub timer: Timer,
    /// Show the party as "(2 of 6)" when the player is in a party of two or more.
    pub party_size: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[ts(export, rename = "PresencePartialSlot", optional_fields)]
#[serde(default, rename_all = "camelCase")]
pub struct PartialSlot {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub large_image: Option<PartialImage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub small_image: Option<PartialImage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub large_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub small_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timer: Option<Timer>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub party_size: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, TS)]
#[ts(export, rename = "PresenceHeroOverrides")]
#[serde(rename_all = "camelCase")]
pub struct HeroOverrides {
    pub states: BTreeMap<StateId, PartialSlot>,
    pub variants: BTreeMap<StateId, BTreeMap<VariantId, PartialSlot>>,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct RawHeroOverrides {
    #[serde(deserialize_with = "states")]
    states: BTreeMap<StateId, PartialSlot>,
    #[serde(deserialize_with = "variants")]
    variants: BTreeMap<StateId, BTreeMap<VariantId, PartialSlot>>,
}

impl<'de> Deserialize<'de> for HeroOverrides {
    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, D::Error> {
        let raw = RawHeroOverrides::deserialize(de)?;
        Ok(Self { states: raw.states, variants: raw.variants })
    }
}

/// Variants are nested under their state and heroes are keyed by numeric hero id so the document stays plain JSON.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, TS)]
#[ts(export, rename = "PresenceConfig")]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub states: BTreeMap<StateId, PartialSlot>,
    pub variants: BTreeMap<StateId, BTreeMap<VariantId, PartialSlot>>,
    pub heroes: BTreeMap<u32, HeroOverrides>,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct RawConfig {
    #[serde(deserialize_with = "states")]
    states: BTreeMap<StateId, PartialSlot>,
    #[serde(deserialize_with = "variants")]
    variants: BTreeMap<StateId, BTreeMap<VariantId, PartialSlot>>,
    #[serde(deserialize_with = "heroes")]
    heroes: BTreeMap<u32, HeroOverrides>,
}

impl<'de> Deserialize<'de> for Config {
    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, D::Error> {
        let raw = RawConfig::deserialize(de)?;
        Ok(Self { states: raw.states, variants: raw.variants, heroes: raw.heroes })
    }
}

fn partial(details: &str, state: &str, timer: Timer) -> PartialSlot {
    PartialSlot {
        enabled: Some(true),
        details: Some(details.into()),
        state: Some(state.into()),
        large_image: Some(PartialImage { enabled: Some(false), source: Some(ImageSource::HeroIcon) }),
        small_image: Some(PartialImage { enabled: Some(false), source: Some(ImageSource::RankBadge) }),
        large_text: Some("{hero}".into()),
        small_text: Some("{rank}".into()),
        timer: Some(timer),
        party_size: None,
    }
}

/// Spectating and private lobbies show no hero or rank art unless the user turns it on: the art would describe
/// someone else, or give a private match away.
fn without_art(mut slot: PartialSlot) -> PartialSlot {
    for image in [&mut slot.large_image, &mut slot.small_image].into_iter().flatten() {
        image.enabled = Some(false);
    }
    slot.large_text = Some(String::new());
    slot.small_text = Some(String::new());
    slot
}

/// States where the local player's hero is known, so the hero icon can be the big image.
fn with_hero_art(mut slot: PartialSlot) -> PartialSlot {
    if let Some(image) = slot.large_image.as_mut() {
        image.enabled = Some(true);
    }
    slot
}

pub(crate) fn builtin_state(state: StateId) -> PartialSlot {
    use StateId::*;
    use Timer::*;
    match state {
        Playing => partial("Playing Deadlock", "", ElapsedInState),
        MainMenu => partial("Browsing the main menu", "", ElapsedInState),
        Hideout => with_hero_art(partial("Relaxing in the Hideout", "[[Hanging out as {hero}]]", MatchTime)),
        FindingMatch => partial("Looking for a match", "", QueueTime),
        MatchFound => partial("Loading into a match", "", ElapsedInState),
        PreGame => with_hero_art(partial("Waiting for the match to start", "[[Playing as {hero}]]", ElapsedInState)),
        InMatch => with_hero_art(partial("In a match", "[[Playing as {hero}]]", MatchTime)),
        StreetBrawlRound => with_hero_art(partial("Playing Street Brawl", "[[Round {round}]]", MatchTime)),
        Paused => with_hero_art(partial("Match paused", "[[Playing as {hero}]]", None)),
        Spectating => without_art(partial("Spectating a match", "", MatchTime)),
        PostGame => with_hero_art(partial("Match finished", "{result}", ElapsedInState)),
        PrivateLobby => without_art(partial("In a private match", "", ElapsedInState)),
        Practice => with_hero_art(partial("Practicing", "", ElapsedInState)),
    }
}

pub(crate) fn builtin_variant(state: StateId, variant: VariantId) -> Option<PartialSlot> {
    match state {
        StateId::Hideout if variant == VariantId::Party => {
            let line = "[[In a party of {partySize} as {hero}||In a party of {partySize}]]";
            return Some(PartialSlot { state: Some(line.into()), ..PartialSlot::default() });
        }
        StateId::FindingMatch => return finding_match_variant(variant),
        StateId::InMatch | StateId::Paused => {}
        _ => return None,
    }
    let details = match variant {
        VariantId::Unranked => "Playing Unranked",
        VariantId::Ranked => "Playing Ranked",
        VariantId::Bots => "Playing against bots",
        VariantId::Tutorial => "Learning in the tutorial",
        VariantId::StreetBrawl => "Playing Street Brawl",
        VariantId::Sandbox => "Experimenting in the Sandbox",
        VariantId::ExploreNyc => "Exploring New York",
        _ => return None,
    };
    let small_image = (variant == VariantId::Ranked).then_some(PartialImage { enabled: Some(true), source: None });
    Some(PartialSlot { details: Some(details.into()), small_image, ..PartialSlot::default() })
}

fn finding_match_variant(variant: VariantId) -> Option<PartialSlot> {
    let details = match variant {
        VariantId::Unranked => "Looking for an Unranked match",
        VariantId::Ranked => "Looking for a Ranked match",
        VariantId::Bots => "Setting up a bot match",
        VariantId::StreetBrawl => "Looking for a Street Brawl match",
        _ => return None,
    };
    Some(PartialSlot { details: Some(details.into()), ..PartialSlot::default() })
}

/// Every built-in state and variant slot written out, for an editor that shows defaults and resets to them.
pub fn builtin_config() -> Config {
    let mut config = Config::default();
    for state in StateId::ALL {
        config.states.insert(state, builtin_state(state));
        for variant in state.variants() {
            if let Some(slot) = builtin_variant(state, *variant) {
                config.variants.entry(state).or_default().insert(*variant, slot);
            }
        }
    }
    config
}

/// Resolves one slot per field: hero override of the variant, the variant, hero override of the state, the state,
/// then the built-in default. Hero layers apply only to states that have a hero scope.
pub fn resolve_slot(config: &Config, state: StateId, variant: Option<VariantId>, hero_id: Option<u32>) -> Slot {
    let hero = hero_id.filter(|_| state.has_hero_scope()).and_then(|id| config.heroes.get(&id));
    let builtin_variant = variant.and_then(|v| builtin_variant(state, v));
    let builtin_state = builtin_state(state);
    let layers: Vec<&PartialSlot> = [
        hero.zip(variant).and_then(|(h, v)| h.variants.get(&state)?.get(&v)),
        variant.and_then(|v| config.variants.get(&state)?.get(&v)),
        hero.and_then(|h| h.states.get(&state)),
        config.states.get(&state),
        builtin_variant.as_ref(),
        Some(&builtin_state),
    ]
    .into_iter()
    .flatten()
    .collect();

    let fallback = Slot::default();
    let pick = |f: fn(&PartialSlot) -> Option<&String>| layers.iter().find_map(|l| f(l)).cloned().unwrap_or_default();
    let image = |f: fn(&PartialSlot) -> Option<&PartialImage>, default: &Image| Image {
        enabled: layers.iter().find_map(|l| f(l)?.enabled).unwrap_or(default.enabled),
        source: layers.iter().find_map(|l| f(l)?.source.clone()).unwrap_or_else(|| default.source.clone()),
    };
    Slot {
        enabled: layers.iter().find_map(|l| l.enabled).unwrap_or(fallback.enabled),
        details: pick(|l| l.details.as_ref()),
        state: pick(|l| l.state.as_ref()),
        large_image: image(|l| l.large_image.as_ref(), &fallback.large_image),
        small_image: image(|l| l.small_image.as_ref(), &fallback.small_image),
        large_text: pick(|l| l.large_text.as_ref()),
        small_text: pick(|l| l.small_text.as_ref()),
        timer: layers.iter().find_map(|l| l.timer).unwrap_or(fallback.timer),
        party_size: layers.iter().find_map(|l| l.party_size).unwrap_or(fallback.party_size),
    }
}

impl Default for Slot {
    fn default() -> Self {
        let off = |source| Image { enabled: false, source };
        Self {
            enabled: true,
            details: String::new(),
            state: String::new(),
            large_image: off(ImageSource::HeroIcon),
            small_image: off(ImageSource::RankBadge),
            large_text: String::new(),
            small_text: String::new(),
            timer: Timer::None,
            party_size: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use StateId::*;
    use VariantId::*;

    const HERO: u32 = 7;

    fn details(text: &str) -> PartialSlot {
        PartialSlot { details: Some(text.into()), ..PartialSlot::default() }
    }

    fn resolve(c: &Config, s: StateId, v: Option<VariantId>, h: Option<u32>) -> Slot {
        resolve_slot(c, s, v, h)
    }

    fn with_variant(c: &mut Config, s: StateId, v: VariantId, p: PartialSlot) {
        c.variants.entry(s).or_default().insert(v, p);
    }

    fn with_hero_state(c: &mut Config, s: StateId, p: PartialSlot) {
        c.heroes.entry(HERO).or_default().states.insert(s, p);
    }

    fn with_hero_variant(c: &mut Config, s: StateId, v: VariantId, p: PartialSlot) {
        c.heroes.entry(HERO).or_default().variants.entry(s).or_default().insert(v, p);
    }

    #[test]
    fn default_config_resolves_the_built_in_slot() {
        let s = resolve(&Config::default(), MainMenu, None, None);
        assert!(s.enabled);
        assert_eq!(s.details, "Browsing the main menu");
        assert_eq!(s.state, "");
        assert_eq!(s.timer, Timer::ElapsedInState);
        assert!(!s.large_image.enabled && !s.small_image.enabled);
    }

    #[test]
    fn every_state_has_a_built_in_line() {
        for s in [
            Playing,
            MainMenu,
            Hideout,
            FindingMatch,
            MatchFound,
            PreGame,
            InMatch,
            StreetBrawlRound,
            Paused,
            Spectating,
            PostGame,
            PrivateLobby,
            Practice,
        ] {
            assert!(!resolve(&Config::default(), s, None, None).details.is_empty(), "{s:?}");
        }
    }

    #[test]
    fn built_in_in_match_label_depends_on_the_variant() {
        let c = Config::default();
        assert_eq!(resolve(&c, InMatch, None, None).details, "In a match");
        assert_eq!(resolve(&c, InMatch, Some(Ranked), None).details, "Playing Ranked");
    }

    #[test]
    fn state_override_beats_the_default_for_set_fields_only() {
        let mut c = Config::default();
        c.states.insert(Hideout, details("Chilling"));
        let s = resolve(&c, Hideout, None, None);
        assert_eq!(s.details, "Chilling");
        assert_eq!(s.state, "[[Hanging out as {hero}]]");
        assert_eq!(s.timer, Timer::MatchTime);
    }

    #[test]
    fn the_hideout_shows_the_match_clock_by_default() {
        assert_eq!(resolve(&Config::default(), Hideout, None, None).timer, Timer::MatchTime);
        assert_eq!(resolve(&Config::default(), Hideout, Some(Party), None).timer, Timer::MatchTime);
    }

    #[test]
    fn a_stored_hideout_timer_beats_the_new_default() {
        let c = parse(r#"{"states":{"hideout":{"timer":"elapsedInState"}}}"#);
        assert_eq!(resolve(&c, Hideout, None, None).timer, Timer::ElapsedInState);
    }

    #[test]
    fn a_hideout_slot_without_a_timer_picks_up_the_default() {
        let c = parse(r#"{"states":{"hideout":{"details":"Chilling"}}}"#);
        let s = resolve(&c, Hideout, None, None);
        assert_eq!(s.details, "Chilling");
        assert_eq!(s.timer, Timer::MatchTime);
    }

    #[test]
    fn every_state_keeps_its_built_in_timer() {
        let expected = [
            (Playing, Timer::ElapsedInState),
            (MainMenu, Timer::ElapsedInState),
            (Hideout, Timer::MatchTime),
            (FindingMatch, Timer::QueueTime),
            (MatchFound, Timer::ElapsedInState),
            (PreGame, Timer::ElapsedInState),
            (InMatch, Timer::MatchTime),
            (StreetBrawlRound, Timer::MatchTime),
            (Paused, Timer::None),
            (Spectating, Timer::MatchTime),
            (PostGame, Timer::ElapsedInState),
            (PrivateLobby, Timer::ElapsedInState),
            (Practice, Timer::ElapsedInState),
        ];
        for (state, timer) in expected {
            assert_eq!(resolve(&Config::default(), state, None, None).timer, timer, "{state:?}");
        }
    }

    #[test]
    fn an_empty_override_clears_the_line() {
        let mut c = Config::default();
        c.states.insert(Hideout, PartialSlot { state: Some(String::new()), ..PartialSlot::default() });
        assert_eq!(resolve(&c, Hideout, None, None).state, "");
    }

    #[test]
    fn variant_beats_state() {
        let mut c = Config::default();
        c.states.insert(InMatch, details("state"));
        with_variant(&mut c, InMatch, Ranked, details("variant"));
        assert_eq!(resolve(&c, InMatch, Some(Ranked), None).details, "variant");
        assert_eq!(resolve(&c, InMatch, Some(Unranked), None).details, "state");
        assert_eq!(resolve(&c, InMatch, None, None).details, "state");
    }

    #[test]
    fn state_override_beats_the_built_in_variant_label() {
        let mut c = Config::default();
        c.states.insert(InMatch, details("state"));
        assert_eq!(resolve(&c, InMatch, Some(Ranked), None).details, "state");
    }

    #[test]
    fn hero_state_override_beats_state() {
        let mut c = Config::default();
        c.states.insert(Hideout, details("state"));
        with_hero_state(&mut c, Hideout, details("hero"));
        assert_eq!(resolve(&c, Hideout, None, Some(HERO)).details, "hero");
        assert_eq!(resolve(&c, Hideout, None, Some(HERO + 1)).details, "state");
        assert_eq!(resolve(&c, Hideout, None, None).details, "state");
    }

    #[test]
    fn variant_beats_hero_state_override() {
        let mut c = Config::default();
        with_variant(&mut c, InMatch, Ranked, details("variant"));
        with_hero_state(&mut c, InMatch, details("hero state"));
        assert_eq!(resolve(&c, InMatch, Some(Ranked), Some(HERO)).details, "variant");
        assert_eq!(resolve(&c, InMatch, Some(Unranked), Some(HERO)).details, "hero state");
    }

    #[test]
    fn hero_variant_override_beats_everything() {
        let mut c = Config::default();
        c.states.insert(InMatch, details("state"));
        with_variant(&mut c, InMatch, Ranked, details("variant"));
        with_hero_state(&mut c, InMatch, details("hero state"));
        with_hero_variant(&mut c, InMatch, Ranked, details("hero variant"));
        assert_eq!(resolve(&c, InMatch, Some(Ranked), Some(HERO)).details, "hero variant");
        assert_eq!(resolve(&c, InMatch, Some(Ranked), Some(HERO + 1)).details, "variant");
    }

    #[test]
    fn hero_variant_override_ignores_other_variants() {
        let mut c = Config::default();
        with_hero_variant(&mut c, InMatch, Ranked, details("hero variant"));
        assert_eq!(resolve(&c, InMatch, Some(Unranked), Some(HERO)).details, "Playing Unranked");
        assert_eq!(resolve(&c, InMatch, None, Some(HERO)).details, "In a match");
    }

    #[test]
    fn hero_override_changes_one_field_and_inherits_the_rest() {
        let mut c = Config::default();
        c.states.insert(Hideout, PartialSlot { state: Some("state line".into()), ..PartialSlot::default() });
        with_hero_state(&mut c, Hideout, details("hero details"));
        let s = resolve(&c, Hideout, None, Some(HERO));
        assert_eq!(s.details, "hero details");
        assert_eq!(s.state, "state line");
    }

    #[test]
    fn variant_with_enabled_unset_inherits_a_disabled_state() {
        let mut c = Config::default();
        c.states.insert(InMatch, PartialSlot { enabled: Some(false), ..PartialSlot::default() });
        with_variant(&mut c, InMatch, Ranked, details("x"));
        assert!(!resolve(&c, InMatch, Some(Ranked), None).enabled);
    }

    #[test]
    fn variant_can_re_enable_a_disabled_state() {
        let mut c = Config::default();
        c.states.insert(InMatch, PartialSlot { enabled: Some(false), ..PartialSlot::default() });
        with_variant(&mut c, InMatch, Ranked, PartialSlot { enabled: Some(true), ..PartialSlot::default() });
        assert!(resolve(&c, InMatch, Some(Ranked), None).enabled);
        assert!(!resolve(&c, InMatch, Some(Unranked), None).enabled);
    }

    #[test]
    fn disabled_variant_leaves_the_state_enabled() {
        let mut c = Config::default();
        with_variant(&mut c, InMatch, Ranked, PartialSlot { enabled: Some(false), ..PartialSlot::default() });
        assert!(!resolve(&c, InMatch, Some(Ranked), None).enabled);
        assert!(resolve(&c, InMatch, None, None).enabled);
    }

    #[test]
    fn image_fields_resolve_per_sub_field() {
        let mut c = Config::default();
        c.states.insert(
            Hideout,
            PartialSlot {
                large_image: Some(PartialImage { enabled: Some(true), source: None }),
                ..PartialSlot::default()
            },
        );
        with_variant(
            &mut c,
            Hideout,
            Solo,
            PartialSlot {
                large_image: Some(PartialImage { enabled: None, source: Some(ImageSource::CustomUrl("u".into())) }),
                ..PartialSlot::default()
            },
        );
        let s = resolve(&c, Hideout, Some(Solo), None);
        assert!(s.large_image.enabled);
        assert_eq!(s.large_image.source, ImageSource::CustomUrl("u".into()));
        assert_eq!(s.small_image, Image { enabled: false, source: ImageSource::RankBadge });
    }

    #[test]
    fn text_and_timer_resolve_through_the_layers() {
        let mut c = Config::default();
        c.states.insert(
            Hideout,
            PartialSlot { large_text: Some("big".into()), timer: Some(Timer::None), ..PartialSlot::default() },
        );
        with_hero_state(&mut c, Hideout, PartialSlot { small_text: Some("small".into()), ..PartialSlot::default() });
        let s = resolve(&c, Hideout, None, Some(HERO));
        assert_eq!((s.large_text.as_str(), s.small_text.as_str(), s.timer), ("big", "small", Timer::None));
    }

    #[test]
    fn hero_overrides_never_apply_to_states_without_a_hero_scope() {
        for state in [Playing, MainMenu, Spectating, PrivateLobby] {
            let mut c = Config::default();
            with_hero_state(&mut c, state, details("hero"));
            with_hero_variant(&mut c, state, Ranked, details("hero"));
            assert_ne!(resolve(&c, state, Some(Ranked), Some(HERO)).details, "hero", "{state:?}");
        }
    }

    fn parse(json: &str) -> Config {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn an_unknown_state_key_is_dropped_not_fatal() {
        let c = parse(r#"{"states":{"hideout":{"details":"Hi"},"someFutureState":{"details":"x"}}}"#);
        assert_eq!(c.states.len(), 1);
        assert_eq!(c.states[&Hideout].details.as_deref(), Some("Hi"));
    }

    #[test]
    fn an_unknown_variant_key_is_dropped_not_fatal() {
        let c =
            parse(r#"{"variants":{"inMatch":{"ranked":{"details":"R"},"future":{"details":"F"}},"nope":{"solo":{}}}}"#);
        assert_eq!(c.variants.len(), 1);
        assert_eq!(c.variants[&InMatch].len(), 1);
        assert_eq!(c.variants[&InMatch][&Ranked].details.as_deref(), Some("R"));
    }

    #[test]
    fn the_removed_hero_labs_variant_is_dropped_and_the_rest_kept() {
        let c = parse(
            r#"{"variants":{"inMatch":{"heroLabs":{"details":"H"},"ranked":{"details":"R"}},"findingMatch":{"heroLabs":{}}},
                "heroes":{"7":{"variants":{"inMatch":{"heroLabs":{"details":"H"},"ranked":{"details":"R"}}}}}}"#,
        );
        assert_eq!(c.variants[&InMatch].len(), 1);
        assert_eq!(c.variants[&InMatch][&Ranked].details.as_deref(), Some("R"));
        assert!(c.variants[&FindingMatch].is_empty());
        assert_eq!(c.heroes[&7].variants[&InMatch].len(), 1);
    }

    #[test]
    fn hero_overrides_drop_unknown_keys_too() {
        let c = parse(
            r#"{"heroes":{"7":{"states":{"hideout":{"details":"H"},"zzz":{}},"variants":{"inMatch":{"won":{},"zzz":{}}}}}}"#,
        );
        let h = &c.heroes[&7];
        assert_eq!(h.states.len(), 1);
        assert_eq!(h.variants[&InMatch].len(), 1);
    }

    #[test]
    fn a_slot_that_cannot_be_read_is_dropped_and_the_rest_kept() {
        let c =
            parse(r#"{"states":{"hideout":{"largeImage":{"source":{"mystery":1}}},"mainMenu":{"details":"Menu"}}}"#);
        assert!(!c.states.contains_key(&Hideout));
        assert_eq!(c.states[&MainMenu].details.as_deref(), Some("Menu"));
    }

    #[test]
    fn a_config_round_trips_through_json() {
        let mut c = Config::default();
        c.states.insert(Hideout, details("Chilling"));
        with_variant(&mut c, InMatch, Ranked, details("Ranked"));
        with_hero_state(&mut c, Hideout, details("Hero"));
        with_hero_variant(&mut c, InMatch, Won, details("Won"));
        let back: Config = serde_json::from_str(&serde_json::to_string(&c).unwrap()).unwrap();
        assert_eq!(back, c);
    }

    #[test]
    fn an_empty_object_is_the_default_config() {
        assert_eq!(parse("{}"), Config::default());
    }
}
