import { afterEach, describe, expect, it, vi } from "vitest";
import { createBackend } from "./backend";
import {
    createFaultSet,
    FAULT_ERROR,
    GARBAGE,
    isMissingArtUrl,
    missingArtUrl,
    parseFaults,
    selectFaults,
    SLOW_API_MS,
    type Fault,
} from "./faults";
import { createFetch, type ApiRoute } from "./fetch";
import { defineScenario, install, type DemoHandle } from "./scenario";

const API = "https://api.deadlock-api.com";
const ROUTES: ApiRoute[] = [[/^\/v1\/players\/\d+\/rank$/, () => ({ rank: 1 })]];
const real = () => vi.fn(async () => new Response("real"));

const backendWith = (faults: Fault[]) =>
    createBackend(
        {
            gc_status: () => ({ ok: true }),
            game_item_art: () => [{ className: "upgrade_a", path: "https://assets.example/a.webp" }],
            game_minimap_art: () => ({ status: "ready", path: "C:\\Game\\minimap.png", radius: 10752 }),
        },
        { "app-settings": { theme: "default", locale: "en" } },
        createFaultSet(faults),
    );

describe("fault query", () => {
    it("reads command, API and art faults from the query value", () => {
        expect(parseFaults("command:gc_status:throw,api:/v1/players:503,art:missing")).toEqual([
            { command: "gc_status", mode: "throw" },
            { api: "/v1/players", mode: "503" },
            { art: "missing" },
        ]);
    });

    it("reads an empty API prefix as every path, and a command fault's key and error code", () => {
        expect(
            parseFaults("api::drop,command:kv_get:null:key=app-settings/theme,command:x:throw:code=common.network"),
        ).toEqual([
            { api: "", mode: "drop" },
            { command: "kv_get", mode: "null", key: "app-settings/theme" },
            { command: "x", mode: "throw", error: { code: "common.network", params: {} } },
        ]);
    });

    it("rejects an entry it cannot read, naming it", () => {
        expect(() => parseFaults("command:gc_status:explode")).toThrow("command:gc_status:explode");
        expect(() => parseFaults("api:/v1:418")).toThrow("api:/v1:418");
        expect(() => parseFaults("art:present")).toThrow("art:present");
        expect(() => parseFaults("disk:full")).toThrow("disk:full");
    });

    it("has no faults without a query", () => {
        expect(parseFaults(null)).toEqual([]);
        expect(parseFaults("")).toEqual([]);
    });

    it("takes the faults a test set on the page over the query", () => {
        const hook: Fault[] = [{ art: "missing" }];
        expect(selectFaults({ hook, query: "api::503" })).toBe(hook);
        expect(selectFaults({ query: "api::503" })).toEqual([{ api: "", mode: "503" }]);
        expect(selectFaults({})).toEqual([]);
    });
});

describe("command faults", () => {
    it("throw: rejects with the app's internal error, or the one the fault names", () => {
        expect(() => backendWith([{ command: "gc_status", mode: "throw" }]).handle("gc_status", {})).toThrow(
            expect.objectContaining(FAULT_ERROR),
        );
        const named = backendWith([{ command: "gc_status", mode: "throw", error: { code: "gc.offline" } }]);
        expect(() => named.handle("gc_status", {})).toThrow(
            expect.objectContaining({ code: "gc.offline", params: {} }),
        );
    });

    it("null: answers null in place of the handler", () => {
        expect(backendWith([{ command: "gc_status", mode: "null" }]).handle("gc_status", {})).toBeNull();
    });

    it("hang: never settles", async () => {
        const answer = backendWith([{ command: "gc_status", mode: "hang" }]).handle("gc_status", {});
        expect(answer).toBeInstanceOf(Promise);
        const settled = await Promise.race([
            (answer as Promise<unknown>).then(() => "settled"),
            new Promise((resolve) => setTimeout(() => resolve("pending"), 20)),
        ]);
        expect(settled).toBe("pending");
    });

    it("garbage: answers a value of the wrong shape, as a copy", () => {
        const backend = backendWith([{ command: "gc_status", mode: "garbage" }]);
        const answer = backend.handle("gc_status", {}) as Record<string, unknown>;
        expect(answer).toEqual(GARBAGE);
        answer.edited = true;
        expect(backend.handle("gc_status", {})).toEqual(GARBAGE);
    });

    it("leaves other commands alone", () => {
        expect(backendWith([{ command: "gc_status", mode: "null" }]).handle("game_item_art", {})).toHaveLength(1);
    });

    it("applies before the built-in key-value commands, to one key when the fault names it", () => {
        const backend = backendWith([{ command: "kv_get", mode: "throw", key: "app-settings/theme" }]);
        expect(() => backend.handle("kv_get", { store: "app-settings", key: "theme" })).toThrow();
        expect(backend.handle("kv_get", { store: "app-settings", key: "locale" })).toBe("en");

        const everyKey = backendWith([{ command: "kv_set", mode: "throw" }]);
        expect(() => everyKey.handle("kv_set", { store: "app-settings", key: "theme", value: "x" })).toThrow();
        expect(everyKey.handle("kv_get", { store: "app-settings", key: "theme" })).toBe("default");
    });

    it("fails a command that has no handler the way it names, not as unhandled", () => {
        const backend = backendWith([{ command: "not_written_yet", mode: "null" }]);
        expect(backend.handle("not_written_yet", {})).toBeNull();
        expect(backend.unhandled()).toEqual([]);
    });
});

