import type { JobsSnapshot } from "@deadlock-plus/ipc-types/JobsSnapshot";
import type { LiveMatch } from "@deadlock-plus/ipc-types/LiveMatch";
import type { NetworkSnapshot } from "@deadlock-plus/ipc-types/NetworkSnapshot";
import type { VoiceBanFile } from "@deadlock-plus/ipc-types/VoiceBanFile";
import { afterEach, describe, expect, it } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { liveMatchScenario } from "./index";

const OPTIONS = { appVersion: "1.2.3", changelog: "# Changelog\n", mapItemsTsv: "" };

/** Heroes a player can pick, as the public hero assets listed them on 2026-10-13. */
const PICKABLE = [1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 25, 27, 31, 35, 50, 52, 58, 60];

describe("live-match scenario", () => {
    const handles: DemoHandle[] = [];
    const start = () => {
        const handle = install(liveMatchScenario(OPTIONS));
        handles.push(handle);
        return handle;
    };
    afterEach(() => {
        while (handles.length) handles.pop()!.uninstall();
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
});
