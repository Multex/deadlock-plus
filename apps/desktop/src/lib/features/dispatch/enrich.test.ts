import type { MvpMatchGrade } from "@deadlock-plus/ipc-types/MvpMatchGrade";
import type { MvpPlayerGrade } from "@deadlock-plus/ipc-types/MvpPlayerGrade";
import type { EditionWindow } from "@deadlock-plus/stats/dispatch/types";
import type { Match } from "@deadlock-plus/stats/stats";
import { describe, expect, it, vi } from "vitest";
import { enrichEdition, type EnrichDeps } from "./enrich";

const ME = 1001;
const WINDOW: EditionWindow = {
    kind: "weekly",
    id: "weekly-2026-10-12",
    startS: 1_791_000_000,
    endS: 1_791_604_800,
    tz: "Australia/Sydney",
};

const match = (matchId: number): Match => ({
    matchId,
    heroId: 1,
    startTime: WINDOW.startS + matchId,
    matchMode: 1,
    gameMode: 1,
    outcome: "win",
    kills: 1,
    deaths: 1,
    assists: 1,
    netWorth: 1,
    durationS: 1800,
    rankBadge: 0,
    rankDelta: null,
    calibration: false,
    demotionProtected: false,
});

const mate = (id: number, matches: number, wins: number) => ({
    mate_id: id,
    wins,
    matches_played: matches,
    matches: Array.from({ length: matches }, (_, i) => i + 1),
});
const enemy = (id: number, matches: number, wins: number) => ({
    enemy_id: id,
    wins,
    matches_played: matches,
    matches: Array.from({ length: matches }, (_, i) => i + 1),
});
const heroRow = (heroId: number, over: Record<string, unknown> = {}) => ({
    account_id: ME,
    hero_id: heroId,
    matches_played: 2,
    time_played: 5031,
    wins: 2,
    kills: 14,
    deaths: 13,
    assists: 29,
    total_player_damage: 66_635,
    obj_damage_per_min: 119.5,
    accuracy: 0.6,
    crit_shot_rate: 0.19,
    mvp_rank_counts: [0, 1, 0],
    mvp_rated_matches: 2,
    ...over,
});

const grade = (matchId: number, players: Partial<MvpPlayerGrade>[]): MvpMatchGrade => ({
    matchId,
    leaver: false,
    pathsChecked: true,
    provisional: false,
    players: players.map((p, i) => ({
        accountId: 0,
        playerSlot: i,
        heroId: 1,
        team: 1,
        s10: 500,
        letter: "B",
        place: 5,
        totalPoints: 0,
        farmBonus: 0,
        stats: [],
        ...p,
    })),
});

function makeDeps(over: Partial<{ [K in keyof EnrichDeps]: EnrichDeps[K] }> = {}) {
    const api = {
        playerHeroStats: vi.fn(async (_id: number, _w: { minS: number; maxS: number }): Promise<unknown> => []),
        mateStats: vi.fn(async (_id: number, _w: { minS: number; maxS: number }): Promise<unknown> => []),
        enemyStats: vi.fn(async (_id: number, _w: { minS: number; maxS: number }): Promise<unknown> => []),
    };
    const gradeMatch = vi.fn(async (_id: number): Promise<MvpMatchGrade | null> => null);
    const names = vi.fn(async (ids: number[]) => new Map(ids.map((id) => [id, `P${id}`])));
    const deps = { api, gradeMatch, names, ...over } as unknown as EnrichDeps;
    return { deps, api, gradeMatch, names };
}

describe("enrichEdition requests", () => {
    it("asks all three player endpoints for the viewer over the window, end inclusive of the last second", async () => {
        const { deps, api } = makeDeps();
        await enrichEdition(WINDOW, ME, [], deps);
        const window = { minS: 1_791_000_000, maxS: 1_791_604_799 };
        expect(api.playerHeroStats.mock.calls).toEqual([[ME, window]]);
        expect(api.mateStats.mock.calls).toEqual([[ME, window]]);
        expect(api.enemyStats.mock.calls).toEqual([[ME, window]]);
    });

    it("counts ranked games only in a Collector's Copy's hero stats, and people over every mode", async () => {
        const { deps, api } = makeDeps();
        await enrichEdition({ ...WINDOW, kind: "collectors", id: "collectors-season_1" }, ME, [], deps);
        const window = { minS: 1_791_000_000, maxS: 1_791_604_799 };
        expect(api.playerHeroStats.mock.calls).toEqual([[ME, { ...window, matchMode: ["ranked"] }]]);
        expect(api.mateStats.mock.calls).toEqual([[ME, window]]);
        expect(api.enemyStats.mock.calls).toEqual([[ME, window]]);
    });

    it("grades each candidate once and nothing else", async () => {
        const { deps, gradeMatch } = makeDeps();
        await enrichEdition(WINDOW, ME, [match(11), match(12), match(13)], deps);
        expect(gradeMatch.mock.calls).toEqual([[11], [12], [13]]);
    });
});

