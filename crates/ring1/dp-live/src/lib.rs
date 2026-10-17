mod attach;
mod convert;
mod engine_ping;
mod feed;
mod link;
mod load_grace;
mod party_policy;
mod probes;
mod queue;

pub use attach::ptrace_denied;
pub use convert::{board_from_snapshot, from_snapshot, hideout_party_size};
pub use engine_ping::EnginePing;
pub use link::{
    Backend, FactsFeed, GameLink, Latest, Link, LiveRead, PlatformBackend, PlatformReader, ReadError, Slot, Snapshot,
    TICK_INTERVAL,
};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Context {
    #[default]
    Other,
    Hideout,
    Match,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    MatchIntro,
    Loading,
    PreGame,
    InProgress,
    PostGame,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Perspective {
    #[default]
    Unknown,
    Playing,
    Spectating,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MatchMode {
    Unranked,
    Ranked,
    PrivateLobby,
    CoopBot,
    Tutorial,
    Other,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GameMode {
    Normal,
    StreetBrawl,
    Sandbox,
    ExploreNyc,
    Other,
}

/// The local player's own party and queue. Counts and modes only: no names, ids or invites.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct PartyFacts {
    pub size: u32,
    pub queueing: bool,
    pub queued_secs: Option<u64>,
    /// The mode the party asked for. Only set while queueing.
    pub match_mode: Option<MatchMode>,
    pub game_mode: Option<GameMode>,
    /// Bot difficulty of a private bot match. Only set while queueing.
    pub bot_difficulty: Option<u32>,
}

/// Street Brawl round and team scores; only set while the game mode is Street Brawl.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct StreetBrawlFacts {
    pub round: Option<u32>,
    pub amber: Option<u32>,
    pub sapphire: Option<u32>,
}

/// Game facts safe to hand to presence code: no names, steam ids or other players. The match id is the one
/// sensitive value; presence code must only show it where the user asked for it.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct LiveFacts {
    /// `Other` while on an offline map (Sandbox, Explore NYC); `game_mode` then names the map.
    pub context: Context,
    pub phase: Option<Phase>,
    pub perspective: Perspective,
    pub match_mode: Option<MatchMode>,
    pub game_mode: Option<GameMode>,
    pub hero_id: Option<u32>,
    pub match_time_secs: Option<f32>,
    pub paused: bool,
    /// The reader noticed the game changed under it; the other fields may be wrong.
    pub drift: bool,
    pub local_won: Option<bool>,
    pub kills: Option<u32>,
    pub deaths: Option<u32>,
    pub assists: Option<u32>,
    pub souls: Option<u32>,
    /// `tier * 10 + subrank` of the player shown; 0 or `None` means unranked.
    pub rank: Option<u32>,
    pub street_brawl: Option<StreetBrawlFacts>,
    /// Sensitive: lets anyone who sees it look the match up. Only a user-typed template may render it.
    pub match_id: Option<u64>,
    /// `None` when the party could not be read; a solo player reads as a party of one.
    pub party: Option<PartyFacts>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    Amber,
    Sapphire,
}

/// One scoreboard row. Only what the in-game scoreboard shows; never items, modifiers, positions or stat breakdowns.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct BoardPlayer {
    /// The lobby slot, stable for the whole match.
    pub key: u32,
    pub name: Option<String>,
    /// SteamID64; `None` for bots and unread rows.
    pub steam_id: Option<u64>,
    pub hero_id: Option<u32>,
    /// `tier * 10 + subrank`, raw as the game stores it.
    pub rank: Option<u32>,
    pub souls: Option<u32>,
    pub kills: Option<u32>,
    pub deaths: Option<u32>,
    pub assists: Option<u32>,
    pub hero_damage: Option<u32>,
    pub objective_damage: Option<u32>,
    pub healing: Option<u32>,
    pub self_healing: Option<u32>,
    pub is_you: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BoardTeam {
    pub side: Side,
    pub souls: u32,
    pub players: Vec<BoardPlayer>,
}

/// Both teams as the scoreboard lists them. Empty when no player rows are loaded.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Board {
    /// The side of the player shown: yourself when playing, the followed player when spectating.
    pub your_side: Option<Side>,
    pub teams: Vec<BoardTeam>,
}
