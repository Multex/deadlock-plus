import type { LogEntry } from "@deadlock-plus/ipc-types/LogEntry";
import type { SharedMatch } from "@deadlock-plus/ipc-types/SharedMatch";
import { afterEach, describe, expect, it, vi } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { MATCH_IDS } from "./identity";
import { defaultScenario } from "./index";

const MAP_ITEMS_TSV = [
    "# header",
    "# header",
    "# header",
    "lane\t1\t2\t0\t3\t0,0,0;10,20,30",
    "shop\t0\t-\t-\t1\t2\t3\tcitadel_shop\t-\tShop\t1",
].join("\n");
const OPTIONS = { appVersion: "1.2.3", changelog: "# Changelog\n", mapItemsTsv: MAP_ITEMS_TSV };
const API = "https://api.deadlock-api.com";

describe("default scenario", () => {
    const handles: DemoHandle[] = [];
    const start = (scenario = defaultScenario(OPTIONS)) => {
        const handle = install(scenario);
        handles.push(handle);
        return handle;
    };
    const api = async (path: string) => (await fetch(API + path)).json();
    afterEach(() => {
        while (handles.length) handles.pop()!.uninstall();
        vi.restoreAllMocks();
    });

    it("is seen through the invented player", () => {
        const scenario = defaultScenario(OPTIONS);
        expect(scenario.identity).toMatchObject({ accountId: 90000001, persona: "Lantern" });
        expect(start(scenario).invoke("current_steam_account", {})).toMatchObject({
            steamId32: 90000001,
            steamId64: "76561198050265729",
            personaName: "Lantern",
        });
    });

    it("bans three heroes in a ranked match, none of them played", async () => {
        start();
        const ranked = [];
        for (const id of MATCH_IDS) {
            const match = await api(`/v1/matches/${id}/metadata`);
            if (match.banned_hero_ids.length) ranked.push(match);
        }
        expect(ranked.length).toBeGreaterThan(0);
        for (const match of ranked) {
            expect(match.banned_hero_ids).toHaveLength(3);
            const played = match.match_info.players.map((player: { hero_id: number }) => player.hero_id);
            expect(played.filter((hero: number) => match.banned_hero_ids.includes(hero))).toEqual([]);
        }
    });

    it("serves what the app injects: its version, its changelog and its map table", () => {
        const handle = start();
        expect(handle.invoke("app_info", {})).toMatchObject({ appVersion: "1.2.3" });
        expect(handle.invoke("changelog", {})).toBe("# Changelog\n");
        expect(handle.invoke("kv_get", { store: "app-settings", key: "lastSeenVersion" })).toBe("1.2.3");
        expect(handle.invoke("game_map_items", {})).toMatchObject({
            source: "game",
            table: {
                rows: [{ kind: "shop", team: 0, laneSlot: null, x: 1, y: 2, z: 3, name: "Shop", hasIcon: true }],
                lanes: [{ laneNum: 1, markerSlot: 2, startTeam: 0, midIndex: 3 }],
            },
        });
    });

    it("lists one match per match id, newest first, all before the scenario's now", async () => {
        const handle = start();
        const rows = (await api("/v1/players/90000001/match-history")) as { match_id: number; start_time: number }[];
        expect(rows.map((row) => row.match_id)).toEqual(MATCH_IDS);
        const times = rows.map((row) => row.start_time);
        expect(times).toEqual([...times].sort((a, b) => b - a));
        expect(times[0]).toBeLessThan(defaultScenario(OPTIONS).now / 1000);
        expect(await api("/v1/players/5/match-history")).toEqual([]);
        expect(handle.unhandled()).toEqual([]);
    });

    it("gives every install its own blocked regions, replays, pins, clean-up rules and mute list", () => {
        const scenario = defaultScenario(OPTIONS);
        const first = start(scenario);
        const pinnedBefore = first.invoke("list_pinned", {});
        const demosBefore = first.invoke("list_demos", {}) as { demos: { fileName: string }[] };
        const rulesBefore = first.invoke("list_cleanup_rules", {});
        const mutesBefore = first.invoke("read_voice_ban", {});

        first.invoke("block_server_groups", { groups: [{ id: "fra" }] });
        first.invoke("unblock_server_groups", { ids: ["hkg"] });
        first.invoke("set_pinned", { matchId: MATCH_IDS[0], pinned: true });
        first.invoke("delete_demos", { fileNames: [demosBefore.demos[1]!.fileName] });
        first.invoke("save_cleanup_rules", { rules: [] });
        first.invoke("write_voice_ban", { text: "" });
        first.invoke("storage_clear", { id: "shader-cache" });
        first.invoke("start_frame_capture", {});
        expect(first.invoke("list_blocked_group_ids", { candidateIds: ["fra", "hkg"] })).toEqual(["fra"]);
        expect((first.invoke("list_demos", {}) as typeof demosBefore).demos).toHaveLength(demosBefore.demos.length - 1);

        const second = start(scenario);
        expect(second.invoke("list_blocked_group_ids", { candidateIds: ["fra", "hkg"] })).toEqual(["hkg"]);
        expect(second.invoke("list_pinned", {})).toEqual(pinnedBefore);
        expect(second.invoke("list_demos", {})).toEqual(demosBefore);
        expect(second.invoke("list_cleanup_rules", {})).toEqual(rulesBefore);
        expect(second.invoke("read_voice_ban", {})).toEqual(mutesBefore);
        expect(second.invoke("storage_entry_stats", { id: "shader-cache" })).toMatchObject({
            bytes: 688 * 1024 * 1024,
        });
        expect(second.invoke("frame_capture_status", {})).toMatchObject({ state: "idle" });
    });

    it("works a match out again for each install", async () => {
        const scenario = defaultScenario(OPTIONS);
        start(scenario);
        const first = await api(`/v1/matches/${MATCH_IDS[4]}/metadata`);
        handles.pop()!.uninstall();
        start(scenario);
        expect(await api(`/v1/matches/${MATCH_IDS[4]}/metadata`)).toEqual(first);
        expect(first.match_info.players).toHaveLength(12);
    });

    it("answers a 404 for a match it does not know", async () => {
        start();
        const res = await fetch(`${API}/v1/matches/1/metadata`);
        expect(res.status).toBe(404);
        expect((await fetch(`${API}/v1/matches/${MATCH_IDS[0]}/metadata`)).status).toBe(200);
    });

    it("keeps the background work switches and the autostart switch once they are set", () => {
        const handle = start();
        handle.invoke("set_job_enabled", { id: "addon-scan", enabled: false });
        handle.invoke("set_job_policy", { id: "patch-notes-index", policy: "always" });
        handle.invoke("set_all_jobs_enabled", { enabled: false });
        expect(handle.invoke("jobs_snapshot", {})).toMatchObject({
            catalog: [
                { id: "addon-scan", enabled: false, policy: "pauseInGame" },
                { id: "match-grades", enabled: true, policy: "always", policyConfigurable: false },
                { id: "patch-notes-index", enabled: true, policy: "always" },
                { id: "server-block-sync", enabled: true },
            ],
            allEnabled: false,
        });

        const before = handle.invoke("autostart_status", {}) as { enabled: boolean };
        expect(handle.invoke("set_autostart", { enabled: !before.enabled })).toMatchObject({
            enabled: !before.enabled,
        });
        expect(handle.invoke("autostart_status", {})).toMatchObject({ enabled: !before.enabled });

        expect(start().invoke("jobs_snapshot", {})).toMatchObject({ allEnabled: true });
    });

    it("has no app-wide pause switch: each task's own setting decides", () => {
        const handle = start();
        expect(handle.invoke("jobs_snapshot", {})).not.toHaveProperty("pauseInGame");
        expect(() => handle.invoke("set_pause_in_game", { enabled: false })).toThrow();
    });

    it("has log lines the Logs page can show, and exports the same lines as text", () => {
        const handle = start();
        const entries = handle.invoke("read_logs", {}) as LogEntry[];
        expect(entries.length).toBeGreaterThan(5);
        for (const entry of entries) {
            expect(entry.time).toMatch(/^\d\d:\d\d:\d\d$/);
            expect(["ERROR", "WARN", "INFO", "DEBUG", "TRACE"]).toContain(entry.level);
            expect(entry.thread && entry.logger && entry.message).toBeTruthy();
        }
        const text = handle.invoke("export_logs", {}) as string;
        expect(text.startsWith("Deadlock+ 1.2.3 on Windows 11 Pro x86_64\n\n")).toBe(true);
        const first = entries[0]!;
        expect(text).toContain(
            `[${first.time}] [${first.thread} | ${first.level}] [${first.logger}]: ${first.message}`,
        );
        expect(text.trimEnd().split("\n")).toHaveLength(entries.length + 2);
        expect(handle.invoke("open_log_dir", {})).toBeNull();
    });

    it("builds a support report in the app's layout", () => {
        const report = start().invoke("build_support_report", {}) as string;
        expect(report.startsWith("Deadlock+ support report\n\n== App ==\n")).toBe(true);
        expect(report).toContain("version: 1.2.3\n");
        expect(report).toContain("\n== Crash ==\nnone\n");
        expect(report).toContain("\n== Log ==\n[");
        expect(report).not.toContain("Lantern");
    });

    it("exports the presence layout as JSON and takes it back", () => {
        const handle = start();
        const text = handle.invoke("export_presence_config", {}) as string;
        expect(JSON.parse(text)).toEqual(handle.invoke("presence_config", {}));
        const edited = { states: { inMatch: { details: "x" } }, variants: {}, heroes: {} };
        expect(handle.invoke("import_presence_config", { text: JSON.stringify(edited) })).toEqual(edited);
        expect(handle.invoke("presence_config", {})).toEqual(edited);
        expect(JSON.parse(handle.invoke("export_presence_config", {}) as string)).toEqual(edited);
        expect(() => handle.invoke("import_presence_config", { text: "[1]" })).toThrow("expected a JSON object");
        expect(() => handle.invoke("import_presence_config", { text: "{" })).toThrow();
    });

    it("answers the crash report commands with the report's path", () => {
        const handle = start();
        for (const command of ["write_crash_bundle", "reveal_crash_bundle", "open_crash_issue"]) {
            expect(handle.invoke(command, { id: "1760000000-panic" })).toMatch(
                /\\crashes\\deadlock-plus-crash-1760000000-panic\.txt$/,
            );
        }
    });

    it("reports a file as saved", () => {
        const handle = start();
        expect(handle.invoke("save_text_file", { defaultName: "mutes", extension: "txt", contents: "x" })).toBe(true);
        expect(handle.invoke("save_binary_file", new Uint8Array([1, 2]) as unknown as Record<string, unknown>)).toBe(
            true,
        );
    });

    it("lists recently shared matches, newest first, from every source", () => {
        const handle = start();
        const shared = handle.invoke("shared_matches", {}) as SharedMatch[];
        expect(shared.length).toBeGreaterThan(5);
        expect(shared.length).toBeLessThanOrEqual(50);
        expect(new Set(shared.map((m) => m.source))).toEqual(new Set(["steam", "deadlock", "login"]));
        const nowS = Date.now() / 1000;
        for (const m of shared) {
            expect(MATCH_IDS).toContain(m.matchId);
            expect(m.at).toBeLessThanOrEqual(nowS);
            expect(m.at).toBeGreaterThan(nowS - 30 * 86_400);
        }
        const times = shared.map((m) => m.at);
        expect(times).toEqual([...times].sort((a, b) => b - a));
        expect(shared.some((m) => !m.replay)).toBe(true);
    });
});
