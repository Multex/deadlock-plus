use std::collections::HashSet;

use deadlock_reader::snapshot::{Context as RContext, LiveSnapshot, Perspective as RPerspective, PlayerRow};
use deadlock_reader::{GameMode as RGameMode, GameState, MatchMode as RMatchMode, Team};
use deadlock_walker::QueueRequest;

use crate::queue::QueueState;
use crate::{
    Board, BoardPlayer, BoardTeam, Context, GameMode, LiveFacts, MatchMode, Perspective, Phase, Side, StreetBrawlFacts,
};

pub fn from_snapshot(snap: &LiveSnapshot) -> LiveFacts {
    let perspective = match snap.perspective {
        RPerspective::Unknown => Perspective::Unknown,
        RPerspective::Playing => Perspective::Playing,
        RPerspective::Spectating => Perspective::Spectating,
    };
    let phase = snap.game_state.and_then(phase);
    let me = match perspective {
        Perspective::Playing => snap.local_player(),
        Perspective::Spectating => snap.observed_player(),
        Perspective::Unknown => None,
    };
    let local_won = match (phase, perspective, snap.winning_team, me.and_then(|p| p.team)) {
        (Some(Phase::PostGame), Perspective::Playing, Some(winner), Some(mine)) => Some(winner == mine),
        _ => None,
    };
    LiveFacts {
        context: match snap.context {
            RContext::Other | RContext::Sandbox | RContext::ExploreNyc => Context::Other,
            // Hideout entities stay loaded while spectating a match from the hideout, so the
            // reader's context says Hideout. A match id is only set inside a real match.
            RContext::Hideout if snap.match_id.is_some() => Context::Match,
            RContext::Hideout => Context::Hideout,
            RContext::Match => Context::Match,
            _ => Context::Other,
        },
        phase,
        perspective,
        match_mode: effective_match_mode(snap),
        game_mode: offline_game_mode(snap.context).or_else(|| snap.game_mode.and_then(game_mode)),
        hero_id: me.and_then(|p| p.hero_id).filter(|h| h.is_some()).map(|h| h.get()),
        match_time_secs: snap.timers.match_time,
        paused: snap.paused.unwrap_or(false),
        drift: !snap.drift.is_empty(),
        local_won,
        kills: me.and_then(|p| p.kills),
        deaths: me.and_then(|p| p.deaths),
        assists: me.and_then(|p| p.assists),
        souls: me.and_then(|p| p.net_worth),
        rank: me.and_then(|p| p.packed_rank),
        street_brawl: snap.street_brawl.as_ref().filter(|_| snap.is_street_brawl()).map(|b| StreetBrawlFacts {
            // The game counts rounds from zero; players see round 1 first.
            round: b.round.and_then(|n| u32::try_from(n).ok()).map(|n| n + 1),
            amber: b.amber_score.and_then(|n| u32::try_from(n).ok()),
            sapphire: b.sapphire_score.and_then(|n| u32::try_from(n).ok()),
        }),
        match_id: snap.match_id,
        party: None,
    }
}

/// A private lobby holding only bots besides the local player is a practice match against bots; the game
/// reports it as a private lobby.
fn effective_match_mode(snap: &LiveSnapshot) -> Option<MatchMode> {
    let mode = snap.match_mode.and_then(match_mode);
    if mode != Some(MatchMode::PrivateLobby) {
        return mode;
    }
    let mut others = snap.scoreboard().filter(|p| p.is_local != Some(true)).peekable();
    if others.peek().is_some() && others.all(|p| p.is_bot) {
        return Some(MatchMode::CoopBot);
    }
    mode
}

fn offline_game_mode(context: RContext) -> Option<GameMode> {
    match context {
        RContext::Sandbox => Some(GameMode::Sandbox),
        RContext::ExploreNyc => Some(GameMode::ExploreNyc),
        _ => None,
    }
}

/// The lobby slot when no earlier row holds it, else a value derived from the controller address. The game can report
/// one slot on two playing controllers, and the frontend keys rows and hero-swap tracking by this value.
fn unique_key(taken: &mut HashSet<u32>, p: &PlayerRow) -> u32 {
    let mut key = p.slot.filter(|s| !taken.contains(s)).unwrap_or(p.controller as u32);
    while !taken.insert(key) {
        key = key.wrapping_add(1);
    }
    key
}

