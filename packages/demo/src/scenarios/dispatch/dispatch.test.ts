import type { MvpMatchGrade } from "@deadlock-plus/ipc-types/MvpMatchGrade";
import { afterEach, describe, expect, it } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { defaultScenario } from "../default";
import { fakeAccountId, fakeName, IDENTITY, MATCH_IDS, NOW_MS } from "../default/identity";
import { historyRows, type HistoryRow } from "../default/progress";
import { badgeOf, FIRST_MATCH_ID, FIRST_MONDAY_S, olderRows } from "./history";
import { dispatchScenario } from "./index";
import { MATE_NAME_INDEXES, NEMESIS_NAME_INDEX } from "./player-stats";

const OPTIONS = { appVersion: "1.2.3", changelog: "", mapItemsTsv: "# a\n# b\n# c" };
const API = "https://api.deadlock-api.com";
const CONTEXT = { identity: IDENTITY, now: NOW_MS, seed: 20261012 };
const DAY_S = 86_400;
const WEEK_S = 7 * DAY_S;
const SEEN_HEROES = [1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 25, 27, 31, 35, 50, 52, 58];
const MVP_FROM_S = Date.UTC(2026, 0, 6) / 1000;

const won = (row: HistoryRow) =>
    row.player_match_outcome === 1 || (row.player_match_outcome === 0 && row.match_result === row.player_team);
const windowQuery = (minS: number, maxS: number) => `min_unix_timestamp=${minS}&max_unix_timestamp=${maxS}`;
const inside = (rows: readonly HistoryRow[], minS: number, maxS: number) =>
    rows.filter((row) => row.start_time >= minS && row.start_time <= maxS);

