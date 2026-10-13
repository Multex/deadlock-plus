import { type MatchPlayer, type MatchTeam, type MatchDetail } from "../detail";

export interface TeamRoster {
    team: MatchTeam;
    players: MatchPlayer[];
}

export function teamRoster(detail: MatchDetail): TeamRoster[] {
    return detail.teams.map((t) => ({ team: t.team, players: [...t.players].sort((a, b) => a.slot - b.slot) }));
}