describe("enrichEdition mates and enemies", () => {
    it("maps mate rows and puts the most played first", async () => {
        const { deps, api } = makeDeps();
        api.mateStats.mockResolvedValue([mate(2001, 3, 1), mate(2002, 9, 6), mate(2003, 3, 3)]);
        const out = await enrichEdition(WINDOW, ME, [], deps);
        expect(out.mates).toEqual([
            { accountId: 2002, name: "P2002", matches: 9, wins: 6 },
            { accountId: 2003, name: "P2003", matches: 3, wins: 3 },
            { accountId: 2001, name: "P2001", matches: 3, wins: 1 },
        ]);
    });

    it("keeps enemy wins as the viewer's wins", async () => {
        const { deps, api } = makeDeps();
        api.enemyStats.mockResolvedValue([enemy(3001, 5, 3)]);
        const out = await enrichEdition(WINDOW, ME, [], deps);
        expect(out.enemies).toEqual([{ accountId: 3001, name: "P3001", matches: 5, wins: 3 }]);
    });

    it("drops malformed rows and keeps the good ones", async () => {
        const { deps, api } = makeDeps();
        api.mateStats.mockResolvedValue([
            null,
            "x",
            { mate_id: "7", wins: 1, matches_played: 2 },
            { mate_id: 7, wins: 1 },
            { mate_id: 8, wins: 4, matches_played: 3 },
            { mate_id: 9, wins: 0, matches_played: 0 },
            { mate_id: -1, wins: 0, matches_played: 2 },
            { mate_id: 2001, wins: 1, matches_played: 2 },
        ]);
        const out = await enrichEdition(WINDOW, ME, [], deps);
        expect(out.mates).toEqual([{ accountId: 2001, name: "P2001", matches: 2, wins: 1 }]);
    });

    it("gives [] for an answer with no rows and null for a body that is not a list", async () => {
        const { deps, api } = makeDeps();
        api.mateStats.mockResolvedValue([]);
        api.enemyStats.mockResolvedValue({ detail: "nope" });
        const out = await enrichEdition(WINDOW, ME, [], deps);
        expect(out.mates).toEqual([]);
        expect(out.enemies).toBeNull();
    });

    it("leaves only the failed call's field null", async () => {
        const { deps, api } = makeDeps();
        api.mateStats.mockRejectedValue(new Error("429"));
        api.enemyStats.mockResolvedValue([enemy(3001, 2, 1)]);
        api.playerHeroStats.mockResolvedValue([heroRow(1)]);
        const out = await enrichEdition(WINDOW, ME, [], deps);
        expect(out.mates).toBeNull();
        expect(out.enemies).toHaveLength(1);
        expect(out.heroCombat).toHaveLength(1);
    });

    it("treats a call that throws before returning a promise as failed", async () => {
        const { deps, api } = makeDeps();
        api.enemyStats.mockImplementation(() => {
            throw new Error("boom");
        });
        const out = await enrichEdition(WINDOW, ME, [], deps);
        expect(out.enemies).toBeNull();
        expect(out.mates).toEqual([]);
    });
});

