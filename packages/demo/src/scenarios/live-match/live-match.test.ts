import type { JobsSnapshot } from "@deadlock-plus/ipc-types/JobsSnapshot";
import type { LiveMatch } from "@deadlock-plus/ipc-types/LiveMatch";
import type { NetworkSnapshot } from "@deadlock-plus/ipc-types/NetworkSnapshot";
import type { VoiceBanFile } from "@deadlock-plus/ipc-types/VoiceBanFile";
import { afterEach, describe, expect, it, vi } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { liveMatchScenario } from "./index";

const OPTIONS = { appVersion: "1.2.3", changelog: "# Changelog\n", mapItemsTsv: "" };

/** Heroes a player can pick, as the public hero assets listed them on 2026-10-13. */
const PICKABLE = [1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 25, 27, 31, 35, 50, 52, 58, 60];

const API = "https://api.deadlock-api.com/v1";
const LASH = 31;
const ORACLE = "min_average_badge=81&max_average_badge=86";
const CURVE_METRICS = ["kills", "deaths", "assists", "net_worth", "player_damage", "boss_damage", "player_healing"];
const METRIC_KEYS = [
    "kills",
    "deaths",
    "assists",
    "net_worth_per_min",
    "player_damage_per_min",
    "boss_damage_per_min",
    "player_healing_per_min",
];
const PERCENTILES = [1, 5, 10, 25, 50, 75, 90, 95, 99];

async function get(path: string): Promise<unknown> {
    const response = await fetch(API + path);
    expect(response.status, path).toBe(200);
    return response.json();
}

