import type { DeadlockApi, PlayerRank } from "@deadlock-plus/deadlock-api";
import type { LiveMatch } from "@deadlock-plus/ipc-types/LiveMatch";
import type { LiveMatchMode } from "@deadlock-plus/ipc-types/LiveMatchMode";
import type { LivePlayer } from "@deadlock-plus/ipc-types/LivePlayer";
import { steam64ToSteam32 } from "$lib/core/player-links";

export interface BoardRank {
    rank: number | null;
    /** From the player's ranked matches on deadlock-api.com, not from the game. */
    fromHistory: boolean;
}

const LOOKUP_MODES: readonly LiveMatchMode[] = ["unranked", "privateLobby", "other"];
const NO_RANK: BoardRank = { rank: null, fromHistory: false };

export const accountId = (steamId: string | null) => (steamId === null ? null : Number(steam64ToSteam32(steamId)));

export function lobbyAccountIds(match: LiveMatch): number[] {
    const ids = match.teams.flatMap((t) =>
        t.players.flatMap((p) => {
            const id = accountId(p.steamId);
            return id === null ? [] : [id];
        }),
    );
    return [...new Set(ids)].sort((a, b) => a - b);
}

/** The accounts to look up, or none where the game shows every rank itself or there are only bots. */
export function rankLookupIds(match: LiveMatch | null): number[] {
    if (match?.matchMode == null || !LOOKUP_MODES.includes(match.matchMode)) return [];
    return lobbyAccountIds(match);
}

export function badgeMap(rows: readonly PlayerRank[]): Map<number, number> {
    return new Map(rows.filter((r) => r.badge > 0).map((r) => [r.account_id, r.badge]));
}

export function boardRank(player: LivePlayer, badges: ReadonlyMap<number, number>): BoardRank {
    if (player.rank !== null && player.rank > 0) return { rank: player.rank, fromHistory: false };
    const id = accountId(player.steamId);
    const badge = id === null ? undefined : badges.get(id);
    return badge === undefined ? NO_RANK : { rank: badge, fromHistory: true };
}

/** One request per lobby for the session; a failed one is asked again next time. */
export function cachedRankLookup(api: Pick<DeadlockApi, "playerRanks">): DeadlockApi["playerRanks"] {
    const cache = new Map<string, Promise<PlayerRank[]>>();
    return (ids) => {
        const key = ids.join(",");
        const hit = cache.get(key);
        if (hit !== undefined) return hit;
        const pending = api.playerRanks(ids);
        cache.set(key, pending);
        pending.catch(() => {
            if (cache.get(key) === pending) cache.delete(key);
        });
        return pending;
    };
}
