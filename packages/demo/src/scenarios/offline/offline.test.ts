import type { GcStatus } from "@deadlock-plus/ipc-types/GcStatus";
import type { DemoListing } from "@deadlock-plus/ipc-types/DemoListing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { apiDownScenario, offlineScenario, rateLimitedScenario } from "./index";

const OPTIONS = { appVersion: "1.2.3", changelog: "# Changelog\n", mapItemsTsv: "" };
const API = "https://api.deadlock-api.com";
const PATHS = [
    "/v1/info/health",
    "/v1/assets/heroes",
    "/v1/assets/ranks",
    "/v1/players/90000001/match-history",
    "/v1/players/90000001/rank",
    "/v1/players/steam?account_ids=90000002",
    "/v1/players/steam-search?search_query=sa",
    "/v1/matches/990000060/metadata",
];

describe("offline scenarios", () => {
    const handles: DemoHandle[] = [];
    const network = vi.fn(async () => new Response("from the network"));
    const start = (scenario = offlineScenario(OPTIONS)) => {
        vi.stubGlobal("fetch", network);
        const handle = install(scenario);
        handles.push(handle);
        return handle;
    };
    afterEach(() => {
        while (handles.length) handles.pop()!.uninstall();
        vi.unstubAllGlobals();
        network.mockClear();
    });

    it("fails every Deadlock API request the way a dropped connection does, without reaching the network", async () => {
        start();
        expect(offlineScenario(OPTIONS).id).toBe("offline");
        for (const path of PATHS) {
            await expect(fetch(API + path), path).rejects.toThrow(new TypeError("Failed to fetch"));
        }
        expect(network).not.toHaveBeenCalled();
    });

    it("answers every Deadlock API request with a 503 when the API is up but broken", async () => {
        start(apiDownScenario(OPTIONS));
        expect(apiDownScenario(OPTIONS).id).toBe("api-down");
        for (const path of PATHS) {
            const response = await fetch(API + path);
            expect([response.status, response.ok], path).toEqual([503, false]);
            await expect(response.json(), path).rejects.toThrow();
        }
        expect(network).not.toHaveBeenCalled();
    });

    it("leaves other hosts to the network", async () => {
        start();
        expect(await (await fetch("https://example.invalid/v1/info/health")).text()).toBe("from the network");
    });

    it.each([
        ["offline", offlineScenario],
        ["api-down", apiDownScenario],
    ])("keeps local commands working in %s, with no game data to read from the API", async (_, scenario) => {
        const handle = start(scenario(OPTIONS));
        expect(handle.invoke("current_steam_account", {})).toMatchObject({ personaName: "Lantern" });
        expect((handle.invoke("list_demos", {}) as DemoListing).demos.length).toBeGreaterThan(0);
        expect(handle.invoke("read_logs", {})).not.toEqual([]);

        for (const command of ["game_items", "game_accolades", "game_hero_art", "game_minimap_icons"]) {
            expect(await handle.invoke(command, { icons: ["shop"] }), command).toEqual([]);
        }
        for (const command of ["game_item_art", "game_ability_art"]) {
            expect(await handle.invoke(command, { names: ["upgrade_x"], kind: "shop" }), command).toEqual([]);
        }
        expect(await handle.invoke("game_minimap_art", {})).toEqual({ status: "unavailable", local: "noInstall" });
        expect(await handle.invoke("game_hero_backdrop", { heroId: 1 })).toBeNull();
        expect(await handle.invoke("game_hero_mood", { heroId: 1, mood: "gloat" })).toBeNull();
        expect(network).not.toHaveBeenCalled();
        expect(handle.unhandled()).toEqual([]);
    });

    it("answers every Deadlock API request with a real-shaped 429 when rate limited", async () => {
        start(rateLimitedScenario(OPTIONS));
        expect(rateLimitedScenario(OPTIONS).id).toBe("rate-limited");
        for (const path of PATHS) {
            const response = await fetch(API + path);
            expect([response.status, response.ok], path).toEqual([429, false]);
            expect(response.headers.get("Retry-After"), path).toBe("12");
            expect(response.headers.get("RateLimit-Limit"), path).toBe("30");
            expect(response.headers.get("RateLimit-Period"), path).toBe("60");
            expect(response.headers.get("RateLimit-Remaining"), path).toBe("0");
            expect(response.headers.get("RateLimit-Reset"), path).toBe("12");
            expect(await response.json(), path).toEqual({
                type: "ip",
                quota: { limit: 30, period: 60 },
                requests: 31,
                remaining: 0,
                next_request_in: 12,
            });
        }
        expect(network).not.toHaveBeenCalled();
    });

    it("fails the coverage check and ends own recovery incomplete when rate limited", async () => {
        const handle = start(rateLimitedScenario(OPTIONS));
        expect(() => handle.invoke("match_detail_coverage", { matchIds: [990000060] })).toThrow(
            expect.objectContaining({ code: "common.network", params: {} }),
        );
        const status = (await handle.invoke("gc_status", {})) as GcStatus;
        expect(status.ownRecovery).toMatchObject({
            running: false,
            outcome: "incomplete",
            error: { code: "common.network", params: {} },
        });
        expect(status.lastRun).toMatchObject({ outcome: "incomplete" });
    });
});