pub fn board_from_snapshot(snap: &LiveSnapshot) -> Board {
    let perspective = match snap.perspective {
        RPerspective::Playing => Some(true),
        RPerspective::Spectating => Some(false),
        RPerspective::Unknown => None,
    };
    let is_you = |p: &PlayerRow| match perspective {
        Some(true) => p.is_local == Some(true),
        Some(false) => p.is_observed,
        None => false,
    };
    let mut your_side = None;
    let mut teams = Vec::new();
    let mut taken = HashSet::new();
    for (team, side) in [(Team::AMBER, Side::Amber), (Team::SAPPHIRE, Side::Sapphire)] {
        let mut rows: Vec<&PlayerRow> = snap.scoreboard().filter(|p| p.team == Some(team)).collect();
        if rows.is_empty() {
            continue;
        }
        rows.sort_by_key(|p| p.slot.unwrap_or(u32::MAX));
        let players: Vec<BoardPlayer> = rows
            .iter()
            .map(|p| BoardPlayer {
                key: unique_key(&mut taken, p),
                name: p.name.clone(),
                steam_id: p.steam_id.filter(|id| *id != 0),
                hero_id: p.hero_id.filter(|h| h.is_some()).map(|h| h.get()),
                rank: p.packed_rank,
                souls: p.net_worth,
                kills: p.kills,
                deaths: p.deaths,
                assists: p.assists,
                hero_damage: p.hero_damage,
                objective_damage: p.objective_damage,
                healing: p.healing,
                self_healing: p.self_healing,
                is_you: is_you(p),
            })
            .collect();
        if players.iter().any(|p| p.is_you) {
            your_side = Some(side);
        }
        let souls = snap
            .teams
            .iter()
            .find(|t| t.team == team)
            .map_or_else(|| players.iter().filter_map(|p| p.souls).sum(), |t| t.souls);
        teams.push(BoardTeam { side, souls, players });
    }
    Board { your_side, teams }
}

/// The party size from the hideout scoreboard, which holds the party's humans plus filler bots. `None` anywhere else:
/// a match scoreboard lists everyone in the match. Unread rows can undercount, but the player is always in the party.
pub fn hideout_party_size(context: Context, board: &Board) -> Option<u32> {
    if context != Context::Hideout {
        return None;
    }
    let humans = board.teams.iter().flat_map(|t| &t.players).filter(|p| p.steam_id.is_some()).count();
    Some(humans.max(1) as u32)
}

/// The queue state from the client's search flag and, while searching, the request that started it. The client
/// resets the request words the moment the search ends, so a read that races the end shows idle values that
/// map to unknown.
pub(crate) fn queue_state(queueing: bool, request: Option<QueueRequest>) -> QueueState {
    if !queueing {
        return QueueState::default();
    }
    let Some(request) = request else { return QueueState::searching() };
    QueueState {
        queueing: true,
        match_mode: match_mode(RMatchMode::from_raw(request.match_mode)),
        game_mode: game_mode(RGameMode::from_raw(request.game_mode)),
        bot_difficulty: Some(request.bot_difficulty).filter(|d| *d > 0),
        ..QueueState::default()
    }
}

fn phase(state: GameState) -> Option<Phase> {
    match state {
        GameState::MatchIntro => Some(Phase::MatchIntro),
        GameState::WaitForMapToLoad => Some(Phase::Loading),
        GameState::PreGameWait => Some(Phase::PreGame),
        GameState::GameInProgress => Some(Phase::InProgress),
        s if s.is_over() => Some(Phase::PostGame),
        _ => None,
    }
}

fn match_mode(mode: RMatchMode) -> Option<MatchMode> {
    Some(match mode {
        RMatchMode::Invalid => return None,
        RMatchMode::Unranked => MatchMode::Unranked,
        RMatchMode::Ranked => MatchMode::Ranked,
        RMatchMode::PrivateLobby => MatchMode::PrivateLobby,
        RMatchMode::CoopBot => MatchMode::CoopBot,
        RMatchMode::Tutorial => MatchMode::Tutorial,
        _ => MatchMode::Other,
    })
}