describe("enrichEdition names", () => {
    const manyMates = Array.from({ length: 8 }, (_, i) => mate(2001 + i, 20 - i, 10));
    const manyEnemies = Array.from({ length: 8 }, (_, i) => enemy(3001 + i, 20 - i, 18 - i));

    it("looks up the top 5 mates and top 5 enemies by matches and nobody else", async () => {
        const { deps, api, names } = makeDeps();
        api.mateStats.mockResolvedValue(manyMates);
        api.enemyStats.mockResolvedValue(manyEnemies);
        await enrichEdition(WINDOW, ME, [], deps);
        expect(names).toHaveBeenCalledTimes(1);
        const ids = names.mock.calls[0]![0];
        expect(new Set(ids)).toEqual(new Set([2001, 2002, 2003, 2004, 2005, 3001, 3002, 3003, 3004, 3005]));
    });

    it("also names the enemy with the most losses when they are outside the top 5", async () => {
        const { deps, api, names } = makeDeps();
        api.enemyStats.mockResolvedValue([...manyEnemies.slice(0, 7), enemy(3999, 6, 0)]);
        const out = await enrichEdition(WINDOW, ME, [], deps);
        expect(names.mock.calls[0]![0]).toContain(3999);
        expect(out.enemies!.find((e) => e.accountId === 3999)!.name).toBe("P3999");
        expect(out.enemies!.find((e) => e.accountId === 3007)!.name).toBeNull();
    });

    it("also names the three enemies with the most losses when they are outside the top 5", async () => {
        const { deps, api, names } = makeDeps();
        api.enemyStats.mockResolvedValue([
            ...manyEnemies.slice(0, 5),
            enemy(3997, 6, 2),
            enemy(3998, 6, 1),
            enemy(3999, 6, 0),
        ]);
        const out = await enrichEdition(WINDOW, ME, [], deps);
        expect(names.mock.calls[0]![0]).toEqual(expect.arrayContaining([3997, 3998, 3999]));
        expect(out.enemies!.filter((e) => e.accountId > 3990).map((e) => e.name)).toEqual(["P3997", "P3998", "P3999"]);
    });

    it("leaves unnamed players past the top 5 with a null name", async () => {
        const { deps, api } = makeDeps();
        api.mateStats.mockResolvedValue(manyMates);
        const out = await enrichEdition(WINDOW, ME, [], deps);
        expect(out.mates!.map((m) => m.name)).toEqual(["P2001", "P2002", "P2003", "P2004", "P2005", null, null, null]);
    });

    it("keeps the lists with null names when the lookup fails or misses a player", async () => {
        const { deps, api, names } = makeDeps();
        api.mateStats.mockResolvedValue([mate(2001, 4, 2), mate(2002, 3, 1)]);
        names.mockResolvedValueOnce(new Map([[2001, "Ada"]]));
        const partial = await enrichEdition(WINDOW, ME, [], deps);
        expect(partial.mates!.map((m) => m.name)).toEqual(["Ada", null]);
        names.mockRejectedValueOnce(new Error("offline"));
        const failed = await enrichEdition(WINDOW, ME, [], deps);
        expect(failed.mates!.map((m) => [m.accountId, m.name])).toEqual([
            [2001, null],
            [2002, null],
        ]);
    });

    it("skips the lookup when there is nobody to name", async () => {
        const { deps, names } = makeDeps();
        await enrichEdition(WINDOW, ME, [], deps);
        expect(names).not.toHaveBeenCalled();
    });
});

describe("enrichEdition hero combat", () => {
    it("maps a hero-stats row", async () => {
        const { deps, api } = makeDeps();
        api.playerHeroStats.mockResolvedValue([heroRow(1), heroRow(6, { matches_played: 5, mvp_rank_counts: [1, 0] })]);
        const out = await enrichEdition(WINDOW, ME, [], deps);
        expect(out.heroCombat).toEqual([
            {
                heroId: 1,
                matches: 2,
                damage: 66_635,
                objDamagePerMin: 119.5,
                accuracy: 0.6,
                critRate: 0.19,
                mvpRankCounts: [0, 1, 0],
                mvpRated: 2,
            },
            {
                heroId: 6,
                matches: 5,
                damage: 66_635,
                objDamagePerMin: 119.5,
                accuracy: 0.6,
                critRate: 0.19,
                mvpRankCounts: [1, 0],
                mvpRated: 2,
            },
        ]);
    });

    it("turns missing or odd numeric fields into null and bad counts into an empty list", async () => {
        const { deps, api } = makeDeps();
        api.playerHeroStats.mockResolvedValue([
            heroRow(1, {
                total_player_damage: null,
                obj_damage_per_min: "x",
                accuracy: undefined,
                crit_shot_rate: Number.NaN,
                mvp_rank_counts: "none",
                mvp_rated_matches: null,
            }),
        ]);
        const out = await enrichEdition(WINDOW, ME, [], deps);
        expect(out.heroCombat).toEqual([
            {
                heroId: 1,
                matches: 2,
                damage: null,
                objDamagePerMin: null,
                accuracy: null,
                critRate: null,
                mvpRankCounts: [],
                mvpRated: 0,
            },
        ]);
    });

    it("drops rows without a hero id or a match count", async () => {
        const { deps, api } = makeDeps();
        api.playerHeroStats.mockResolvedValue([
            heroRow(0),
            heroRow(3, { matches_played: 0 }),
            heroRow(4, { matches_played: "2" }),
            { account_id: ME },
            7,
            heroRow(5),
        ]);
        const out = await enrichEdition(WINDOW, ME, [], deps);
        expect(out.heroCombat!.map((h) => h.heroId)).toEqual([5]);
    });

    it("has no healing field", async () => {
        const { deps, api } = makeDeps();
        api.playerHeroStats.mockResolvedValue([heroRow(1)]);
        const out = await enrichEdition(WINDOW, ME, [], deps);
        expect(Object.keys(out.heroCombat![0]!).sort()).toEqual(
            [
                "accuracy",
                "critRate",
                "damage",
                "heroId",
                "matches",
                "mvpRankCounts",
                "mvpRated",
                "objDamagePerMin",
            ].sort(),
        );
    });
});

