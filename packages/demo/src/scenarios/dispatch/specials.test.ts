import { afterEach, describe, expect, it } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { defaultScenario } from "../default";
import { IDENTITY, MATCH_IDS, NOW_MS } from "../default/identity";
import { historyRows, type HistoryRow } from "../default/progress";
import { FIRST_MONDAY_S, laterRows, olderRows } from "./history";
import { dispatchScenario, dispatchSpecialsScenario } from "./index";
import { RANKED_SEASONS, SEASON_1_END_S, SEASON_1_START_S, SPECIALS_NOW_MS } from "./seasons";

const OPTIONS = { appVersion: "1.2.3", changelog: "", mapItemsTsv: "# a\n# b\n# c" };
const API = "https://api.deadlock-api.com";
const CONTEXT = { identity: IDENTITY, now: NOW_MS, seed: 20261012 };
const DAY_S = 86_400;
const WEEK_S = 7 * DAY_S;
const utc = (...parts: [number, number, number]) => Date.UTC(...parts) / 1000;
const RANKED = 4;

describe("dispatch-specials scenario", () => {
    const handles: DemoHandle[] = [];
    const start = (scenario = dispatchSpecialsScenario(OPTIONS)) => {
        const handle = install(scenario);
        handles.push(handle);
        return handle;
    };
    const api = async (path: string) => (await fetch(API + path)).json();
    const history = () => api(`/v1/players/${IDENTITY.accountId}/match-history`) as Promise<HistoryRow[]>;
    afterEach(() => {
        while (handles.length) handles.pop()!.uninstall();
    });

    const later = laterRows(CONTEXT);
    const generated = [...olderRows(CONTEXT), ...later];
    const ranked = later.filter((row) => row.match_mode === RANKED);
    const seasonOne = ranked.filter((row) => row.start_time < SEASON_1_END_S);
    const seasonTwo = ranked.filter((row) => row.start_time >= SEASON_1_END_S);
    const badges = (rows: readonly HistoryRow[]) => rows.map((row) => row.ranked_display_badge!);

    it("runs on the evening of 2026-12-02, UTC", () => {
        const scenario = dispatchSpecialsScenario(OPTIONS);
        expect(scenario.id).toBe("dispatch-specials");
        expect(SPECIALS_NOW_MS).toBe(Date.UTC(2026, 11, 2, 19, 30, 0));
        expect(scenario.now).toBe(SPECIALS_NOW_MS);
        start(scenario);
        const now = new Date();
        expect(now.toISOString().slice(0, 13)).toBe("2026-12-02T19");
        expect(Math.abs(Date.now() - SPECIALS_NOW_MS)).toBeLessThan(5000);
    });

    it("builds on the default scenario's modules and the dispatch module", () => {
        const names = dispatchSpecialsScenario(OPTIONS).modules.map((m) => m.name);
        expect(names).toEqual(dispatchScenario(OPTIONS).modules.map((m) => m.name));
    });

    describe("history", () => {
        it("keeps the default 60 matches and the older rows exactly as the dispatch scenario has them", async () => {
            start();
            const rows = await history();
            const byId = new Map(rows.map((row) => [row.match_id, row]));
            expect(rows).toHaveLength(olderRows(CONTEXT).length + later.length + 60);
            for (const row of historyRows(CONTEXT)) expect(byId.get(row.match_id)).toEqual(row);
            for (const id of MATCH_IDS) expect(byId.has(id)).toBe(true);
            for (const row of olderRows(CONTEXT)) expect(byId.get(row.match_id)).toEqual(row);
            expect(new Set(rows.map((row) => row.match_id)).size).toBe(rows.length);
            expect(rows.map((row) => row.start_time)).toEqual(rows.map((row) => row.start_time).sort((a, b) => b - a));
        });

        it("runs on through 2026-12-01, none of it later than the clock", () => {
            const newest = Math.max(...later.map((row) => row.start_time));
            expect(newest).toBeGreaterThanOrEqual(utc(2026, 11, 1));
            expect(newest).toBeLessThan(utc(2026, 11, 2));
            const oldest = Math.min(...later.map((row) => row.start_time));
            const newestDefault = Math.max(...historyRows(CONTEXT).map((row) => row.start_time));
            expect(oldest).toBeGreaterThan(newestDefault);
            expect(oldest - newestDefault).toBeLessThan(2 * DAY_S);
            expect(later.length).toBeGreaterThan(30);
            expect(later.length).toBeLessThan(80);
        });

        it("fills the weeks after the default 60 but leaves two quiet ones under 3 matches", () => {
            const per = new Map<number, number>();
            for (const row of [...later, ...historyRows(CONTEXT)]) {
                const week = Math.floor((row.start_time - FIRST_MONDAY_S) / WEEK_S);
                per.set(week, (per.get(week) ?? 0) + 1);
            }
            const firstAfter = Math.floor((utc(2026, 9, 19) - FIRST_MONDAY_S) / WEEK_S);
            const lastClosed = Math.floor((utc(2026, 10, 23) - FIRST_MONDAY_S) / WEEK_S);
            const counts = Array.from({ length: lastClosed - firstAfter + 1 }, (_, i) => per.get(firstAfter + i) ?? 0);
            expect(counts).toHaveLength(6);
            expect(counts.filter((c) => c < 3).length).toBeGreaterThanOrEqual(2);
            expect(counts.filter((c) => c >= 3).length).toBeGreaterThanOrEqual(3);
            expect(counts.at(-1)).toBeGreaterThanOrEqual(3);
        });

        it("has enough matches for November and for the year", () => {
            const inRange = (from: number, to: number) =>
                [...later, ...historyRows(CONTEXT)].filter((r) => r.start_time >= from && r.start_time < to);
            expect(inRange(utc(2026, 10, 1), utc(2026, 11, 1)).length).toBeGreaterThanOrEqual(8);
            expect(inRange(utc(2026, 9, 1), utc(2026, 10, 1)).length).toBeGreaterThanOrEqual(8);
            expect(generated.filter((r) => r.start_time < utc(2026, 11, 1)).length).toBeGreaterThan(450);
        });

        it("scores every ranked row from its change", () => {
            expect(ranked.length).toBeGreaterThan(20);
            for (const row of later) {
                if (row.match_mode === RANKED) {
                    expect(row.ranked_delta! > 0).toBe(row.player_match_outcome === 1);
                    expect(row.match_result === row.player_team).toBe(row.player_match_outcome === 1);
                } else {
                    expect(row.player_match_outcome).toBe(0);
                    expect(row.ranked_delta).toBeNull();
                    expect(row.ranked_display_badge).toBeNull();
                }
            }
        });
    });

    describe("ranked climb", () => {
        it("keeps the later rows in the season-1 range from the default history's rank, 86", () => {
            expect(seasonOne.length).toBeGreaterThan(12);
            expect(seasonOne[0]!.start_time).toBeGreaterThan(SEASON_1_START_S);
            expect(Math.abs(seasonOne[0]!.ranked_display_badge! - 86)).toBeLessThanOrEqual(4);
        });

        it("peaks inside season 1: it climbs past the default history's rank, then slips back", () => {
            const top = Math.max(...badges(seasonOne));
            const peak = seasonOne.findIndex((row) => row.ranked_display_badge === top);
            expect(top).toBeGreaterThanOrEqual(90);
            expect(peak).toBeGreaterThan(seasonOne.length * 0.25);
            expect(peak).toBeLessThan(seasonOne.length - 3);
            expect(top - seasonOne.at(-1)!.ranked_display_badge!).toBeGreaterThanOrEqual(2);
            expect(top).toBeGreaterThan(Math.max(...historyRows(CONTEXT).map((r) => r.ranked_display_badge ?? 0)));
        });

        it("steps by at most one tier-and-a-bit a match", () => {
            for (let i = 1; i < seasonOne.length; i++) {
                const step = Math.abs(seasonOne[i]!.ranked_display_badge! - seasonOne[i - 1]!.ranked_display_badge!);
                expect(step).toBeLessThanOrEqual(10);
            }
        });

        it("starts season 2 low: a few ranked rows after the season ended, far under the old ladder", () => {
            expect(seasonTwo.length).toBeGreaterThanOrEqual(4);
            expect(seasonTwo.length).toBeLessThanOrEqual(16);
            expect(seasonTwo[0]!.start_time).toBeGreaterThanOrEqual(SEASON_1_END_S);
            expect(Math.max(...badges(seasonTwo))).toBeLessThan(40);
            expect(Math.max(...badges(seasonTwo))).toBeLessThan(Math.min(...badges(seasonOne.slice(-10))) - 40);
            expect(seasonTwo[0]!.ranked_display_badge!).toBeLessThan(35);
            expect(seasonTwo[0]!.ranked_display_badge!).toBeGreaterThanOrEqual(21);
        });
    });

    describe("answers", () => {
        it("serves the ranked seasons as the live API does, in this scenario and in dispatch", async () => {
            expect(RANKED_SEASONS).toEqual([
                {
                    class_name: "season_1",
                    name: "Beta Season 1",
                    ranked_type: "normal",
                    intervals: [
                        { interval: 1, start_timestamp: 1785430800, end_timestamp: 1793916000, leaderboard_id: 1001 },
                        { interval: 2, start_timestamp: 1793916000, end_timestamp: 1830326400, leaderboard_id: 1002 },
                    ],
                },
            ]);
            start();
            expect(await api("/v1/assets/ranked-seasons")).toEqual(RANKED_SEASONS);
            handles.pop()!.uninstall();
            start(dispatchScenario(OPTIONS));
            expect(await api("/v1/assets/ranked-seasons")).toEqual(RANKED_SEASONS);
        });

        it("aggregates hero-stats over the later matches too", async () => {
            start();
            const min = utc(2026, 10, 23);
            const max = utc(2026, 10, 29) + DAY_S - 1;
            const stats = (await api(
                `/v1/players/hero-stats?account_ids=${IDENTITY.accountId}&min_unix_timestamp=${min}&max_unix_timestamp=${max}`,
            )) as { matches_played: number }[];
            const rows = later.filter((row) => row.start_time >= min && row.start_time <= max);
            expect(rows.length).toBeGreaterThanOrEqual(3);
            expect(stats.reduce((t, s) => t + s.matches_played, 0)).toBe(rows.length);
        });

        it("grades a later match like an older one", async () => {
            const handle = start();
            const row = later[5]!;
            const grade = (await handle.invoke("mvp_grade_match", { matchId: row.match_id })) as {
                matchId: number;
                players: { accountId: number; heroId: number }[];
            };
            expect(grade.matchId).toBe(row.match_id);
            expect(grade.players.find((p) => p.accountId === IDENTITY.accountId)!.heroId).toBe(row.hero_id);
        });
    });

    describe("determinism", () => {
        it("gives the same later rows every time, with ids clear of the other rows", () => {
            expect(laterRows(CONTEXT)).toEqual(later);
            const ids = new Set([...olderRows(CONTEXT), ...historyRows(CONTEXT)].map((row) => row.match_id));
            for (const row of later) expect(ids.has(row.match_id)).toBe(false);
            expect(new Set(later.map((row) => row.match_id)).size).toBe(later.length);
        });

        it("serves the same history on every install", async () => {
            start();
            const first = await history();
            handles.pop()!.uninstall();
            start();
            expect(await history()).toEqual(first);
        });

        it("leaves the default scenario alone", async () => {
            const scenario = defaultScenario(OPTIONS);
            expect(scenario.now).toBe(NOW_MS);
            start(scenario);
            expect((await history()).map((row) => row.match_id)).toEqual(MATCH_IDS);
        });
    });
});
