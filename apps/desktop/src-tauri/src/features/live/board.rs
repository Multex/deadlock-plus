//! The scoreboard payload of the live page. Only scoreboard fields: no items, modifiers, positions or stat
//! breakdowns, and nothing the in-game scoreboard would not show. Souls per minute and the KDA ratio are the
//! frontend's job.

use dp_live::{Board, BoardPlayer, Context, GameMode, LiveFacts, MatchMode, Perspective, Side};
use serde::Serialize;
use ts_rs::TS;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum LiveSide {
    Amber,
    Sapphire,
}

#[derive(Serialize, Clone, Copy, Debug, Default, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum LivePerspective {
    #[default]
    Unknown,
    Playing,
    Spectating,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum LiveMatchMode {
    Unranked,
    Ranked,
    PrivateLobby,
    CoopBot,
    Tutorial,
    Other,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum LiveGameMode {
    Normal,
    StreetBrawl,
    Sandbox,
    ExploreNyc,
    Other,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct LivePlayer {
    /// Unique within the match: the lobby slot, unless another row already holds it. Rows are keyed and tracked by it.
    pub key: u32,
    pub side: LiveSide,
    pub name: Option<String>,
    /// SteamID64 as a string: it exceeds the exact integer range of JavaScript numbers.
    pub steam_id: Option<String>,
    pub hero_id: Option<u32>,
    /// `tier * 10 + subrank` as the game stores it; 0 or `null` means unranked.
    pub rank: Option<u32>,
    /// Net worth.
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

#[derive(Serialize, Clone, Debug, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct LiveTeam {
    pub side: LiveSide,
    /// Total souls of the team.
    pub souls: u32,
    /// Ordered by lobby slot.
    pub players: Vec<LivePlayer>,
}

/// The local party while it is queueing. Counts and times only.
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct LiveQueue {
    pub party_size: u32,
    pub queued_secs: Option<u32>,
    pub match_mode: Option<LiveMatchMode>,
    pub game_mode: Option<LiveGameMode>,
}

/// Everything the match section shows. `teams` is empty and `queue` is `null` when there is nothing to show.
#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct LiveMatch {
    /// Whole seconds of the match clock, pauses removed.
    pub clock_secs: Option<u32>,
    pub paused: bool,
    pub match_mode: Option<LiveMatchMode>,
    pub game_mode: Option<LiveGameMode>,
    pub perspective: LivePerspective,
    /// The team of the player shown: yours when playing, the followed player's when spectating.
    pub your_side: Option<LiveSide>,
    pub teams: Vec<LiveTeam>,
    pub queue: Option<LiveQueue>,
}

impl LiveMatch {
    pub fn from_read(facts: &LiveFacts, board: &Board) -> Self {
        let perspective = match facts.perspective {
            Perspective::Unknown => LivePerspective::Unknown,
            Perspective::Playing => LivePerspective::Playing,
            Perspective::Spectating => LivePerspective::Spectating,
        };
        if facts.context != Context::Match {
            let queue = facts.party.filter(|p| p.queueing).map(|p| LiveQueue {
                party_size: p.size,
                queued_secs: p.queued_secs.map(|s| u32::try_from(s).unwrap_or(u32::MAX)),
                match_mode: p.match_mode.map(match_mode),
                game_mode: p.game_mode.map(game_mode),
            });
            return Self { perspective, queue, ..Default::default() };
        }
        let teams = board
            .teams
            .iter()
            .map(|t| {
                let team_side = side(t.side);
                LiveTeam {
                    side: team_side,
                    souls: t.souls,
                    players: t.players.iter().map(|p| player(team_side, p)).collect(),
                }
            })
            .collect();
        Self {
            clock_secs: facts.match_time_secs.map(|t| t.max(0.0) as u32),
            paused: facts.paused,
            match_mode: facts.match_mode.map(match_mode),
            game_mode: facts.game_mode.map(game_mode),
            perspective,
            your_side: board.your_side.map(side),
            teams,
            queue: None,
        }
    }
}

fn side(side: Side) -> LiveSide {
    match side {
        Side::Amber => LiveSide::Amber,
        Side::Sapphire => LiveSide::Sapphire,
    }
}

fn match_mode(mode: MatchMode) -> LiveMatchMode {
    match mode {
        MatchMode::Unranked => LiveMatchMode::Unranked,
        MatchMode::Ranked => LiveMatchMode::Ranked,
        MatchMode::PrivateLobby => LiveMatchMode::PrivateLobby,
        MatchMode::CoopBot => LiveMatchMode::CoopBot,
        MatchMode::Tutorial => LiveMatchMode::Tutorial,
        MatchMode::Other => LiveMatchMode::Other,
    }
}

fn game_mode(mode: GameMode) -> LiveGameMode {
    match mode {
        GameMode::Normal => LiveGameMode::Normal,
        GameMode::StreetBrawl => LiveGameMode::StreetBrawl,
        GameMode::Sandbox => LiveGameMode::Sandbox,
        GameMode::ExploreNyc => LiveGameMode::ExploreNyc,
        GameMode::Other => LiveGameMode::Other,
    }
}

fn player(side_of: LiveSide, p: &BoardPlayer) -> LivePlayer {
    LivePlayer {
        key: p.key,
        side: side_of,
        name: p.name.clone(),
        steam_id: p.steam_id.map(|id| id.to_string()),
        hero_id: p.hero_id,
        rank: p.rank,
        souls: p.souls,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        hero_damage: p.hero_damage,
        objective_damage: p.objective_damage,
        healing: p.healing,
        self_healing: p.self_healing,
        is_you: p.is_you,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dp_live::{BoardTeam, PartyFacts, Phase};

    fn bp(key: u32, you: bool) -> BoardPlayer {
        BoardPlayer {
            key,
            name: Some(format!("P{key}")),
            steam_id: Some(76_561_198_000_000_000 + u64::from(key)),
            hero_id: Some(10 + key),
            rank: Some(53),
            souls: Some(1000),
            kills: Some(1),
            deaths: Some(2),
            assists: Some(3),
            hero_damage: Some(400),
            objective_damage: Some(50),
            healing: None,
            self_healing: Some(9),
            is_you: you,
        }
    }

    fn board() -> Board {
        Board {
            your_side: Some(Side::Amber),
            teams: vec![
                BoardTeam { side: Side::Amber, souls: 5000, players: vec![bp(1, true), bp(2, false)] },
                BoardTeam { side: Side::Sapphire, souls: 4000, players: vec![bp(7, false)] },
            ],
        }
    }

    fn in_match() -> LiveFacts {
        LiveFacts {
            context: Context::Match,
            phase: Some(Phase::InProgress),
            perspective: Perspective::Playing,
            match_mode: Some(MatchMode::Ranked),
            game_mode: Some(GameMode::Normal),
            match_time_secs: Some(754.9),
            paused: true,
            ..Default::default()
        }
    }

    #[test]
    fn a_match_carries_clock_modes_perspective_and_teams() {
        let m = LiveMatch::from_read(&in_match(), &board());
        assert_eq!(m.clock_secs, Some(754));
        assert!(m.paused);
        assert_eq!(m.match_mode, Some(LiveMatchMode::Ranked));
        assert_eq!(m.game_mode, Some(LiveGameMode::Normal));
        assert_eq!(m.perspective, LivePerspective::Playing);
        assert_eq!(m.your_side, Some(LiveSide::Amber));
        assert_eq!(m.queue, None);
        assert_eq!((m.teams[0].souls, m.teams[1].souls), (5000, 4000));
        let p = &m.teams[0].players[0];
        assert_eq!((p.key, p.side, p.is_you, p.hero_id, p.rank), (1, LiveSide::Amber, true, Some(11), Some(53)));
        assert_eq!(p.healing, None);
        assert_eq!(p.self_healing, Some(9));
        assert_eq!(p.steam_id.as_deref(), Some("76561198000000001"));
        assert_eq!(m.teams[1].players[0].side, LiveSide::Sapphire);
    }

    #[test]
    fn a_negative_or_missing_clock_is_clamped_or_none() {
        let mut f = in_match();
        f.match_time_secs = Some(-3.0);
        assert_eq!(LiveMatch::from_read(&f, &board()).clock_secs, Some(0));
        f.match_time_secs = None;
        assert_eq!(LiveMatch::from_read(&f, &board()).clock_secs, None);
    }

    #[test]
    fn outside_a_match_the_clock_modes_and_teams_are_dropped() {
        let mut f = in_match();
        f.context = Context::Hideout;
        let m = LiveMatch::from_read(&f, &board());
        assert_eq!(m, LiveMatch { perspective: LivePerspective::Playing, ..Default::default() });
    }

    #[test]
    fn a_queueing_party_reports_size_time_and_requested_modes() {
        let f = LiveFacts {
            context: Context::Hideout,
            party: Some(PartyFacts {
                size: 3,
                queueing: true,
                queued_secs: Some(41),
                match_mode: Some(MatchMode::Unranked),
                game_mode: Some(GameMode::StreetBrawl),
                ..Default::default()
            }),
            ..Default::default()
        };
        let m = LiveMatch::from_read(&f, &Board::default());
        assert_eq!(
            m.queue,
            Some(LiveQueue {
                party_size: 3,
                queued_secs: Some(41),
                match_mode: Some(LiveMatchMode::Unranked),
                game_mode: Some(LiveGameMode::StreetBrawl),
            })
        );
        let idle = LiveFacts { party: Some(PartyFacts { size: 3, ..Default::default() }), ..f };
        assert_eq!(LiveMatch::from_read(&idle, &Board::default()).queue, None);
    }

    #[test]
    fn spectating_is_reported() {
        let mut f = in_match();
        f.perspective = Perspective::Spectating;
        assert_eq!(LiveMatch::from_read(&f, &board()).perspective, LivePerspective::Spectating);
    }
}