describe("enrichEdition grades", () => {
    it("takes the viewer's letter, score and place from each graded match", async () => {
        const { deps, gradeMatch } = makeDeps();
        gradeMatch.mockImplementation(async (id) =>
            id === 11
                ? grade(11, [
                      { accountId: 7, letter: "S", s10: 950, place: 1 },
                      { accountId: ME, letter: "A-", s10: 724, place: 3 },
                  ])
                : grade(12, [{ accountId: ME, letter: "C+", s10: 410, place: 7 }]),
        );
        const out = await enrichEdition(WINDOW, ME, [match(11), match(12)], deps);
        expect(out.grades).toEqual([
            { matchId: 11, letter: "A-", s10: 724, place: 3 },
            { matchId: 12, letter: "C+", s10: 410, place: 7 },
        ]);
    });

    it("nulls only the candidate whose grade failed, came back empty or lacks the viewer", async () => {
        const { deps, gradeMatch } = makeDeps();
        gradeMatch.mockImplementation(async (id) => {
            if (id === 11) throw new Error("no metadata");
            if (id === 12) return null;
            if (id === 13) return grade(13, [{ accountId: 7 }]);
            return grade(14, [{ accountId: ME, letter: "B+", s10: 640, place: 4 }]);
        });
        const out = await enrichEdition(WINDOW, ME, [match(11), match(12), match(13), match(14)], deps);
        expect(out.grades).toEqual([
            { matchId: 11, letter: null, s10: null, place: null },
            { matchId: 12, letter: null, s10: null, place: null },
            { matchId: 13, letter: null, s10: null, place: null },
            { matchId: 14, letter: "B+", s10: 640, place: 4 },
        ]);
    });

    it("gives [] when there is nothing to grade and still fills the other fields", async () => {
        const { deps, api, gradeMatch } = makeDeps();
        api.mateStats.mockResolvedValue([mate(2001, 3, 2)]);
        const out = await enrichEdition(WINDOW, ME, [], deps);
        expect(out.grades).toEqual([]);
        expect(gradeMatch).not.toHaveBeenCalled();
        expect(out.mates).toHaveLength(1);
    });

    it("runs the calls in parallel", async () => {
        const { deps, api, gradeMatch } = makeDeps();
        const started: string[] = [];
        const hold = new Promise<void>((resolve) => setTimeout(resolve, 20));
        api.playerHeroStats.mockImplementation(async () => (started.push("hero"), await hold, []));
        api.mateStats.mockImplementation(async () => (started.push("mate"), await hold, []));
        api.enemyStats.mockImplementation(async () => (started.push("enemy"), await hold, []));
        gradeMatch.mockImplementation(async () => (started.push("grade"), await hold, null));
        const pending = enrichEdition(WINDOW, ME, [match(11)], deps);
        await Promise.resolve();
        await Promise.resolve();
        expect(started.sort()).toEqual(["enemy", "grade", "hero", "mate"]);
        await pending;
    });
});
