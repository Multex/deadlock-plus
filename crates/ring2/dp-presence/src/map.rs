use crate::art::{image_url, own_rank};
use crate::config::{resolve_slot, Config, Timer};
use crate::state::{classify, StateId, VariantId};
use crate::template::{render, Values};

pub const MAX_TEXT_CHARS: usize = 128;
pub const MIN_TEXT_CHARS: usize = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum PresenceLevel {
    #[default]
    Off,
    Basic,
    Detailed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Context {
    #[default]
    Other,
    Hideout,
    Match,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    MatchIntro,
    Loading,
    PreGame,
    InProgress,
    PostGame,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Perspective {
    #[default]
    Unknown,
    Playing,
    Spectating,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MatchMode {
    Unranked,
    Ranked,
    PrivateLobby,
    CoopBot,
    Tutorial,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GameMode {
    Normal,
    StreetBrawl,
    Sandbox,
    ExploreNyc,
    Other,
}

/// Street Brawl round and team scores, only while the game mode is Street Brawl.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct StreetBrawlFacts {
    pub round: Option<u32>,
    pub amber: Option<u32>,
    pub sapphire: Option<u32>,
}

/// The local player's own party and queue: counts and requested modes only.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct PartyFacts {
    pub size: u32,
    pub queueing: bool,
    pub queued_secs: Option<u64>,
    pub match_mode: Option<MatchMode>,
    pub game_mode: Option<GameMode>,
    /// Set when the queue is a private bot match; the client reports 0 otherwise.
    pub bot_difficulty: Option<u32>,
}

pub const PARTY_MAX: u32 = 6;
/// Street Brawl is four against four.
pub const STREET_BRAWL_PARTY_MAX: u32 = 4;

#[derive(Debug, Clone, PartialEq, Default)]
pub struct LiveFacts {
    pub context: Context,
    pub phase: Option<Phase>,
    pub perspective: Perspective,
    pub match_mode: Option<MatchMode>,
    pub game_mode: Option<GameMode>,
    pub hero: Option<String>,
    pub hero_id: Option<u32>,
    /// Image URLs for the hero shown; shown to Discord only where the hero itself may be shown.
    pub hero_portrait: Option<String>,
    pub hero_icon: Option<String>,
    /// The hero's own hideout line, such as "Mixing Drinks in the Hideout".
    pub hero_presence: Option<String>,
    pub match_time_secs: Option<f32>,
    pub paused: bool,
    pub drift: bool,
    pub local_won: Option<bool>,
    pub kills: Option<u32>,
    pub deaths: Option<u32>,
    pub assists: Option<u32>,
    pub souls: Option<u32>,
    /// Packed badge, `tier * 10 + subrank`; zero or `None` means unranked.
    pub rank: Option<u32>,
    pub rank_name: Option<String>,
    pub street_brawl: Option<StreetBrawlFacts>,
    pub match_id: Option<u64>,
    /// `None` when the party could not be read.
    pub party: Option<PartyFacts>,
}

impl LiveFacts {
    /// While finding a match the modes that matter are the ones the party asked for, not those of the last match.
    pub(crate) fn modes(&self, state: StateId) -> (Option<MatchMode>, Option<GameMode>) {
        match (state, self.party) {
            (StateId::FindingMatch, Some(p)) => (p.match_mode, p.game_mode),
            _ => (self.match_mode, self.game_mode),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct GameFacts {
    pub running: bool,
    pub started_at: Option<i64>,
    /// Current unix time in seconds; anchors the match timer.
    pub now_secs: i64,
    pub live: Option<LiveFacts>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Button {
    pub label: String,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Presence {
    pub details: Option<String>,
    pub state: Option<String>,
    pub start_timestamp: Option<i64>,
    pub large_image: Option<String>,
    pub large_text: Option<String>,
    pub small_image: Option<String>,
    pub small_text: Option<String>,
    pub buttons: Vec<Button>,
    /// Party size and capacity, for Discord's "(2 of 6)".
    pub party: Option<(u32, u32)>,
}

const DOWNLOAD_URL: &str = "https://deadlockplus.app/?ref=discord-rpc";

pub fn with_support_button(mut presence: Presence, on: bool) -> Presence {
    if on {
        presence.buttons.push(Button { label: "Download Deadlock+".into(), url: DOWNLOAD_URL.into() });
    }
    presence
}

const LOGO_URL: &str = "https://deadlockplus.app/icon-512.png";

/// Discord falls back to the application's own icon, the Deadlock logo, whenever no large image is sent.
pub fn with_deadlock_plus_logo(mut presence: Presence, on: bool) -> Presence {
    if on && presence.large_image.is_none() {
        presence.large_image = Some(LOGO_URL.into());
        if presence.large_text.as_deref().is_none_or(str::is_empty) {
            presence.large_text = Some("Deadlock+".into());
        }
    }
    presence
}

pub fn map(level: PresenceLevel, facts: &GameFacts) -> Option<Presence> {
    map_with(level, facts, &Config::default())
}

pub fn map_with(level: PresenceLevel, facts: &GameFacts, config: &Config) -> Option<Presence> {
    if level == PresenceLevel::Off || !facts.running {
        return None;
    }
    let live = facts.live.as_ref().filter(|l| level == PresenceLevel::Detailed && !l.drift);
    let (state, variant) = live.map_or((StateId::Playing, None), classify);
    let slot = resolve_slot(config, state, variant, live.and_then(|l| l.hero_id));
    if !slot.enabled {
        return None;
    }

    let values = live.map(|l| values_for(state, variant, l)).unwrap_or_default();
    Some(Presence {
        details: render(&slot.details, &values),
        state: render(&slot.state, &values),
        start_timestamp: start_timestamp(slot.timer, facts, live),
        large_image: live.and_then(|l| image_url(&slot.large_image, state, l)),
        large_text: render(&slot.large_text, &values),
        small_image: live.and_then(|l| image_url(&slot.small_image, state, l)),
        small_text: render(&slot.small_text, &values),
        party: live.and_then(|l| party_pair(slot.party_size, state, l)),
        ..Presence::default()
    })
}

/// The clock the editor preview pretends it is, so a start timestamp can be turned back into elapsed seconds.
pub const PREVIEW_NOW_SECS: i64 = 10_000;

/// What the Discord card would show for a state with made-up own values, for an editor preview. Privacy rules are not
/// applied: the sample values belong to no one.
pub fn preview(
    config: &Config,
    state: StateId,
    variant: Option<VariantId>,
    hero_id: Option<u32>,
    hero_name: Option<&str>,
) -> Option<Presence> {
    let sample = PreviewSample { hero_name: hero_name.map(str::to_owned), ..PreviewSample::default() };
    preview_with(config, state, variant, hero_id, &sample)
}

/// The made-up player an editor preview draws: a hero (name and art) and a rank name, all supplied by the caller.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PreviewSample {
    pub hero_name: Option<String>,
    pub hero_portrait: Option<String>,
    pub hero_icon: Option<String>,
    pub rank_name: Option<String>,
    pub hero_presence: Option<String>,
}

pub fn preview_with(
    config: &Config,
    state: StateId,
    variant: Option<VariantId>,
    hero_id: Option<u32>,
    who: &PreviewSample,
) -> Option<Presence> {
    const NOW: i64 = PREVIEW_NOW_SECS;
    const ELAPSED: i64 = 754;
    const SAMPLE_MATCH_ID: u64 = 123_456_789;
    const QUEUED: u64 = 75;
    const SAMPLE_RANK: u32 = 52;
    let slot = resolve_slot(config, state, variant, hero_id);
    if !slot.enabled {
        return None;
    }
    let sample = LiveFacts {
        hero: Some(who.hero_name.clone().unwrap_or_else(|| "Haze".to_owned())),
        hero_portrait: who.hero_portrait.clone(),
        hero_icon: who.hero_icon.clone(),
        rank: Some(SAMPLE_RANK),
        rank_name: who.rank_name.clone(),
        hero_presence: who.hero_presence.clone(),
        game_mode: if state == StateId::StreetBrawlRound {
            Some(GameMode::StreetBrawl)
        } else {
            variant.and_then(|v| match v {
                VariantId::StreetBrawl => Some(GameMode::StreetBrawl),
                VariantId::Sandbox => Some(GameMode::Sandbox),
                VariantId::ExploreNyc => Some(GameMode::ExploreNyc),
                _ => None,
            })
        },
        match_mode: variant.and_then(|v| match v {
            VariantId::Unranked => Some(MatchMode::Unranked),
            VariantId::Ranked => Some(MatchMode::Ranked),
            VariantId::Bots => Some(MatchMode::CoopBot),
            VariantId::Tutorial => Some(MatchMode::Tutorial),
            _ => None,
        }),
        match_time_secs: Some(ELAPSED as f32),
        street_brawl: Some(StreetBrawlFacts { round: Some(3), amber: Some(2), sapphire: Some(1) }),
        kills: Some(12),
        deaths: Some(3),
        assists: Some(8),
        souls: Some(24_100),
        match_id: Some(SAMPLE_MATCH_ID),
        ..LiveFacts::default()
    };
    let sample = LiveFacts {
        party: Some(PartyFacts {
            size: if variant == Some(VariantId::Solo) { 1 } else { 3 },
            queueing: state == StateId::FindingMatch,
            queued_secs: (state == StateId::FindingMatch).then_some(QUEUED),
            match_mode: sample.match_mode,
            game_mode: sample.game_mode,
            bot_difficulty: None,
        }),
        ..sample
    };
    let values = values_for(state, variant, &sample);
    let facts = GameFacts { running: true, started_at: Some(NOW - ELAPSED), now_secs: NOW, live: Some(sample.clone()) };
    Some(Presence {
        details: render(&slot.details, &values),
        state: render(&slot.state, &values),
        start_timestamp: start_timestamp(slot.timer, &facts, facts.live.as_ref()),
        large_image: image_url(&slot.large_image, state, &sample),
        large_text: render(&slot.large_text, &values),
        small_image: image_url(&slot.small_image, state, &sample),
        small_text: render(&slot.small_text, &values),
        party: party_pair(slot.party_size, state, &sample),
        ..Presence::default()
    })
}

fn start_timestamp(timer: Timer, facts: &GameFacts, live: Option<&LiveFacts>) -> Option<i64> {
    match timer {
        Timer::None => None,
        Timer::ElapsedInState => facts.started_at,
        Timer::QueueTime => {
            let party = live?.party.filter(|p| p.queueing)?;
            party.queued_secs.map(|secs| facts.now_secs - secs as i64)
        }
        Timer::MatchTime => {
            let live = live.filter(|l| !l.paused)?;
            valid_match_time(live).map(|t| facts.now_secs - t as i64)
        }
    }
}

fn valid_match_time(live: &LiveFacts) -> Option<f32> {
    live.match_time_secs.filter(|t| t.is_finite() && *t >= 0.0)
}

/// The only place facts become template values. Anything not listed here cannot reach a template, and the hero and
/// result are withheld whenever they would describe someone other than the local player.
fn values_for(state: StateId, variant: Option<VariantId>, live: &LiveFacts) -> Values {
    let spectating = live.perspective == Perspective::Spectating;
    let own = |n: Option<u32>| n.filter(|_| !spectating);
    let hero_allowed = hero_allowed(state, live);
    let party = visible_party(state, live);
    let brawl = live.street_brawl.filter(|_| !spectating);
    let (match_mode, game_mode) = live.modes(state);
    Values {
        hero: live.hero.clone().filter(|_| hero_allowed),
        hero_presence: live.hero_presence.clone().filter(|_| hero_allowed),
        mode: mode_name(match_mode).map(str::to_owned),
        game_mode: game_mode_name(game_mode).map(str::to_owned),
        result: match variant {
            Some(VariantId::Won) => Some("Won".to_owned()),
            Some(VariantId::Lost) => Some("Lost".to_owned()),
            _ => None,
        },
        elapsed: valid_match_time(live).map(format_elapsed),
        kills: own(live.kills).map(|n| n.to_string()),
        deaths: own(live.deaths).map(|n| n.to_string()),
        assists: own(live.assists).map(|n| n.to_string()),
        souls: own(live.souls).map(format_souls),
        rank: format_rank(live),
        round: brawl.and_then(|b| b.round).map(|n| n.to_string()),
        score_amber: brawl.and_then(|b| b.amber).map(|n| n.to_string()),
        score_sapphire: brawl.and_then(|b| b.sapphire).map(|n| n.to_string()),
        match_id: live.match_id.filter(|_| live.match_mode != Some(MatchMode::PrivateLobby)).map(|id| id.to_string()),
        party_size: party.map(|p| p.size.to_string()),
        party_max: party.map(|_| party_max(state, live).to_string()),
        queue_time: party.filter(|p| p.queueing).and_then(|p| p.queued_secs).map(|s| format_elapsed(s as f32)),
    }
}

/// The local party, unless showing it would describe someone else or give a private match away.
fn visible_party(state: StateId, live: &LiveFacts) -> Option<PartyFacts> {
    let private = state == StateId::PrivateLobby || live.match_mode == Some(MatchMode::PrivateLobby);
    live.party.filter(|_| live.perspective != Perspective::Spectating && !private)
}

/// How many a party can hold. Only a Street Brawl that is queued for or being played caps it at four: outside a
/// match the game mode is the last match's, which says nothing about the next one.
fn party_max(state: StateId, live: &LiveFacts) -> u32 {
    let brawl = !matches!(state, StateId::Hideout | StateId::MainMenu | StateId::Playing)
        && live.modes(state).1 == Some(GameMode::StreetBrawl);
    if brawl {
        STREET_BRAWL_PARTY_MAX
    } else {
        PARTY_MAX
    }
}

fn party_pair(on: bool, state: StateId, live: &LiveFacts) -> Option<(u32, u32)> {
    visible_party(state, live).filter(|p| on && p.size >= 2).map(|p| (p.size, party_max(state, live)))
}

pub(crate) fn hero_allowed(state: StateId, live: &LiveFacts) -> bool {
    live.perspective != Perspective::Spectating || matches!(state, StateId::Spectating | StateId::PrivateLobby)
}

fn format_rank(live: &LiveFacts) -> Option<String> {
    let (_, sub) = own_rank(live)?;
    let name = live.rank_name.as_deref()?;
    Some(if sub == 0 { name.to_owned() } else { format!("{name} {sub}") })
}

fn format_souls(souls: u32) -> String {
    if souls < 1000 {
        return souls.to_string();
    }
    let tenths = (souls + 50) / 100;
    if tenths.is_multiple_of(10) {
        format!("{}k", tenths / 10)
    } else {
        format!("{}.{}k", tenths / 10, tenths % 10)
    }
}

fn format_elapsed(secs: f32) -> String {
    let total = secs as u64;
    let (h, m, s) = (total / 3600, total / 60 % 60, total % 60);
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m}:{s:02}")
    }
}

fn game_mode_name(mode: Option<GameMode>) -> Option<&'static str> {
    match mode {
        Some(GameMode::StreetBrawl) => Some("Street Brawl"),
        Some(GameMode::Sandbox) => Some("Sandbox"),
        Some(GameMode::ExploreNyc) => Some("Explore NYC"),
        _ => None,
    }
}

fn mode_name(mode: Option<MatchMode>) -> Option<&'static str> {
    match mode {
        Some(MatchMode::Unranked) => Some("Unranked"),
        Some(MatchMode::Ranked) => Some("Ranked"),
        Some(MatchMode::CoopBot) => Some("vs bots"),
        Some(MatchMode::Tutorial) => Some("Tutorial"),
        _ => None,
    }
}

/// Discord rejects text under 2 characters; a zero-width space keeps a 1-char line valid without showing extra text.
pub(crate) fn fit(text: &str) -> Option<String> {
    let text = text.trim();
    let count = text.chars().count();
    if count == 0 {
        return None;
    }
    if count > MAX_TEXT_CHARS {
        let mut out: String = text.chars().take(MAX_TEXT_CHARS - 1).collect();
        out.push('…');
        return Some(out);
    }
    if count < MIN_TEXT_CHARS {
        return Some(format!("{text}\u{200B}"));
    }
    Some(text.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn running(started_at: Option<i64>) -> GameFacts {
        GameFacts { running: true, started_at, ..GameFacts::default() }
    }

    #[test]
    fn off_maps_to_none() {
        assert_eq!(map(PresenceLevel::Off, &running(Some(1))), None);
    }

    #[test]
    fn not_running_maps_to_none() {
        assert_eq!(
            map(PresenceLevel::Basic, &GameFacts { running: false, started_at: Some(1), ..GameFacts::default() }),
            None
        );
    }

    #[test]
    fn basic_running_has_details_and_timestamp() {
        let p = map(PresenceLevel::Basic, &running(Some(1_700_000_000))).unwrap();
        assert_eq!(p.details.as_deref(), Some("Playing Deadlock"));
        assert_eq!(p.start_timestamp, Some(1_700_000_000));
        assert_eq!(p.state, None);
        assert_eq!(p.large_image, None);
    }

    #[test]
    fn support_button_is_added_only_when_on() {
        let base = map(PresenceLevel::Basic, &running(None)).unwrap();
        assert!(with_support_button(base.clone(), false).buttons.is_empty());
        assert_eq!(
            with_support_button(base, true).buttons,
            vec![Button {
                label: "Download Deadlock+".into(),
                url: "https://deadlockplus.app/?ref=discord-rpc".into()
            }]
        );
    }

    #[test]
    fn support_button_keeps_other_fields_and_buttons() {
        let p = Presence {
            details: Some("d".into()),
            buttons: vec![Button { label: "x".into(), url: "u".into() }],
            ..Presence::default()
        };
        let out = with_support_button(p, true);
        assert_eq!(out.details.as_deref(), Some("d"));
        assert_eq!(out.buttons.len(), 2);
    }

    #[test]
    fn logo_fills_a_missing_large_image_at_basic_level() {
        let base = map(PresenceLevel::Basic, &running(None)).unwrap();
        let out = with_deadlock_plus_logo(base, true);
        assert_eq!(out.large_image.as_deref(), Some(LOGO_URL));
        assert_eq!(out.large_text.as_deref(), Some("Deadlock+"));
    }

    #[test]
    fn logo_is_not_added_when_off() {
        let base = map(PresenceLevel::Basic, &running(None)).unwrap();
        assert_eq!(with_deadlock_plus_logo(base.clone(), false), base);
    }

    #[test]
    fn logo_never_replaces_a_sent_large_image() {
        let p = Presence { large_image: Some("https://x/hero.png".into()), ..Presence::default() };
        assert_eq!(with_deadlock_plus_logo(p.clone(), true), p);
    }

    #[test]
    fn logo_keeps_the_configured_hover_text() {
        let p = Presence { large_text: Some("In the Hideout".into()), ..Presence::default() };
        let out = with_deadlock_plus_logo(p, true);
        assert_eq!(out.large_image.as_deref(), Some(LOGO_URL));
        assert_eq!(out.large_text.as_deref(), Some("In the Hideout"));
    }

    #[test]
    fn logo_replaces_empty_hover_text() {
        let p = Presence { large_text: Some(String::new()), ..Presence::default() };
        assert_eq!(with_deadlock_plus_logo(p, true).large_text.as_deref(), Some("Deadlock+"));
    }

    #[test]
    fn basic_sends_no_buttons() {
        assert!(map(PresenceLevel::Basic, &running(None)).unwrap().buttons.is_empty());
    }

    #[test]
    fn unknown_start_time_omits_timestamp() {
        let p = map(PresenceLevel::Basic, &running(None)).unwrap();
        assert_eq!(p.start_timestamp, None);
        assert!(p.details.is_some());
    }

    #[test]
    fn fit_truncates_to_max_chars() {
        let long = "a".repeat(300);
        let out = fit(&long).unwrap();
        assert_eq!(out.chars().count(), MAX_TEXT_CHARS);
        assert!(out.ends_with('…'));
    }

    #[test]
    fn fit_truncates_on_char_boundaries() {
        let long = "é".repeat(200);
        assert_eq!(fit(&long).unwrap().chars().count(), MAX_TEXT_CHARS);
    }

    #[test]
    fn fit_keeps_exact_limit_untouched() {
        let s = "b".repeat(MAX_TEXT_CHARS);
        assert_eq!(fit(&s).unwrap(), s);
    }

    #[test]
    fn fit_pads_short_text() {
        let out = fit("x").unwrap();
        assert_eq!(out.chars().count(), MIN_TEXT_CHARS);
        assert!(out.starts_with('x'));
    }

    #[test]
    fn fit_drops_blank() {
        assert_eq!(fit(""), None);
        assert_eq!(fit("   "), None);
    }

    #[test]
    fn fit_trims() {
        assert_eq!(fit("  hi  ").as_deref(), Some("hi"));
    }

    fn live(f: impl FnOnce(&mut LiveFacts)) -> GameFacts {
        let mut l = LiveFacts { context: Context::Match, phase: Some(Phase::InProgress), ..LiveFacts::default() };
        f(&mut l);
        GameFacts { running: true, started_at: Some(100), now_secs: 10_000, live: Some(l) }
    }

    fn detailed_of(facts: &GameFacts) -> Presence {
        map(PresenceLevel::Detailed, facts).unwrap()
    }

    #[test]
    fn detailed_without_live_matches_basic() {
        let f = running(Some(5));
        assert_eq!(map(PresenceLevel::Detailed, &f), map(PresenceLevel::Basic, &f));
    }

    #[test]
    fn detailed_with_drift_matches_basic() {
        let f = live(|l| {
            l.drift = true;
            l.hero = Some("Haze".into());
        });
        assert_eq!(map(PresenceLevel::Detailed, &f), map(PresenceLevel::Basic, &f));
    }

    #[test]
    fn detailed_not_running_is_none() {
        let mut f = live(|_| {});
        f.running = false;
        assert_eq!(map(PresenceLevel::Detailed, &f), None);
    }

    #[test]
    fn basic_ignores_live() {
        let f = live(|l| l.hero = Some("Haze".into()));
        assert_eq!(map(PresenceLevel::Basic, &f).unwrap().details.as_deref(), Some("Playing Deadlock"));
    }

    #[test]
    fn main_menu() {
        let p = detailed_of(&live(|l| {
            l.context = Context::Other;
            l.phase = None;
        }));
        assert_eq!(p.details.as_deref(), Some("Browsing the main menu"));
        assert_eq!(p.start_timestamp, Some(100));
    }

    #[test]
    fn hideout() {
        let p = detailed_of(&live(|l| {
            l.context = Context::Hideout;
            l.phase = Some(Phase::InProgress);
        }));
        assert_eq!(p.details.as_deref(), Some("Relaxing in the Hideout"));
        assert_eq!(p.state, None);
    }

    #[test]
    fn loading_phases() {
        for phase in [Phase::MatchIntro, Phase::Loading] {
            let p = detailed_of(&live(|l| l.phase = Some(phase)));
            assert_eq!(p.details.as_deref(), Some("Loading into a match"));
        }
    }

    #[test]
    fn pre_game() {
        let p = detailed_of(&live(|l| {
            l.phase = Some(Phase::PreGame);
            l.hero = Some("Haze".into());
        }));
        assert_eq!(p.details.as_deref(), Some("Waiting for the match to start"));
        assert_eq!(p.state.as_deref(), Some("Playing as Haze"));
    }

    #[test]
    fn in_match_mode_labels() {
        let cases = [
            (Some(MatchMode::Ranked), Some(GameMode::Normal), "Playing Ranked"),
            (Some(MatchMode::Unranked), None, "Playing Unranked"),
            (Some(MatchMode::CoopBot), Some(GameMode::Normal), "Playing against bots"),
            (Some(MatchMode::Tutorial), None, "Learning in the tutorial"),
            (Some(MatchMode::Unranked), Some(GameMode::StreetBrawl), "Playing Street Brawl"),
            (None, Some(GameMode::Sandbox), "Experimenting in the Sandbox"),
            (None, Some(GameMode::ExploreNyc), "Exploring New York"),
            (Some(MatchMode::Other), Some(GameMode::Other), "In a match"),
            (None, None, "In a match"),
        ];
        for (mm, gm, want) in cases {
            let p = detailed_of(&live(|l| {
                l.match_mode = mm;
                l.game_mode = gm;
            }));
            assert_eq!(p.details.as_deref(), Some(want), "{mm:?} {gm:?}");
        }
    }

    #[test]
    fn in_match_hero_is_bottom_line() {
        let p = detailed_of(&live(|l| l.hero = Some("Haze".into())));
        assert_eq!(p.state.as_deref(), Some("Playing as Haze"));
    }

    #[test]
    fn in_match_without_hero_has_no_state() {
        assert_eq!(detailed_of(&live(|_| {})).state, None);
    }

    #[test]
    fn match_timer_is_now_minus_match_time() {
        let p = detailed_of(&live(|l| l.match_time_secs = Some(600.9)));
        assert_eq!(p.start_timestamp, Some(10_000 - 600));
    }

    #[test]
    fn paused_drops_timer() {
        let p = detailed_of(&live(|l| {
            l.match_time_secs = Some(600.0);
            l.paused = true;
        }));
        assert_eq!(p.start_timestamp, None);
    }

    #[test]
    fn unknown_match_time_drops_timer() {
        assert_eq!(detailed_of(&live(|_| {})).start_timestamp, None);
    }

    #[test]
    fn post_game_won_lost_unscored() {
        for (won, want) in [(Some(true), Some("Won")), (Some(false), Some("Lost")), (None, None)] {
            let p = detailed_of(&live(|l| {
                l.phase = Some(Phase::PostGame);
                l.local_won = won;
            }));
            assert_eq!(p.details.as_deref(), Some("Match finished"));
            assert_eq!(p.state.as_deref(), want);
        }
    }

    #[test]
    fn spectating_hides_hero() {
        let p = detailed_of(&live(|l| {
            l.perspective = Perspective::Spectating;
            l.hero = Some("Haze".into());
            l.match_mode = Some(MatchMode::Ranked);
            l.match_time_secs = Some(60.0);
        }));
        assert_eq!(p.details.as_deref(), Some("Spectating a match"));
        assert_eq!(p.state, None);
        assert_eq!(p.start_timestamp, Some(10_000 - 60));
    }

    #[test]
    fn spectating_hides_post_game_result() {
        let p = detailed_of(&live(|l| {
            l.perspective = Perspective::Spectating;
            l.phase = Some(Phase::PostGame);
            l.local_won = Some(true);
        }));
        assert_eq!(p.state, None);
    }

    #[test]
    fn private_lobby_shows_only_private_match() {
        for phase in [Phase::Loading, Phase::InProgress, Phase::PostGame] {
            let p = detailed_of(&live(|l| {
                l.phase = Some(phase);
                l.match_mode = Some(MatchMode::PrivateLobby);
                l.hero = Some("Haze".into());
                l.match_time_secs = Some(60.0);
                l.local_won = Some(true);
            }));
            assert_eq!(p.details.as_deref(), Some("In a private match"));
            assert_eq!(p.state, None);
            assert_eq!(p.start_timestamp, Some(100));
        }
    }

    #[test]
    fn long_hero_name_is_truncated() {
        let p = detailed_of(&live(|l| l.hero = Some("h".repeat(300))));
        assert_eq!(p.state.unwrap().chars().count(), MAX_TEXT_CHARS);
    }

    #[test]
    fn one_char_hero_name_is_padded() {
        let p = detailed_of(&live(|l| l.hero = Some("H".into())));
        assert_eq!(p.state.as_deref(), Some("Playing as H"));
        assert_eq!(fit("H").unwrap().chars().count(), MIN_TEXT_CHARS);
    }
}
