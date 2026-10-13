import { describe, expect, it } from "vitest";
import { apiOnly, forAccount, mergeProvisional } from "./provisional";
import type { ProvisionalMatch } from "@deadlock-plus/ipc-types/ProvisionalMatch";
import type { Match } from "./stats";

const api = (over: Partial<Match> = {}): Match => ({
    matchId: 1,
    heroId: 10,
    startTime: 1000,
    matchMode: 4,
    gameMode: 1,
    outcome: "win",
    kills: 1,
    deaths: 2,
    assists: 3,
    netWorth: 4,
    durationS: 1800,
    rankBadge: 0,
    rankDelta: null,
    calibration: false,
    demotionProtected: false,
    ...over,
});

const prov = (over: Partial<ProvisionalMatch> = {}): ProvisionalMatch => ({
    ...api(),
    capturedAt: 5000,
    accountId: 7,
    ...over,
});

describe("mergeProvisional", () => {
    it("returns the API matches untouched when there are no provisional ones", () => {
        const matches = [api({ matchId: 1 }), api({ matchId: 2, startTime: 2000 })];
        expect(mergeProvisional(matches, [])).toEqual(matches);
    });

    it("lets the API record win for the same match id", () => {
        const merged = mergeProvisional([api({ matchId: 7, kills: 9 })], [prov({ matchId: 7, kills: 1 })]);
        expect(merged).toHaveLength(1);
        expect(merged[0].kills).toBe(9);
        expect(merged[0].provisional).toBeUndefined();
    });

    it("adds unknown provisional rows flagged and without a rank delta", () => {
        const merged = mergeProvisional([api({ matchId: 1 })], [prov({ matchId: 2, startTime: 3000, rankDelta: 40 })]);
        const added = merged.find((m) => m.matchId === 2)!;
        expect(added.provisional).toBe(true);
        expect(added.rankDelta).toBeNull();
        expect("capturedAt" in added).toBe(false);
        expect("accountId" in added).toBe(false);
    });

    it("sorts the result by start time", () => {
        const merged = mergeProvisional(
            [api({ matchId: 1, startTime: 3000 })],
            [prov({ matchId: 2, startTime: 1000 }), prov({ matchId: 3, startTime: 2000 })],
        );
        expect(merged.map((m) => m.matchId)).toEqual([2, 3, 1]);
    });

    it("keeps one row when the same provisional id appears twice", () => {
        const merged = mergeProvisional([], [prov({ matchId: 2, kills: 1 }), prov({ matchId: 2, kills: 5 })]);
        expect(merged).toHaveLength(1);
        expect(merged[0].kills).toBe(5);
    });
});

describe("apiOnly", () => {
    it("drops provisional rows", () => {
        const merged = mergeProvisional([api({ matchId: 1 })], [prov({ matchId: 2 })]);
        expect(apiOnly(merged).map((m) => m.matchId)).toEqual([1]);
    });
});

describe("forAccount", () => {
    it("keeps only that account's records", () => {
        const rows = [
            prov({ matchId: 1, accountId: 7 }),
            prov({ matchId: 2, accountId: 8 }),
            prov({ matchId: 3, accountId: 7 }),
        ];
        expect(forAccount(rows, 7).map((m) => m.matchId)).toEqual([1, 3]);
    });

    it("never keeps records without an account", () => {
        expect(forAccount([prov({ accountId: 0 })], 0)).toEqual([]);
    });
});
