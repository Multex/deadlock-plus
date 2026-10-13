import { describe, expect, it } from "vitest";
import { filterScope, heroBreakdown, inWindow, parseHistory, record, streaks, toMatch, type Match } from "./stats";

const DAY = 86_400;
const NOW = 1_800_000_000;

const raw = (over: Record<string, unknown> = {}) => ({
    match_id: 1,
    hero_id: 10,
    start_time: NOW - DAY,
    game_mode: 1,
    match_mode: 4,
    player_kills: 5,
    player_deaths: 2,
    player_assists: 3,
    net_worth: 20000,
    match_duration_s: 1800,
    player_match_outcome: 1,
    ranked_calibration_match: 0,
    ...over,
});

const match = (over: Partial<Match> = {}): Match => ({
    matchId: 1,
    heroId: 10,
    startTime: NOW - DAY,
    matchMode: 4,
    gameMode: 1,
    outcome: "win",
    kills: 5,
    deaths: 2,
    assists: 3,
    netWorth: 20000,
    durationS: 1800,
    rankBadge: 0,
    rankDelta: null,
    calibration: false,
    demotionProtected: false,
    ...over,
});

describe("toMatch", () => {
    it("maps outcome codes from the API docs", () => {
        expect(toMatch(raw({ player_match_outcome: 1 }))?.outcome).toBe("win");
        expect(toMatch(raw({ player_match_outcome: 2 }))?.outcome).toBe("loss");
        for (const code of [3, 4, 5]) {
            expect(toMatch(raw({ player_match_outcome: code }))?.outcome).toBe("unscored");
        }
    });

    it("trusts the outcome field over match_result when it is set", () => {
        expect(toMatch(raw({ match_result: 0, player_team: 1, player_match_outcome: 1 }))?.outcome).toBe("win");
    });

    it("derives the result from the winning team when the outcome is 0 (unranked rows)", () => {
        expect(toMatch(raw({ player_match_outcome: 0, match_result: 1, player_team: 1 }))?.outcome).toBe("win");
        expect(toMatch(raw({ player_match_outcome: 0, match_result: 0, player_team: 1 }))?.outcome).toBe("loss");
    });

    it("stays unscored at outcome 0 when the team fields are missing", () => {
        expect(toMatch(raw({ player_match_outcome: 0, match_result: undefined }))?.outcome).toBe("unscored");
    });

    it("rejects rows missing an id, hero or start time", () => {
        expect(toMatch(raw({ match_id: undefined }))).toBeNull();
        expect(toMatch(raw({ hero_id: null }))).toBeNull();
        expect(toMatch(raw({ start_time: "x" }))).toBeNull();
        expect(toMatch(null)).toBeNull();
    });

    it("reads the rank fields", () => {
        const m = toMatch(
            raw({
                ranked_display_badge: 102,
                ranked_delta: -12,
                ranked_calibration_match: 3,
                ranked_used_demotion_protection: true,
            }),
        );
        expect(m).toMatchObject({ rankBadge: 102, rankDelta: -12, calibration: true, demotionProtected: true });
    });

    it("treats absent rank fields as none", () => {
        const m = toMatch({ match_id: 1, hero_id: 1, start_time: 1 });
        expect(m).toMatchObject({ rankBadge: 0, rankDelta: null, calibration: false, demotionProtected: false });
    });

    it("defaults missing numeric stats to zero", () => {
        const m = toMatch({ match_id: 1, hero_id: 1, start_time: 1 });
        expect(m).toMatchObject({ kills: 0, deaths: 0, assists: 0, netWorth: 0, durationS: 0, outcome: "unscored" });
    });
});

describe("parseHistory", () => {
    it("drops bad rows and tolerates a non-array body", () => {
        expect(parseHistory([raw(), { nope: true }, raw({ match_id: 2 })])).toHaveLength(2);
        expect(parseHistory({ error: "x" })).toEqual([]);
    });

    it("sorts oldest first", () => {
        const out = parseHistory([raw({ match_id: 2, start_time: 200 }), raw({ match_id: 1, start_time: 100 })]);
        expect(out.map((m) => m.matchId)).toEqual([1, 2]);
    });
});