describe("dispatch scenario", () => {
    const handles: DemoHandle[] = [];
    const start = (scenario = dispatchScenario(OPTIONS)) => {
        const handle = install(scenario);
        handles.push(handle);
        return handle;
    };
    const api = async (path: string) => (await fetch(API + path)).json();
    const history = () => api(`/v1/players/${IDENTITY.accountId}/match-history`) as Promise<HistoryRow[]>;
    afterEach(() => {
        while (handles.length) handles.pop()!.uninstall();
    });

    describe("history", () => {
        const older = olderRows(CONTEXT);
        const oldestDefault = Math.min(...historyRows(CONTEXT).map((row) => row.start_time));

        it("gives the same rows every time", async () => {
            expect(olderRows(CONTEXT)).toEqual(older);
            start();
            const first = await history();
            handles.pop()!.uninstall();
            start();
            expect(await history()).toEqual(first);
        });

        it("holds about 14 months of matches, oldest first, with ids from 980000000 up", () => {
            expect(older.length).toBeGreaterThan(450);
            expect(older.length).toBeLessThan(800);
            expect(older.map((row) => row.match_id)).toEqual(older.map((_, i) => FIRST_MATCH_ID + i));
            expect(older.map((row) => row.start_time)).toEqual(
                older.map((row) => row.start_time).sort((a, b) => a - b),
            );
            const spanDays = (NOW_MS / 1000 - older[0]!.start_time) / DAY_S;
            expect(spanDays).toBeGreaterThan(420);
            expect(spanDays).toBeLessThan(435);
            expect(older.at(-1)!.start_time).toBeLessThan(oldestDefault);
            expect(oldestDefault - older.at(-1)!.start_time).toBeLessThan(2 * DAY_S);
        });

        it("serves them merged with the default 60, newest first", async () => {
            start();
            const rows = await history();
            const defaults = historyRows(CONTEXT);
            expect(rows).toHaveLength(older.length + 60);
            expect(rows.slice(0, 60)).toEqual(defaults);
            expect(rows.slice(0, 60).map((row) => row.match_id)).toEqual(MATCH_IDS);
            expect(rows.slice(60).map((row) => row.match_id)).toEqual(older.map((row) => row.match_id).reverse());
        });

        it("plays 20 to 45 minutes a match with ranked, unranked and the default heroes", () => {
            const durations = older.map((row) => row.match_duration_s);
            expect(Math.min(...durations)).toBeGreaterThanOrEqual(1200);
            expect(Math.max(...durations)).toBeLessThanOrEqual(2700);
            expect(Math.max(...durations)).toBeGreaterThan(2400);
            expect(Math.min(...durations)).toBeLessThan(1500);
            const ranked = older.filter((row) => row.match_mode === 4).length;
            const unranked = older.filter((row) => row.match_mode === 1).length;
            expect(ranked + unranked).toBe(older.length);
            expect(ranked / older.length).toBeGreaterThan(0.5);
            expect(unranked / older.length).toBeGreaterThan(0.25);
            const heroes = new Set(older.map((row) => row.hero_id));
            for (const row of historyRows(CONTEXT)) expect(heroes.has(row.hero_id)).toBe(true);
            for (const id of heroes) expect(SEEN_HEROES).toContain(id);
            expect(heroes.size).toBeGreaterThan(14);
        });

        it("introduces heroes over time, not all at once", () => {
            const firstSeen = new Map<number, number>();
            for (const row of older) if (!firstSeen.has(row.hero_id)) firstSeen.set(row.hero_id, row.start_time);
            const late = [...firstSeen.values()].filter((t) => t > older[0]!.start_time + 60 * DAY_S);
            expect(late.length).toBeGreaterThan(8);
        });

        it("keeps a week between 3 and 25 matches except a few quiet ones and one busy week", () => {
            const weeks = new Map<number, number>();
            for (const row of older) {
                const week = Math.floor((row.start_time - FIRST_MONDAY_S) / WEEK_S);
                weeks.set(week, (weeks.get(week) ?? 0) + 1);
            }
            const last = Math.max(...weeks.keys());
            const counts = Array.from({ length: last }, (_, w) => weeks.get(w) ?? 0);
            expect(counts.filter((c) => c < 3).length).toBeGreaterThanOrEqual(5);
            expect(counts.filter((c) => c === 0).length).toBeGreaterThanOrEqual(1);
            expect(Math.max(...counts)).toBe(25);
            expect(counts.filter((c) => c === 25)).toHaveLength(1);
            expect(counts.filter((c) => c >= 3 && c <= 24).length).toBeGreaterThan(40);
        });

        it("has night sessions that start after midnight", () => {
            const night = older.filter((row) => new Date(row.start_time * 1000).getUTCHours() < 6);
            expect(night.length).toBeGreaterThan(8);
            expect(night.length / older.length).toBeLessThan(0.25);
        });

        it("climbs the ranked ladder and joins the default history's first rank", () => {
            const ranked = older.filter((row) => row.match_mode === 4);
            expect(badgeOf(54_970)).toBe(86);
            expect(ranked[0]!.ranked_display_badge).toBeLessThan(55);
            expect(ranked.at(-1)!.ranked_display_badge).toBe(82);
            const oldestRanked = historyRows(CONTEXT)
                .filter((row) => row.match_mode === 4)
                .at(-1)!;
            expect(oldestRanked.ranked_display_badge).toBe(82);
            const quarter = Math.floor(ranked.length / 4);
            const mean = (rows: HistoryRow[]) => rows.reduce((t, r) => t + r.ranked_display_badge!, 0) / rows.length;
            expect(mean(ranked.slice(-quarter))).toBeGreaterThan(mean(ranked.slice(0, quarter)) + 20);
            for (let i = 1; i < ranked.length; i++) {
                const step = Math.abs(ranked[i]!.ranked_display_badge! - ranked[i - 1]!.ranked_display_badge!);
                expect(step).toBeLessThanOrEqual(10);
            }
        });

        it("scores a ranked row from its change and leaves unranked rows unscored", () => {
            for (const row of older) {
                if (row.match_mode === 4) {
                    expect(row.ranked_delta! > 0).toBe(row.player_match_outcome === 1);
                    expect(row.match_result === row.player_team).toBe(row.player_match_outcome === 1);
                } else {
                    expect(row.player_match_outcome).toBe(0);
                    expect(row.ranked_delta).toBeNull();
                }
            }
        });
    });

    describe("player stats", () => {
        const week = [Date.UTC(2026, 8, 14) / 1000, Date.UTC(2026, 8, 21) / 1000 - 1] as const;
        const everything = [0, Math.floor(NOW_MS / 1000)] as const;
        const allRows = [...olderRows(CONTEXT), ...historyRows(CONTEXT)];
        const heroStats = (window: readonly [number, number]) =>
            api(`/v1/players/hero-stats?account_ids=${IDENTITY.accountId}&${windowQuery(...window)}`);
        const mates = (window: readonly [number, number]) =>
            api(`/v1/players/${IDENTITY.accountId}/mate-stats?same_party=true&${windowQuery(...window)}`);
        const enemies = (window: readonly [number, number]) =>
            api(`/v1/players/${IDENTITY.accountId}/enemy-stats?${windowQuery(...window)}`);

        it("aggregates hero-stats per hero from the rows inside the window", async () => {
            start();
            const rows = inside(allRows, ...week);
            expect(rows.length).toBeGreaterThan(2);
            const stats = (await heroStats(week)) as Record<string, unknown>[];
            expect(stats.map((s) => s.hero_id).sort()).toEqual([...new Set(rows.map((r) => r.hero_id))].sort());
            expect(stats.reduce((t, s) => t + (s.matches_played as number), 0)).toBe(rows.length);
            for (const s of stats) {
                const played = rows.filter((r) => r.hero_id === s.hero_id);
                expect(s).toMatchObject({
                    account_id: IDENTITY.accountId,
                    matches_played: played.length,
                    wins: played.filter(won).length,
                    kills: played.reduce((t, r) => t + r.player_kills, 0),
                    deaths: played.reduce((t, r) => t + r.player_deaths, 0),
                    assists: played.reduce((t, r) => t + r.player_assists, 0),
                    time_played: played.reduce((t, r) => t + r.match_duration_s, 0),
                });
                expect(s.total_player_damage).toBeGreaterThan(0);
                expect(s.accuracy).toBeGreaterThan(0.3);
                expect(s.accuracy).toBeLessThan(0.7);
                expect(s.mvp_rank_counts).toHaveLength(3);
                expect(s).not.toHaveProperty("healing");
            }
        });

        it("narrows hero-stats with the window and rates MVP only from 2026-01-06", async () => {
            start();
            const wide = (await heroStats(everything)) as { matches_played: number; mvp_rated_matches: number }[];
            expect(wide.reduce((t, s) => t + s.matches_played, 0)).toBe(allRows.length);
            expect(wide.reduce((t, s) => t + s.mvp_rated_matches, 0)).toBe(
                allRows.filter((r) => r.start_time >= MVP_FROM_S).length,
            );
            const before = (await heroStats([0, MVP_FROM_S - 1])) as { mvp_rated_matches: number }[];
            expect(before.length).toBeGreaterThan(0);
            expect(before.every((s) => s.mvp_rated_matches === 0)).toBe(true);
            expect(await heroStats([1, 2])).toEqual([]);
        });

        it("lists a handful of regular mates whose names resolve", async () => {
            start();
            const stats = (await mates(everything)) as {
                mate_id: number;
                wins: number;
                matches_played: number;
                matches: number[];
            }[];
            expect(stats.map((s) => s.mate_id).sort()).toEqual(
                MATE_NAME_INDEXES.map((i) => fakeAccountId(IDENTITY, i)).sort(),
            );
            expect(stats.map((s) => s.matches_played)).toEqual(
                stats.map((s) => s.matches_played).sort((a, b) => b - a),
            );
            const byId = new Map(allRows.map((r) => [r.match_id, r]));
            for (const s of stats) {
                expect(s.matches_played).toBe(s.matches.length);
                expect(s.matches_played).toBeGreaterThanOrEqual(8);
                expect(s.wins).toBe(s.matches.filter((id) => won(byId.get(id)!)).length);
            }
            const names = (await api(`/v1/players/steam?account_ids=${stats.map((s) => s.mate_id).join(",")}`)) as {
                account_id: number;
                personaname: string;
            }[];
            expect(names.map((n) => n.personaname).sort()).toEqual(
                MATE_NAME_INDEXES.map((i) => fakeName(IDENTITY, i)).sort(),
            );
        });

        it("filters mates and enemies to the window", async () => {
            start();
            const ids = new Set(inside(allRows, ...week).map((r) => r.match_id));
            const mateRows = (await mates(week)) as { matches: number[] }[];
            const enemyRows = (await enemies(week)) as { matches: number[] }[];
            expect(mateRows.length + enemyRows.length).toBeGreaterThan(0);
            for (const row of [...mateRows, ...enemyRows]) {
                expect(row.matches.length).toBeGreaterThan(0);
                for (const id of row.matches) expect(ids.has(id)).toBe(true);
            }
            expect(await mates([1, 2])).toEqual([]);
            expect(await enemies([1, 2])).toEqual([]);
        });

        it("has mates who queue only during their own stretch of the year", async () => {
            start();
            const ids = async (window: readonly [number, number]) =>
                ((await mates(window)) as { mate_id: number }[]).map((m) => m.mate_id);
            const early = await ids([0, FIRST_MONDAY_S + 6 * WEEK_S - 1]);
            const late = await ids([FIRST_MONDAY_S + 40 * WEEK_S, Math.floor(NOW_MS / 1000)]);
            const [always, winter, recent] = [1, 4, 8].map((i) => fakeAccountId(IDENTITY, i));
            expect(early).toContain(always);
            expect(early).not.toContain(winter);
            expect(early).not.toContain(recent);
            expect(late).toContain(recent);
            expect(late).not.toContain(winter);
        });

        it("has one recurring nemesis who beats the player most, with wins counted for the player", async () => {
            start();
            const stats = (await enemies(everything)) as {
                enemy_id: number;
                wins: number;
                matches_played: number;
                matches: number[];
            }[];
            expect(stats.length).toBeGreaterThanOrEqual(5);
            const losses = (s: { wins: number; matches_played: number }) => s.matches_played - s.wins;
            const [top, second] = [...stats].sort((a, b) => losses(b) - losses(a));
            expect(top!.enemy_id).toBe(fakeAccountId(IDENTITY, NEMESIS_NAME_INDEX));
            expect(losses(top!)).toBeGreaterThan(losses(second!) * 1.5);
            expect(losses(top!)).toBeGreaterThan(30);
            const byId = new Map(allRows.map((r) => [r.match_id, r]));
            for (const s of stats) expect(s.wins).toBe(s.matches.filter((id) => won(byId.get(id)!)).length);
            const names = (await api(
                `/v1/players/steam?account_ids=${stats.map((s) => s.enemy_id).join(",")}`,
            )) as unknown[];
            expect(names).toHaveLength(stats.length);
        });

        it("answers only for the demo player", async () => {
            start();
            expect(await api(`/v1/players/hero-stats?account_ids=5&${windowQuery(...everything)}`)).toEqual([]);
            expect(await api(`/v1/players/5/mate-stats?same_party=true&${windowQuery(...everything)}`)).toEqual([]);
            expect(await api(`/v1/players/5/enemy-stats?${windowQuery(...everything)}`)).toEqual([]);
        });
    });

    describe("grades", () => {
        const gradeOf = (handle: DemoHandle, matchId: number) =>
            handle.invoke("mvp_grade_match", { matchId }) as Promise<MvpMatchGrade | null>;

        it("grades a generated match with all twelve players, the demo player among them", async () => {
            const handle = start();
            const id = FIRST_MATCH_ID + 100;
            const grade = (await gradeOf(handle, id))!;
            expect(grade.matchId).toBe(id);
            expect(grade.players).toHaveLength(12);
            expect(grade.players.map((p) => p.place)[0]).toBe(1);
            const own = grade.players.find((p) => p.accountId === IDENTITY.accountId)!;
            expect(own.heroId).toBe(olderRows(CONTEXT)[100]!.hero_id);
            expect(await gradeOf(handle, id)).toEqual(grade);
        });

        it("still grades the default matches as the default scenario does", async () => {
            const handle = start();
            const plain = install(defaultScenario(OPTIONS));
            handles.push(plain);
            const id = MATCH_IDS[4]!;
            expect(await gradeOf(handle, id)).toEqual(await gradeOf(plain, id));
            expect(await gradeOf(handle, 123)).toBeNull();
        });
    });

    describe("default scenario", () => {
        it("keeps its 60 matches and has no Dispatch answers", async () => {
            const scenario = defaultScenario(OPTIONS);
            expect(scenario.id).toBe("default");
            expect(scenario.modules.map((m) => m.name)).not.toContain("dispatch");
            start(scenario);
            const rows = await history();
            expect(rows.map((row) => row.match_id)).toEqual(MATCH_IDS);
        });

        it("is the dispatch scenario's base", () => {
            const scenario = dispatchScenario(OPTIONS);
            expect(scenario.id).toBe("dispatch");
            expect(scenario.modules.map((m) => m.name)).toEqual([
                ...defaultScenario(OPTIONS).modules.map((m) => m.name),
                "dispatch",
            ]);
        });
    });
});
