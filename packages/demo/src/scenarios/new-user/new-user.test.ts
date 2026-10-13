import type { DemoListing } from "@deadlock-plus/ipc-types/DemoListing";
import type { ServerData } from "@deadlock-plus/ipc-types/ServerData";
import { afterEach, describe, expect, it } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { newUserScenario } from "./index";

const OPTIONS = { appVersion: "1.2.3", changelog: "# Changelog\n", mapItemsTsv: "" };
const API = "https://api.deadlock-api.com";

describe("new-user scenario", () => {
    const handles: DemoHandle[] = [];
    const start = (scenario = newUserScenario(OPTIONS)) => {
        const handle = install(scenario);
        handles.push(handle);
        return handle;
    };
    const api = async (path: string) => (await fetch(API + path)).json();
    const regionIds = (handle: DemoHandle) => {
        const data = handle.invoke("fetch_server_groups", {}) as ServerData;
        return [...new Set([...data.unclustered, ...data.clustered].map((group) => group.id))];
    };
    afterEach(() => {
        while (handles.length) handles.pop()!.uninstall();
    });

    it("has not been through the setup and has no saved settings", () => {
        const handle = start();
        expect(newUserScenario(OPTIONS).id).toBe("new-user");
        for (const key of ["onboardingVersion", "onboardingDone", "lastSeenVersion", "matchIngest", "telemetry"]) {
            expect(handle.invoke("kv_get", { store: "app-settings", key }), key).toBeNull();
        }
        expect(handle.invoke("kv_get", { store: "presets", key: "presets" })).toBeNull();
        expect(handle.invoke("kv_get", { store: "frame-runs", key: "runs" })).toBeNull();
    });

    it("finds the game but no Steam account, so the mute list has no file to read", () => {
        const handle = start();
        expect(handle.invoke("app_info", {})).toMatchObject({ appVersion: "1.2.3", gameDir: expect.any(String) });
        expect(handle.invoke("current_steam_account", {})).toBeNull();
        expect(handle.invoke("local_steam_account_ids", {})).toEqual([]);
        const refusal = { code: "voice_bans.no_account", params: {} };
        expect(() => handle.invoke("read_voice_ban", {})).toThrow(expect.objectContaining(refusal));
        expect(() => handle.invoke("write_voice_ban", { text: "" })).toThrow(expect.objectContaining(refusal));
    });

    it("has no replays, pins, clean-up rules, notifications or shared matches", () => {
        const handle = start();
        const listing = handle.invoke("list_demos", {}) as DemoListing;
        expect(listing).toMatchObject({ dir: expect.any(String), referenceBuild: null, demos: [] });
        expect(handle.invoke("list_pinned", {})).toEqual([]);
        expect(handle.invoke("list_cleanup_rules", {})).toEqual([]);
        expect(handle.invoke("cleanup_matches", {})).toEqual([]);
        expect(handle.invoke("storage_entry_stats", { id: "replays" })).toMatchObject({ bytes: 0, count: 0 });
        expect(handle.invoke("list_notifications", {})).toEqual([]);
        expect(handle.invoke("ingest_status", {})).toMatchObject({ running: false, submitted: 0 });
        expect(handle.invoke("gc_status", {})).toMatchObject({ running: false, delivered: 0 });
        expect(handle.invoke("autostart_status", {})).toMatchObject({ supported: true, enabled: false });
    });

    it("starts with the system once the setup turns that on", () => {
        const scenario = newUserScenario(OPTIONS);
        const handle = start(scenario);
        expect(handle.invoke("set_autostart", { enabled: true })).toMatchObject({ enabled: true });
        expect(handle.invoke("autostart_status", {})).toMatchObject({ enabled: true });
        expect(start(scenario).invoke("autostart_status", {})).toMatchObject({ enabled: false });
    });

    it("blocks no region until the user blocks one, and keeps that to its own install", () => {
        const scenario = newUserScenario(OPTIONS);
        const first = start(scenario);
        const candidateIds = regionIds(first);
        expect(candidateIds.length).toBeGreaterThan(10);
        expect(first.invoke("list_blocked_group_ids", { candidateIds })).toEqual([]);

        first.invoke("block_server_groups", { groups: [{ id: candidateIds[0] }] });
        expect(first.invoke("list_blocked_group_ids", { candidateIds })).toEqual([candidateIds[0]]);
        expect(start(scenario).invoke("list_blocked_group_ids", { candidateIds })).toEqual([]);
    });

    it("has no match history and no rank on the Deadlock API", async () => {
        const handle = start();
        const { accountId } = newUserScenario(OPTIONS).identity;
        expect(await api(`/v1/players/${accountId}/match-history`)).toEqual([]);
        expect(await api(`/v1/players/${accountId}/rank`)).toMatchObject({ badge: 0, last_match: null });
        expect(await api("/v1/info/health")).toMatchObject({ services: { clickhouse: true } });
        expect(handle.unhandled()).toEqual([]);
    });
});