describe("live-match scenario", () => {
    const handles: DemoHandle[] = [];
    const start = () => {
        const handle = install(liveMatchScenario(OPTIONS));
        handles.push(handle);
        return handle;
    };
    afterEach(() => {
        while (handles.length) handles.pop()!.uninstall();
        vi.unstubAllGlobals();
    });

    it("says the game is running in a match through every command that reports it", () => {
        const handle = start();
        expect(liveMatchScenario(OPTIONS).id).toBe("live-match");
        expect(handle.invoke("is_game_running", {})).toBe(true);
        expect((handle.invoke("jobs_snapshot", {}) as JobsSnapshot).gameRunning).toBe(true);
        expect(handle.invoke("get_live_state", {})).toEqual({ phase: "inMatch", matchPresent: true });
        expect((handle.invoke("read_voice_ban", {}) as VoiceBanFile).gameRunning).toBe(true);

        const snapshot = handle.invoke("network_snapshot", {}) as NetworkSnapshot;
        const poll = handle.invoke("network_poll", { sinceT: null }) as { snapshot: NetworkSnapshot };
        for (const network of [snapshot, poll.snapshot]) {
            expect(network).toMatchObject({ gameRunning: true, monitoring: true, traceError: null });
            expect(network.relay).toMatchObject({ description: expect.any(String), ping: { lossPct: 0 } });
            expect(network.relay!.ping.current).toBeGreaterThan(0);
        }

        const report = handle.invoke("build_support_report", {}) as string;
        expect(report).toContain("\nrunning: yes\n");
        expect(report).toContain("\ngame running: yes\n");
        expect(report).not.toMatch(/running: no\n/);
    });

    it("refuses a change to the mute list while the game runs, as the app does", () => {
        const handle = start();
        const before = handle.invoke("read_voice_ban", {});
        expect(() => handle.invoke("write_voice_ban", { text: "" })).toThrow(
            expect.objectContaining({ code: "voice_bans.game_running" }),
        );
        expect(handle.invoke("read_voice_ban", {})).toEqual(before);
    });

    it("is a ranked six against six seen from The Hidden King's side", () => {
        const { identity } = liveMatchScenario(OPTIONS);
        const match = start().invoke("get_live_match", {}) as LiveMatch;
        expect(match).toMatchObject({
            matchMode: "ranked",
            gameMode: "normal",
            perspective: "playing",
            yourSide: "amber",
            paused: false,
            queue: null,
        });
        expect(match.clockSecs).toBeGreaterThan(600);
        expect(match.teams.map((team) => team.side)).toEqual(["amber", "sapphire"]);

        const players = match.teams.flatMap((team) => team.players);
        expect(match.teams.map((team) => team.players.length)).toEqual([6, 6]);
        expect(new Set(players.map((player) => player.key)).size).toBe(12);
        expect(new Set(players.map((player) => player.heroId)).size).toBe(12);
        expect(new Set(players.map((player) => player.steamId)).size).toBe(12);
        for (const team of match.teams) {
            for (const player of team.players) expect(player.side).toBe(team.side);
        }

        const you = players.filter((player) => player.isYou);
        expect(you).toHaveLength(1);
        expect(you[0]).toMatchObject({ side: "amber", name: identity.persona, steamId: identity.steamId64 });

        for (const player of players) {
            expect(PICKABLE, `hero ${player.heroId}`).toContain(player.heroId);
            expect(player.isYou || identity.names.includes(player.name!), `name ${player.name}`).toBe(true);
            expect(player.steamId).toMatch(/^7656119\d{10}$/);
            const [tier, subrank] = [Math.floor(player.rank! / 10), player.rank! % 10];
            expect(tier).toBeGreaterThanOrEqual(1);
            expect(tier).toBeLessThanOrEqual(11);
            expect(subrank).toBeGreaterThanOrEqual(1);
            expect(subrank).toBeLessThanOrEqual(6);
        }
    });

    it("keeps its numbers consistent: team souls, and every kill is the other team's death", () => {
        const match = start().invoke("get_live_match", {}) as LiveMatch;
        const [amber, sapphire] = match.teams as [LiveMatch["teams"][0], LiveMatch["teams"][0]];
        const sum = (team: typeof amber, column: "souls" | "kills" | "deaths" | "assists") =>
            team.players.reduce((total, player) => total + player[column]!, 0);

        for (const team of [amber, sapphire]) expect(team.souls).toBe(sum(team, "souls"));
        expect(sum(amber, "kills")).toBe(sum(sapphire, "deaths"));
        expect(sum(sapphire, "kills")).toBe(sum(amber, "deaths"));
        for (const team of [amber, sapphire]) {
            // At most five team-mates can assist a kill.
            expect(sum(team, "assists")).toBeLessThanOrEqual(sum(team, "kills") * 5);
            for (const player of team.players) {
                expect(player.souls! / (match.clockSecs! / 60)).toBeGreaterThan(600);
                expect(player.souls! / (match.clockSecs! / 60)).toBeLessThan(2000);
            }
        }
    });

    it("gives every player a self healing that is part of their healing, so the split has two sides", () => {
        const match = start().invoke("get_live_match", {}) as LiveMatch;
        for (const player of match.teams.flatMap((team) => team.players)) {
            expect(player.selfHealing, player.name!).toEqual(expect.any(Number));
            expect(player.selfHealing!).toBeGreaterThan(0);
            expect(player.selfHealing!).toBeLessThanOrEqual(player.healing!);
        }
        const you = match.teams.flatMap((team) => team.players).find((player) => player.isYou)!;
        expect(you.selfHealing!).toBeLessThan(you.healing!);
    });

    describe("Deadlock API analytics", () => {
        const startOffline = () => {
            vi.stubGlobal(
                "fetch",
                vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
            );
            return start();
        };

        it("answers the performance curve: cumulative points at 3, 6, 9, 12 and 15 minutes, then every 5", async () => {
            startOffline();
            const curve = (await get(
                `/analytics/player-performance-curve?resolution=0&hero_ids=${LASH}&game_mode=normal&${ORACLE}`,
            )) as Record<string, number>[];
            expect(curve.map((point) => point.game_time)).toEqual([
                180, 360, 540, 720, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000,
            ]);
            for (const metric of CURVE_METRICS) {
                const avgs = curve.map((point) => point[`${metric}_avg`]!);
                for (const point of curve) {
                    expect(point[`${metric}_avg`], metric).toBeGreaterThan(0);
                    expect(point[`${metric}_std`], metric).toBeGreaterThan(0);
                }
                expect(avgs, metric).toEqual([...avgs].sort((a, b) => a - b));
            }
            // Early on most players have no kill yet, so the spread is wider than the average.
            expect(curve[0]!.kills_std).toBeGreaterThan(curve[0]!.kills_avg!);
            expect(curve.at(-1)!.kills_std).toBeLessThan(curve.at(-1)!.kills_avg!);
        });

        it("answers the stat distributions with sketch percentiles that never go down", async () => {
            startOffline();
            const metrics = (await get(
                `/analytics/player-stats/metrics?hero_ids=${LASH}&game_mode=normal&${ORACLE}`,
            )) as Record<string, Record<string, number>>;
            for (const key of METRIC_KEYS) {
                const entry = metrics[key]!;
                expect(entry, key).toMatchObject({ avg: expect.any(Number), std: expect.any(Number) });
                expect(entry.avg, key).toBeGreaterThan(0);
                const values = PERCENTILES.map((p) => entry[`percentile${p}`]!);
                expect(values, key).toEqual([...values].sort((a, b) => a - b));
                expect(values[4]!, key).toBeLessThan(values[8]!);
            }
        });

        it("answers hero stats with one row per hero and enough matches for Lash at Oracle", async () => {
            startOffline();
            const rows = (await get(`/analytics/hero-stats?game_mode=normal&${ORACLE}`)) as {
                hero_id: number;
                matches: number;
            }[];
            expect(rows.map((row) => row.hero_id).sort((a, b) => a - b)).toEqual(PICKABLE);
            for (const row of rows) expect(row.matches).toBeGreaterThan(0);
            expect(rows.find((row) => row.hero_id === LASH)!.matches).toBeGreaterThanOrEqual(200);
            const all = (await get("/analytics/hero-stats?game_mode=normal")) as typeof rows;
            expect(all.find((row) => row.hero_id === LASH)!.matches).toBeGreaterThan(
                rows.find((row) => row.hero_id === LASH)!.matches,
            );
        });

        it("answers the lobby's ranks, leaving out opted-out accounts", async () => {
            const match = startOffline().invoke("get_live_match", {}) as LiveMatch;
            const ids = match.teams
                .flatMap((team) => team.players)
                .map((player) => Number(BigInt(player.steamId!) - 76561197960265728n));
            const rows = (await get(`/players/rank?account_ids=${ids.join(",")}`)) as {
                account_id: number;
                badge: number;
                rank: number;
                subrank: number;
                last_match: { start_time: number } | null;
            }[];
            expect(rows.length).toBeGreaterThanOrEqual(8);
            expect(rows.length).toBeLessThan(ids.length);
            for (const row of rows) {
                expect(ids).toContain(row.account_id);
                expect(row.badge === 0 || row.badge === row.rank * 10 + row.subrank, String(row.account_id)).toBe(true);
            }
            expect(rows.find((row) => row.account_id === ids[0])).toMatchObject({ badge: 86 });
            expect(rows.some((row) => row.badge === 0 && row.last_match === null)).toBe(true);
            expect(rows.filter((row) => row.badge > 0).every((row) => row.last_match !== null)).toBe(true);
        });
    });
});
