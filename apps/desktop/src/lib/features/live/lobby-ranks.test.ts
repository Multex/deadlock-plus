import { describe, expect, it, vi } from "vitest";
import type { PlayerRank } from "@deadlock-plus/deadlock-api";
import type { LiveMatch } from "@deadlock-plus/ipc-types/LiveMatch";
import type { LivePlayer } from "@deadlock-plus/ipc-types/LivePlayer";
import { badgeMap, boardRank, cachedRankLookup, rankLookupIds } from "./lobby-ranks";

const STEAM64_OFFSET = 76561197960265728n;
const steamId = (accountId: number) => (BigInt(accountId) + STEAM64_OFFSET).toString();

function player(key: number, over: Partial<LivePlayer> = {}): LivePlayer {
    return {
        key,
        side: key % 2 === 0 ? "amber" : "sapphire",
        name: null,
        steamId: steamId(key),
        heroId: 10 + key,
        rank: null,
        souls: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        heroDamage: 0,
        objectiveDamage: 0,
        healing: 0,
        selfHealing: 0,
        isYou: key === 0,
        ...over,
    };
}

function match(matchMode: LiveMatch["matchMode"], players = [0, 3, 1, 2].map((k) => player(k))): LiveMatch {
    return {
        clockSecs: 0,
        paused: false,
        matchMode,
        gameMode: "normal",
        perspective: "playing",
        yourSide: "amber",
        teams: [
            { side: "amber", souls: 0, players: players.filter((p) => p.side === "amber") },
            { side: "sapphire", souls: 0, players: players.filter((p) => p.side === "sapphire") },
        ],
        queue: null,
    };
}

const row = (account_id: number, badge: number): PlayerRank => ({
    account_id,
    badge,
    rank: Math.floor(badge / 10),
    subrank: badge % 10,
    last_match: null,
});

describe("rankLookupIds", () => {
    it("lists the lobby's account ids, sorted, in modes the game shows no ranks for", () => {
        for (const mode of ["unranked", "privateLobby", "other"] as const) {
            expect(rankLookupIds(match(mode)), mode).toEqual([0, 1, 2, 3]);
        }
    });

    it("asks nothing in ranked, where the game shows every rank, or against bots", () => {
        for (const mode of ["ranked", "coopBot", "tutorial"] as const) {
            expect(rankLookupIds(match(mode)), mode).toEqual([]);
        }
        expect(rankLookupIds(null)).toEqual([]);
    });

    it("skips players without a Steam id", () => {
        expect(rankLookupIds(match("unranked", [player(0), player(1, { steamId: null })]))).toEqual([0]);
    });
});

describe("boardRank", () => {
    const badges = badgeMap([row(1, 83), row(2, 0)]);

    it("keeps the rank the game shows", () => {
        expect(boardRank(player(1, { rank: 51 }), badges)).toEqual({ rank: 51, fromHistory: false });
    });

    it("falls back to the player's ranked badge when the game shows none", () => {
        expect(boardRank(player(1), badges)).toEqual({ rank: 83, fromHistory: true });
        expect(boardRank(player(1, { rank: 0 }), badges)).toEqual({ rank: 83, fromHistory: true });
    });

    it("shows no rank for an unranked badge, a missing row or no Steam id", () => {
        expect(boardRank(player(2), badges)).toEqual({ rank: null, fromHistory: false });
        expect(boardRank(player(3), badges)).toEqual({ rank: null, fromHistory: false });
        expect(boardRank(player(1, { steamId: null }), badges)).toEqual({ rank: null, fromHistory: false });
    });
});

describe("cachedRankLookup", () => {
    it("asks once per lobby and again after a failure", async () => {
        const playerRanks = vi
            .fn<(ids: readonly (number | string)[]) => Promise<PlayerRank[]>>()
            .mockRejectedValueOnce(new Error("down"))
            .mockResolvedValue([row(1, 83)]);
        const lookup = cachedRankLookup({ playerRanks });
        await expect(lookup([1, 2])).rejects.toThrow("down");
        await expect(lookup([1, 2])).resolves.toEqual([row(1, 83)]);
        await lookup([1, 2]);
        expect(playerRanks).toHaveBeenCalledTimes(2);
    });
});
