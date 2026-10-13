import { describe, expect, it } from "vitest";
import {
    allPlayers,
    averageBadgeOf,
    findPlayer,
    outcomeFor,
    playerBySlot,
    type MatchDetail,
    type MatchPlayer,
    type MatchTeam,
} from "./detail";

function player(slot: number, accountId: number, team: MatchTeam, outcome: MatchPlayer["outcome"]): MatchPlayer {
    return {
        slot,
        accountId,
        team,
        heroId: 1,
        level: 1,
        kills: 0,
        deaths: 0,
        assists: 0,
        souls: 0,
        lastHits: 0,
        denies: 0,
        playerDamage: 0,
        healing: 0,
        outcome,
        items: [],
        deathLog: [],
        series: [],
        abilities: [],
        accolades: [],
    };
}

function detail(badges: [number | undefined, number | undefined] = [undefined, undefined]): MatchDetail {
    return {
        source: "api",
        matchId: 1,
        startTime: 0,
        durationS: 0,
        matchMode: 1,
        gameMode: 1,
        notScored: false,
        bans: [],
        teams: [
            {
                team: "hidden-king",
                score: 0,
                averageBadge: badges[0],
                players: [player(1, 100, "hidden-king", "loss"), player(2, 200, "hidden-king", "loss")],
            },
            {
                team: "archmother",
                score: 0,
                averageBadge: badges[1],
                players: [player(7, 300, "archmother", "win")],
            },
        ],
        objectives: [],
        midBoss: [],
        damageMatrix: { sampleTimesS: [], sources: [], entries: [] },
    };
}

describe("lookups", () => {
    it("lists players of both teams", () => {
        expect(allPlayers(detail()).map((p) => p.slot)).toEqual([1, 2, 7]);
    });

    it("finds a player by slot", () => {
        expect(playerBySlot(detail(), 7)?.accountId).toBe(300);
        expect(playerBySlot(detail(), 9)).toBeUndefined();
    });

    it("prefers the first listed account that is in the match", () => {
        expect(findPlayer(detail(), [999, 200, 100])?.slot).toBe(2);
        expect(findPlayer(detail(), [999])).toBeUndefined();
    });
});

describe("outcomeFor", () => {
    it("returns the outcome of the matched account", () => {
        expect(outcomeFor(detail(), [300])).toBe("win");
        expect(outcomeFor(detail(), [100])).toBe("loss");
    });

    it("returns null when no account is in the match", () => {
        expect(outcomeFor(detail(), [999])).toBeNull();
    });
});

describe("averageBadgeOf", () => {
    it("averages the reported team badges by position in the tier ladder", () => {
        expect(averageBadgeOf(detail([61, 71]))).toBe(64);
    });

    it("never lands on a sub-tier that does not exist", () => {
        expect(averageBadgeOf(detail([91, 85]))).toBe(86);
        for (const a of [11, 16, 21, 56, 61, 66, 91, 96, 111]) {
            for (const b of [11, 16, 21, 56, 61, 66, 91, 96, 111]) {
                const avg = averageBadgeOf(detail([a, b]))!;
                expect(avg % 10).toBeGreaterThanOrEqual(1);
                expect(avg % 10).toBeLessThanOrEqual(6);
            }
        }
    });

    it("averages across a tier boundary", () => {
        expect(averageBadgeOf(detail([65, 71]))).toBe(66);
        expect(averageBadgeOf(detail([15, 21]))).toBe(16);
    });

    it("uses the one badge there is", () => {
        expect(averageBadgeOf(detail([undefined, 71]))).toBe(71);
    });

    it("is undefined without any badge", () => {
        expect(averageBadgeOf(detail())).toBeUndefined();
    });
});