fn game_mode(mode: RGameMode) -> Option<GameMode> {
    Some(match mode {
        RGameMode::Invalid => return None,
        RGameMode::Normal => GameMode::Normal,
        RGameMode::StreetBrawl => GameMode::StreetBrawl,
        RGameMode::Sandbox => GameMode::Sandbox,
        RGameMode::ExploreNyc => GameMode::ExploreNyc,
        _ => GameMode::Other,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Context, GameMode, MatchMode, Perspective, Phase};
    use deadlock_reader::timers::Timers;
    use deadlock_reader::{Drift, HeroId};

    fn row(team: Team, hero: u32, local: bool, observed: bool) -> PlayerRow {
        PlayerRow {
            team: Some(team),
            is_spectator: team == Team::SPECTATOR,
            is_local: Some(local),
            is_observed: observed,
            hero_id: Some(HeroId(hero)),
            ..Default::default()
        }
    }

    fn playing() -> LiveSnapshot {
        LiveSnapshot {
            context: RContext::Match,
            perspective: RPerspective::Playing,
            game_state: Some(GameState::GameInProgress),
            players: vec![row(Team::SAPPHIRE, 9, false, false), row(Team::AMBER, 15, true, false)],
            ..Default::default()
        }
    }

    #[test]
    fn empty_snapshot_maps_to_defaults() {
        let f = from_snapshot(&LiveSnapshot::default());
        assert_eq!(f, LiveFacts::default());
        assert_eq!(f.context, Context::Other);
        assert_eq!(f.perspective, Perspective::Unknown);
    }

    #[test]
    fn context_and_perspective_map() {
        let mut s = playing();
        let f = from_snapshot(&s);
        assert_eq!((f.context, f.perspective), (Context::Match, Perspective::Playing));
        s.context = RContext::Hideout;
        s.perspective = RPerspective::Spectating;
        let f = from_snapshot(&s);
        assert_eq!((f.context, f.perspective), (Context::Hideout, Perspective::Spectating));
    }

    #[test]
    fn hideout_entities_with_a_match_id_still_mean_a_match() {
        let mut s = playing();
        s.context = RContext::Hideout;
        s.perspective = RPerspective::Spectating;
        s.match_id = Some(111_074_434);
        assert_eq!(from_snapshot(&s).context, Context::Match);
        s.match_id = None;
        assert_eq!(from_snapshot(&s).context, Context::Hideout);
    }

    #[test]
    fn offline_maps_read_as_other_with_their_game_mode() {
        for (ctx, want) in [(RContext::Sandbox, GameMode::Sandbox), (RContext::ExploreNyc, GameMode::ExploreNyc)] {
            let f = from_snapshot(&LiveSnapshot { context: ctx, ..Default::default() });
            assert_eq!((f.context, f.game_mode), (Context::Other, Some(want)), "{ctx:?}");
        }
    }

    fn bot_match(others_are_bots: &[bool]) -> LiveSnapshot {
        let mut s = playing();
        s.match_mode = Some(RMatchMode::PrivateLobby);
        for &bot in others_are_bots {
            let mut p = row(Team::SAPPHIRE, 9, false, false);
            p.is_bot = bot;
            s.players.push(p);
        }
        s.players.remove(0);
        s
    }

    #[test]
    fn a_private_lobby_of_only_bots_is_a_bot_match() {
        assert_eq!(from_snapshot(&bot_match(&[true, true])).match_mode, Some(MatchMode::CoopBot));
    }

    #[test]
    fn a_private_lobby_with_a_human_stays_private() {
        assert_eq!(from_snapshot(&bot_match(&[true, false])).match_mode, Some(MatchMode::PrivateLobby));
        assert_eq!(from_snapshot(&bot_match(&[])).match_mode, Some(MatchMode::PrivateLobby));
    }

    #[test]
    fn bots_do_not_change_other_match_modes() {
        let mut s = bot_match(&[true]);
        s.match_mode = Some(RMatchMode::Unranked);
        assert_eq!(from_snapshot(&s).match_mode, Some(MatchMode::Unranked));
    }

    #[test]
    fn game_states_map_to_phases() {
        for (state, want) in [
            (GameState::HeroSelection, None),
            (GameState::MatchIntro, Some(Phase::MatchIntro)),
            (GameState::WaitForMapToLoad, Some(Phase::Loading)),
            (GameState::PreGameWait, Some(Phase::PreGame)),
            (GameState::GameInProgress, Some(Phase::InProgress)),
            (GameState::PostGame, Some(Phase::PostGame)),
            (GameState::PostGamePlayOfTheGame, Some(Phase::PostGame)),
            (GameState::Abandoned, Some(Phase::PostGame)),
            (GameState::End, Some(Phase::PostGame)),
            (GameState::Invalid, None),
            (GameState::Init, None),
            (GameState::WaitingForPlayersToJoin, None),
            (GameState::Unknown(99), None),
        ] {
            let s = LiveSnapshot { game_state: Some(state), ..Default::default() };
            assert_eq!(from_snapshot(&s).phase, want, "{state:?}");
        }
        assert_eq!(from_snapshot(&LiveSnapshot::default()).phase, None);
    }

    #[test]
    fn match_modes_map() {
        for (mode, want) in [
            (RMatchMode::Invalid, None),
            (RMatchMode::Unranked, Some(MatchMode::Unranked)),
            (RMatchMode::Ranked, Some(MatchMode::Ranked)),
            (RMatchMode::PrivateLobby, Some(MatchMode::PrivateLobby)),
            (RMatchMode::CoopBot, Some(MatchMode::CoopBot)),
            (RMatchMode::HeroLabs, Some(MatchMode::Other)),
            (RMatchMode::Tutorial, Some(MatchMode::Tutorial)),
            (RMatchMode::ServerTest, Some(MatchMode::Other)),
            (RMatchMode::NewPlayerPlacement, Some(MatchMode::Other)),
            (RMatchMode::Unknown(77), Some(MatchMode::Other)),
        ] {
            let s = LiveSnapshot { match_mode: Some(mode), ..Default::default() };
            assert_eq!(from_snapshot(&s).match_mode, want, "{mode:?}");
        }
    }

    #[test]
    fn game_modes_map() {
        for (mode, want) in [
            (RGameMode::Invalid, None),
            (RGameMode::Normal, Some(GameMode::Normal)),
            (RGameMode::StreetBrawl, Some(GameMode::StreetBrawl)),
            (RGameMode::Sandbox, Some(GameMode::Sandbox)),
            (RGameMode::ExploreNyc, Some(GameMode::ExploreNyc)),
            (RGameMode::OneVsOneTest, Some(GameMode::Other)),
            (RGameMode::Internal, Some(GameMode::Other)),
            (RGameMode::Unknown(42), Some(GameMode::Other)),
        ] {
            let s = LiveSnapshot { game_mode: Some(mode), ..Default::default() };
            assert_eq!(from_snapshot(&s).game_mode, want, "{mode:?}");
        }
    }

    #[test]
    fn hero_comes_from_the_local_row_when_playing() {
        assert_eq!(from_snapshot(&playing()).hero_id, Some(15));
    }

    #[test]
    fn hero_comes_from_the_observed_row_when_spectating() {
        let s = LiveSnapshot {
            perspective: RPerspective::Spectating,
            players: vec![
                row(Team::SPECTATOR, 0, true, false),
                row(Team::AMBER, 4, false, true),
                row(Team::SAPPHIRE, 9, false, false),
            ],
            ..Default::default()
        };
        assert_eq!(from_snapshot(&s).hero_id, Some(4));
    }

    #[test]
    fn spectating_never_reports_the_local_controller_hero() {
        let s = LiveSnapshot {
            perspective: RPerspective::Spectating,
            players: vec![row(Team::SPECTATOR, 7, true, false)],
            ..Default::default()
        };
        assert_eq!(from_snapshot(&s).hero_id, None);
    }

    #[test]
    fn an_unpicked_or_unidentified_hero_is_none() {
        let mut s = playing();
        s.players[1].hero_id = Some(HeroId::NONE);
        assert_eq!(from_snapshot(&s).hero_id, None);
        s.players[1].hero_id = None;
        assert_eq!(from_snapshot(&s).hero_id, None);
        s.players.clear();
        assert_eq!(from_snapshot(&s).hero_id, None);
        s.perspective = RPerspective::Unknown;
        assert_eq!(from_snapshot(&s).hero_id, None);
    }

    #[test]
    fn match_time_and_pause_map() {
        let s = LiveSnapshot {
            timers: Timers { match_time: Some(312.5), ..Default::default() },
            paused: Some(true),
            ..Default::default()
        };
        let f = from_snapshot(&s);
        assert_eq!(f.match_time_secs, Some(312.5));
        assert!(f.paused);
        let f = from_snapshot(&LiveSnapshot::default());
        assert_eq!(f.match_time_secs, None);
        assert!(!f.paused);
    }

    #[test]
    fn drift_is_set_only_when_the_list_is_non_empty() {
        let mut s = playing();
        assert!(!from_snapshot(&s).drift);
        s.drift.push(Drift::EnumMismatch {
            class: "C".into(),
            field: "f".into(),
            raw: 1,
            schema: "a".into(),
            baked: "b".into(),
        });
        assert!(from_snapshot(&s).drift);
    }

    fn finished(local: Team, winner: Option<Team>, state: GameState) -> LiveSnapshot {
        let other = if local == Team::AMBER { Team::SAPPHIRE } else { Team::AMBER };
        LiveSnapshot {
            perspective: RPerspective::Playing,
            game_state: Some(state),
            winning_team: winner,
            players: vec![row(other, 9, false, false), row(local, 15, true, false)],
            ..Default::default()
        }
    }

    #[test]
    fn local_won_compares_the_winner_with_the_local_team_after_the_match() {
        let won = from_snapshot(&finished(Team::AMBER, Some(Team::AMBER), GameState::PostGame));
        assert_eq!(won.local_won, Some(true));
        let lost = from_snapshot(&finished(Team::AMBER, Some(Team::SAPPHIRE), GameState::PostGame));
        assert_eq!(lost.local_won, Some(false));
        let sapphire = from_snapshot(&finished(Team::SAPPHIRE, Some(Team::SAPPHIRE), GameState::PostGame));
        assert_eq!(sapphire.local_won, Some(true));
    }

    #[test]
    fn local_won_is_none_before_post_game_or_without_a_winner() {
        let early = finished(Team::AMBER, Some(Team::AMBER), GameState::GameInProgress);
        assert_eq!(from_snapshot(&early).local_won, None);
        let undecided = finished(Team::AMBER, None, GameState::PostGame);
        assert_eq!(from_snapshot(&undecided).local_won, None);
    }

    #[test]
    fn local_won_is_none_when_spectating() {
        let mut s = finished(Team::AMBER, Some(Team::AMBER), GameState::PostGame);
        s.perspective = RPerspective::Spectating;
        assert_eq!(from_snapshot(&s).local_won, None);
    }

    #[test]
    fn a_searching_client_maps_its_request() {
        let street_brawl = QueueRequest { match_mode: 1, game_mode: 4, bot_difficulty: 0 };
        let state = queue_state(true, Some(street_brawl));
        assert_eq!(
            state,
            QueueState {
                queueing: true,
                match_mode: Some(MatchMode::Unranked),
                game_mode: Some(GameMode::StreetBrawl),
                bot_difficulty: None,
                ..QueueState::default()
            }
        );
        let bots = queue_state(true, Some(QueueRequest { match_mode: 2, game_mode: 1, bot_difficulty: 2 }));
        assert_eq!((bots.match_mode, bots.bot_difficulty), (Some(MatchMode::PrivateLobby), Some(2)));
    }

    #[test]
    fn an_idle_client_has_no_request() {
        let idle = QueueRequest { match_mode: 0, game_mode: 1, bot_difficulty: 0 };
        assert_eq!(queue_state(false, Some(idle)), QueueState::default());
    }

    #[test]
    fn a_search_whose_request_is_missing_or_reset_has_no_mode() {
        assert_eq!(queue_state(true, None), QueueState::searching());
        let reset = queue_state(true, Some(QueueRequest { match_mode: 0, game_mode: 0, bot_difficulty: 0 }));
        assert_eq!((reset.match_mode, reset.game_mode), (None, None));
    }

    #[test]
    fn unknown_request_numbers_collapse_to_other() {
        let state = queue_state(true, Some(QueueRequest { match_mode: 77, game_mode: 88, bot_difficulty: 9 }));
        assert_eq!((state.match_mode, state.game_mode), (Some(MatchMode::Other), Some(GameMode::Other)));
    }

    #[test]
    fn score_comes_from_the_local_row() {
        let mut s = playing();
        s.players[1].kills = Some(12);
        s.players[1].deaths = Some(3);
        s.players[1].assists = Some(8);
        s.players[1].net_worth = Some(24_100);
        s.players[0].kills = Some(99);
        let f = from_snapshot(&s);
        assert_eq!((f.kills, f.deaths, f.assists, f.souls), (Some(12), Some(3), Some(8), Some(24_100)));
    }

    fn board_of(rows: &[Option<u64>]) -> Board {
        let players = rows
            .iter()
            .enumerate()
            .map(|(i, steam_id)| BoardPlayer {
                key: i as u32,
                name: None,
                steam_id: *steam_id,
                hero_id: None,
                rank: None,
                souls: None,
                kills: None,
                deaths: None,
                assists: None,
                hero_damage: None,
                objective_damage: None,
                healing: None,
                self_healing: None,
                is_you: i == 0,
            })
            .collect();
        Board { your_side: None, teams: vec![BoardTeam { side: Side::Amber, souls: 0, players }] }
    }

    #[test]
    fn the_hideout_party_is_the_human_rows() {
        let board = board_of(&[Some(1), None, None, Some(2)]);
        assert_eq!(hideout_party_size(Context::Hideout, &board), Some(2));
    }

    #[test]
    fn a_solo_hideout_is_a_party_of_one() {
        assert_eq!(hideout_party_size(Context::Hideout, &board_of(&[Some(1), None, None])), Some(1));
    }

    #[test]
    fn an_unread_hideout_still_counts_the_player() {
        assert_eq!(hideout_party_size(Context::Hideout, &board_of(&[None, None])), Some(1));
        assert_eq!(hideout_party_size(Context::Hideout, &board_of(&[])), Some(1));
    }

    #[test]
    fn only_the_hideout_says_anything_about_the_party() {
        let board = board_of(&[Some(1), Some(2), Some(3)]);
        assert_eq!(hideout_party_size(Context::Match, &board), None);
        assert_eq!(hideout_party_size(Context::Other, &board), None);
    }

    #[test]
    fn match_id_is_carried_through_in_a_match_and_from_a_hideout_spectate() {
        let mut s = playing();
        s.match_id = Some(111_074_434);
        assert_eq!(from_snapshot(&s).match_id, Some(111_074_434));
        s.context = RContext::Hideout;
        s.perspective = RPerspective::Spectating;
        assert_eq!(from_snapshot(&s).match_id, Some(111_074_434));
        s.match_id = None;
        assert_eq!(from_snapshot(&s).match_id, None);
    }

    #[test]
    fn rank_is_the_packed_badge_of_the_player_shown() {
        let mut s = playing();
        s.players[1].packed_rank = Some(93);
        assert_eq!(from_snapshot(&s).rank, Some(93));
        s.players[1].packed_rank = None;
        assert_eq!(from_snapshot(&s).rank, None);
    }

    fn brawl(round: Option<i32>, amber: Option<i32>, sapphire: Option<i32>) -> deadlock_reader::snapshot::StreetBrawl {
        deadlock_reader::snapshot::StreetBrawl {
            round,
            amber_score: amber,
            sapphire_score: sapphire,
            ..Default::default()
        }
    }

    #[test]
    fn street_brawl_round_and_scores_are_read_in_a_street_brawl() {
        let mut s = playing();
        s.game_mode = Some(RGameMode::StreetBrawl);
        s.street_brawl = Some(brawl(Some(2), Some(2), Some(1)));
        let b = from_snapshot(&s).street_brawl.unwrap();
        assert_eq!((b.round, b.amber, b.sapphire), (Some(3), Some(2), Some(1)));
    }

    #[test]
    fn the_games_zero_based_round_is_shown_one_based() {
        let mut s = playing();
        s.game_mode = Some(RGameMode::StreetBrawl);
        s.street_brawl = Some(brawl(Some(0), None, None));
        assert_eq!(from_snapshot(&s).street_brawl.unwrap().round, Some(1));
    }

    #[test]
    fn a_zeroed_controller_outside_street_brawl_is_not_a_street_brawl() {
        let mut s = playing();
        s.game_mode = Some(RGameMode::Normal);
        s.street_brawl = Some(brawl(Some(0), Some(0), Some(0)));
        assert_eq!(from_snapshot(&s).street_brawl, None);
        s.game_mode = Some(RGameMode::StreetBrawl);
        s.street_brawl = None;
        assert_eq!(from_snapshot(&s).street_brawl, None);
    }

    #[test]
    fn negative_street_brawl_numbers_are_dropped() {
        let mut s = playing();
        s.game_mode = Some(RGameMode::StreetBrawl);
        s.street_brawl = Some(brawl(Some(-1), Some(2), None));
        let b = from_snapshot(&s).street_brawl.unwrap();
        assert_eq!((b.round, b.amber, b.sapphire), (None, Some(2), None));
    }

    #[test]
    fn match_id_keeps_the_full_u64_width() {
        let s = LiveSnapshot { match_id: Some(u64::from(u32::MAX) + 5), ..Default::default() };
        assert_eq!(from_snapshot(&s).match_id, Some(u64::from(u32::MAX) + 5));
    }

    #[test]
    fn score_is_none_without_a_player_row() {
        let f = from_snapshot(&LiveSnapshot::default());
        assert_eq!((f.kills, f.deaths, f.assists, f.souls), (None, None, None, None));
    }

    fn full_row(team: Team, slot: u32, name: &str, local: bool, observed: bool) -> PlayerRow {
        PlayerRow {
            slot: Some(slot),
            name: Some(name.into()),
            net_worth: Some(1000 * slot),
            kills: Some(slot),
            deaths: Some(1),
            assists: Some(2),
            hero_damage: Some(300),
            objective_damage: Some(40),
            healing: Some(5),
            self_healing: Some(7),
            packed_rank: Some(53),
            steam_id: Some(76_561_198_000_000_000 + u64::from(slot)),
            ..row(team, 10 + slot, local, observed)
        }
    }

    fn lobby() -> LiveSnapshot {
        LiveSnapshot {
            context: RContext::Match,
            perspective: RPerspective::Playing,
            players: vec![
                full_row(Team::SAPPHIRE, 7, "Enemy", false, false),
                full_row(Team::AMBER, 2, "Mate", false, false),
                full_row(Team::AMBER, 1, "Me", true, false),
                full_row(Team::SPECTATOR, 12, "Watcher", false, false),
            ],
            ..Default::default()
        }
    }

    #[test]
    fn board_lists_both_teams_without_spectators_ordered_by_slot() {
        let b = board_from_snapshot(&lobby());
        assert_eq!(b.teams.iter().map(|t| t.side).collect::<Vec<_>>(), [Side::Amber, Side::Sapphire]);
        let keys: Vec<_> = b.teams[0].players.iter().map(|p| p.key).collect();
        assert_eq!(keys, [1, 2]);
        assert_eq!(b.teams[1].players.len(), 1);
    }

    #[test]
    fn board_keys_stay_unique_when_the_game_repeats_a_lobby_slot() {
        let mut s = lobby();
        s.players.push(PlayerRow { controller: 0x2000, ..full_row(Team::AMBER, 2, "Twin", false, false) });
        s.players.push(PlayerRow { controller: 0x3000, ..full_row(Team::SAPPHIRE, 1, "Cross", false, false) });
        s.players.push(PlayerRow { controller: 2, slot: None, ..full_row(Team::SAPPHIRE, 9, "Unread", false, false) });
        let b = board_from_snapshot(&s);
        let keys: Vec<u32> = b.teams.iter().flat_map(|t| &t.players).map(|p| p.key).collect();
        let mut unique = keys.clone();
        unique.sort_unstable();
        unique.dedup();
        assert_eq!(keys.len(), 6);
        assert_eq!(unique.len(), keys.len(), "duplicate keys in {keys:?}");
        let amber: Vec<_> = b.teams[0].players.iter().map(|p| (p.key, p.name.as_deref())).collect();
        assert_eq!(amber[..2], [(1, Some("Me")), (2, Some("Mate"))]);
    }

    #[test]
    fn board_maps_a_row() {
        let b = board_from_snapshot(&lobby());
        let p = &b.teams[1].players[0];
        assert_eq!(
            *p,
            BoardPlayer {
                key: 7,
                name: Some("Enemy".into()),
                hero_id: Some(17),
                steam_id: Some(76_561_198_000_000_007),
                rank: Some(53),
                souls: Some(7000),
                kills: Some(7),
                deaths: Some(1),
                assists: Some(2),
                hero_damage: Some(300),
                objective_damage: Some(40),
                healing: Some(5),
                self_healing: Some(7),
                is_you: false,
            }
        );
    }

    #[test]
    fn board_drops_the_zero_steam_id_of_a_bot() {
        let mut s = lobby();
        s.players[0].steam_id = Some(0);
        s.players[1].steam_id = None;
        let b = board_from_snapshot(&s);
        assert_eq!(b.teams[1].players[0].steam_id, None);
        assert_eq!(b.teams[0].players[1].steam_id, None);
    }

    #[test]
    fn board_marks_the_local_player_and_side_when_playing() {
        let b = board_from_snapshot(&lobby());
        assert_eq!(b.your_side, Some(Side::Amber));
        let you: Vec<_> = b.teams.iter().flat_map(|t| &t.players).filter(|p| p.is_you).map(|p| p.key).collect();
        assert_eq!(you, [1]);
    }

    #[test]
    fn board_follows_the_observed_player_when_spectating() {
        let mut s = lobby();
        s.perspective = RPerspective::Spectating;
        s.players[0].is_observed = true;
        s.players[2].is_local = Some(false);
        let b = board_from_snapshot(&s);
        assert_eq!(b.your_side, Some(Side::Sapphire));
        let you: Vec<_> = b.teams.iter().flat_map(|t| &t.players).filter(|p| p.is_you).map(|p| p.key).collect();
        assert_eq!(you, [7]);
    }

    #[test]
    fn board_has_no_you_when_the_perspective_is_unknown() {
        let mut s = lobby();
        s.perspective = RPerspective::Unknown;
        let b = board_from_snapshot(&s);
        assert_eq!(b.your_side, None);
        assert!(b.teams.iter().flat_map(|t| &t.players).all(|p| !p.is_you));
    }

    #[test]
    fn team_souls_prefer_the_game_totals_and_fall_back_to_the_row_sum() {
        let mut s = lobby();
        let b = board_from_snapshot(&s);
        assert_eq!(b.teams[0].souls, 3000);
        s.teams = vec![deadlock_reader::snapshot::TeamStats { team: Team::AMBER, souls: 9999, ..Default::default() }];
        let b = board_from_snapshot(&s);
        assert_eq!((b.teams[0].souls, b.teams[1].souls), (9999, 7000));
    }

    #[test]
    fn unread_stats_stay_none_and_an_empty_lobby_has_no_teams() {
        let mut s = lobby();
        s.players[1].net_worth = None;
        s.players[1].packed_rank = None;
        let b = board_from_snapshot(&s);
        assert_eq!(b.teams[0].players[1].souls, None);
        assert_eq!(b.teams[0].players[1].rank, None);
        assert_eq!(board_from_snapshot(&LiveSnapshot::default()), Board::default());
    }
}