describe("filterScope", () => {
    const ms = [
        match({ matchId: 1, matchMode: 4 }),
        match({ matchId: 2, matchMode: 1, gameMode: 1 }),
        match({ matchId: 3, matchMode: 1, gameMode: 4 }),
        match({ matchId: 4, matchMode: 3 }),
    ];

    it("ranked is match_mode 4 only", () => {
        expect(filterScope(ms, "ranked").map((m) => m.matchId)).toEqual([1]);
    });

    it("unranked is normal-mode unranked matches, not Street Brawl or bots", () => {
        expect(filterScope(ms, "unranked").map((m) => m.matchId)).toEqual([2]);
    });

    it("all keeps everything", () => {
        expect(filterScope(ms, "all")).toHaveLength(4);
    });
});

describe("inWindow", () => {
    it("keeps matches at or after the cutoff and drops older ones", () => {
        const ms = [
            match({ matchId: 1, startTime: NOW - 7 * DAY }),
            match({ matchId: 2, startTime: NOW - 7 * DAY - 1 }),
            match({ matchId: 3, startTime: NOW }),
        ];
        expect(inWindow(ms, 7, NOW).map((m) => m.matchId)).toEqual([1, 3]);
    });

    it("null days means all time", () => {
        expect(inWindow([match({ startTime: 0 })], null, NOW)).toHaveLength(1);
    });
});

describe("record", () => {
    it("counts wins and losses and excludes unscored from the winrate", () => {
        const r = record([
            match({ outcome: "win" }),
            match({ outcome: "win" }),
            match({ outcome: "loss" }),
            match({ outcome: "unscored" }),
        ]);
        expect(r).toEqual({ games: 3, wins: 2, losses: 1, unscored: 1, winrate: 2 / 3 });
    });

    it("has no winrate without scored games", () => {
        expect(record([]).winrate).toBeNull();
        expect(record([match({ outcome: "unscored" })]).winrate).toBeNull();
    });
});

describe("streaks", () => {
    it("reports the current and longest streaks", () => {
        const s = streaks(
            ["win", "win", "win", "loss", "loss", "win", "win"].map((o, i) =>
                match({ matchId: i, startTime: i, outcome: o as Match["outcome"] }),
            ),
        );
        expect(s.current).toEqual({ kind: "win", length: 2 });
        expect(s.longestWin).toBe(3);
        expect(s.longestLoss).toBe(2);
    });

    it("skips unscored matches without breaking a streak", () => {
        const s = streaks([
            match({ matchId: 1, startTime: 1, outcome: "win" }),
            match({ matchId: 2, startTime: 2, outcome: "unscored" }),
            match({ matchId: 3, startTime: 3, outcome: "win" }),
        ]);
        expect(s.current).toEqual({ kind: "win", length: 2 });
    });

    it("orders by start time even when the input is shuffled", () => {
        const s = streaks([
            match({ matchId: 2, startTime: 20, outcome: "loss" }),
            match({ matchId: 1, startTime: 10, outcome: "win" }),
        ]);
        expect(s.current).toEqual({ kind: "loss", length: 1 });
    });

    it("is empty with no scored matches", () => {
        expect(streaks([])).toEqual({ current: null, longestWin: 0, longestLoss: 0 });
    });
});

describe("heroBreakdown", () => {
    it("groups per hero, sorts by games and computes KDA and averages", () => {
        const rows = heroBreakdown([
            match({ heroId: 1, outcome: "win", kills: 10, deaths: 2, assists: 4, netWorth: 30000, durationS: 1000 }),
            match({ heroId: 1, outcome: "loss", kills: 2, deaths: 2, assists: 0, netWorth: 10000, durationS: 500 }),
            match({ heroId: 2, outcome: "win" }),
        ]);
        expect(rows.map((r) => r.heroId)).toEqual([1, 2]);
        expect(rows[0]).toMatchObject({
            games: 2,
            wins: 1,
            winrate: 0.5,
            avgNetWorth: 20000,
            playtimeS: 1500,
            kda: 16 / 4,
        });
    });

    it("uses kills plus assists when a hero never died", () => {
        const [row] = heroBreakdown([match({ kills: 3, assists: 2, deaths: 0 })]);
        expect(row.kda).toBe(5);
    });

    it("counts unscored games as games but not toward the winrate", () => {
        const [row] = heroBreakdown([match({ outcome: "unscored" })]);
        expect(row).toMatchObject({ games: 1, wins: 0, winrate: null });
    });
});