describe("API faults", () => {
    const faulted = (fault: Fault, network = real()) => createFetch(ROUTES, network, createFaultSet([fault]));

    it("503: answers every path under the prefix with a server error, routed or not", async () => {
        const network = real();
        const fetch = faulted({ api: "/v1/players", mode: "503" }, network);
        expect((await fetch(`${API}/v1/players/1/rank`)).status).toBe(503);
        expect((await fetch(`${API}/v1/players/steam`)).status).toBe(503);
        expect(await (await fetch(`${API}/v1/matches/1`)).text()).toBe("real");
        expect(network).toHaveBeenCalledTimes(1);
    });

    it("429: answers as the API does when the quota is spent", async () => {
        const response = await faulted({ api: "", mode: "429" })(`${API}/v1/players/1/rank`);
        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBe("12");
        expect(await response.json()).toMatchObject({ remaining: 0 });
    });

    it("drop: rejects as a dropped connection does", async () => {
        await expect(faulted({ api: "", mode: "drop" })(`${API}/v1/players/1/rank`)).rejects.toThrow(
            new TypeError("Failed to fetch"),
        );
    });

    it("garbage: answers 200 with a body of the wrong shape", async () => {
        const response = await faulted({ api: "/v1", mode: "garbage" })(`${API}/v1/players/1/rank`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(GARBAGE);
    });

    it("slow: answers as usual, late", async () => {
        vi.useFakeTimers();
        try {
            const pending = faulted({ api: "", mode: "slow" })(`${API}/v1/players/1/rank`);
            let done = false;
            void pending.then(() => (done = true));
            await vi.advanceTimersByTimeAsync(SLOW_API_MS - 1);
            expect(done).toBe(false);
            await vi.advanceTimersByTimeAsync(1);
            expect(await (await pending).json()).toEqual({ rank: 1 });
        } finally {
            vi.useRealTimers();
        }
    });

    it("leaves other hosts alone", async () => {
        const network = real();
        await faulted({ api: "", mode: "503" }, network)("https://assets.example/v1/players/1/rank");
        expect(network).toHaveBeenCalledTimes(1);
    });
});

describe("missing art", () => {
    it("points every image an art command answers at a URL that does not load", async () => {
        const backend = backendWith([{ art: "missing" }]);
        const [item] = (await backend.handle("game_item_art", {})) as { className: string; path: string }[];
        expect(item!.className).toBe("upgrade_a");
        expect(isMissingArtUrl(item!.path)).toBe(true);
        const minimap = (await backend.handle("game_minimap_art", {})) as { status: string; path: string };
        expect(minimap.status).toBe("ready");
        expect(isMissingArtUrl(minimap.path)).toBe(true);
    });

    it("leaves art alone without the fault, and other commands alone with it", async () => {
        expect(await backendWith([]).handle("game_item_art", {})).toEqual([
            { className: "upgrade_a", path: "https://assets.example/a.webp" },
        ]);
        expect(backendWith([{ art: "missing" }]).handle("gc_status", {})).toEqual({ ok: true });
    });

    it("keeps the file name in the missing URL, so each image stays apart", () => {
        expect(missingArtUrl("C:\\Game\\minimap.png")).not.toBe(missingArtUrl("https://assets.example/a.webp"));
        expect(isMissingArtUrl(missingArtUrl("a.png"))).toBe(true);
        expect(isMissingArtUrl("https://assets.example/a.webp")).toBe(false);
    });
});

describe("faults on an install", () => {
    let handle: DemoHandle | undefined;
    afterEach(() => {
        handle?.uninstall();
        vi.unstubAllGlobals();
    });

    const scenario = defineScenario({
        id: "test",
        identity: { accountId: 1, steamId64: "1", persona: "Lantern", names: [] },
        now: Date.UTC(2026, 9, 12),
        seed: 1,
        modules: [
            {
                name: "m",
                create: () => ({ handlers: { gc_status: () => "ok" }, routes: [[/^\/v1\/x$/, () => "routed"]] }),
            },
        ],
    });

    it("starts with the faults it is given, on commands and on the API", async () => {
        vi.stubGlobal("fetch", real());
        handle = install(scenario, {
            faults: [
                { command: "gc_status", mode: "null" },
                { api: "", mode: "503" },
            ],
        });
        expect(handle.invoke("gc_status", {})).toBeNull();
        expect((await fetch(`${API}/v1/x`)).status).toBe(503);
        expect(handle.faults()).toHaveLength(2);
    });

    it("takes a fault while running, newest first, and clears them all", async () => {
        vi.stubGlobal("fetch", real());
        handle = install(scenario, { faults: [{ command: "gc_status", mode: "null" }] });
        handle.fault({ command: "gc_status", mode: "garbage" });
        handle.fault({ api: "/v1", mode: "drop" });
        expect(handle.invoke("gc_status", {})).toEqual(GARBAGE);
        await expect(fetch(`${API}/v1/x`)).rejects.toThrow("Failed to fetch");

        handle.clearFaults();
        expect(handle.faults()).toEqual([]);
        expect(handle.invoke("gc_status", {})).toBe("ok");
        expect(await (await fetch(`${API}/v1/x`)).json()).toBe("routed");
    });

    it("runs as before with no faults", async () => {
        vi.stubGlobal("fetch", real());
        handle = install(scenario);
        expect(handle.invoke("gc_status", {})).toBe("ok");
        expect(handle.faults()).toEqual([]);
    });
});
