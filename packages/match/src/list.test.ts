import { describe, expect, it } from "vitest";
import type { ProvisionalMatch } from "@deadlock-plus/ipc-types/ProvisionalMatch";
import type { Match } from "@deadlock-plus/stats/stats";
import { buildRows, rowMode, toRow } from "./list";

const api = (over: Partial<Match> = {}): Match => ({
    matchId: 1,
    heroId: 10,
    startTime: 1000,
    matchMode: 1,
    gameMode: 1,
    outcome: "win",
    kills: 5,
    deaths: 2,
    assists: 7,
    netWorth: 30000,
    durationS: 1800,
    rankBadge: 63,
    rankDelta: 12,
    calibration: false,
    demotionProtected: false,
    ...over,
});

const prov = (over: Partial<ProvisionalMatch> = {}): ProvisionalMatch => ({
    ...api(),
    rankDelta: null,
    capturedAt: 5000,
    accountId: 7,
    ...over,
});

describe("rowMode", () => {
    it.each([
        [{ matchMode: 4, gameMode: 1 }, "ranked"],
        [{ matchMode: 1, gameMode: 1 }, "unranked"],
        [{ matchMode: 1, gameMode: 4 }, "streetBrawl"],
        [{ matchMode: 2, gameMode: 1 }, "custom"],
        [{ matchMode: 3, gameMode: 1 }, "bot"],
        [{ matchMode: 3, gameMode: 4 }, "bot"],
        [{ matchMode: 1, gameMode: 3 }, "other"],
        [{ matchMode: 0, gameMode: 0 }, "other"],
    ] as const)("%j is %s", (input, want) => {
        expect(rowMode(input)).toBe(want);
    });
});

describe("toRow", () => {
    it("maps every displayed field", () => {
        expect(toRow(api({ matchId: 9, matchMode: 4 }))).toEqual({
            matchId: 9,
            heroId: 10,
            outcome: "win",
            mode: "ranked",
            kills: 5,
            deaths: 2,
            assists: 7,
            souls: 30000,
            durationS: 1800,
            startTime: 1000,
            rankBadge: 63,
            rankDelta: 12,
            calibration: false,
            source: "api",
        });
    });

    it("marks provisional matches", () => {
        expect(toRow(api({ provisional: true })).source).toBe("provisional");
    });
});

describe("buildRows", () => {
    it("is empty with no input", () => {
        expect(buildRows([], [])).toEqual([]);
    });

    it("sorts newest first", () => {
        const rows = buildRows(
            [api({ matchId: 1, startTime: 100 }), api({ matchId: 2, startTime: 300 })],
            [prov({ matchId: 3, startTime: 200 })],
        );
        expect(rows.map((r) => r.matchId)).toEqual([2, 3, 1]);
    });

    it("keeps input order for equal start times", () => {
        const rows = buildRows([api({ matchId: 1 }), api({ matchId: 2 }), api({ matchId: 3 })], []);
        expect(rows.map((r) => r.matchId)).toEqual([1, 2, 3]);
    });

    it("merges on match id and lets the API win", () => {
        const rows = buildRows(
            [api({ matchId: 5, kills: 9, rankDelta: 20 })],
            [prov({ matchId: 5, kills: 1, rankDelta: null })],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ matchId: 5, kills: 9, rankDelta: 20, source: "api" });
    });

    it("keeps provisional matches the API has not returned", () => {
        const rows = buildRows([api({ matchId: 1 })], [prov({ matchId: 2, startTime: 2000 })]);
        expect(rows.map((r) => [r.matchId, r.source])).toEqual([
            [2, "provisional"],
            [1, "api"],
        ]);
    });
});
