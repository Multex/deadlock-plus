import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { setPresenceConfig } = vi.hoisted(() => ({ setPresenceConfig: vi.fn(async () => {}) }));
vi.mock("./api", () => ({ setPresenceConfig }));

import { runBeforeExit } from "$lib/core/exit";
import { PresenceConfigStore, presenceConfigStore, type PresenceConfigApi } from "./config.svelte";

import type { PresenceConfig } from "@deadlock-plus/ipc-types/PresenceConfig";

const empty = (): PresenceConfig => ({ states: {}, variants: {}, heroes: {} });
const withDetails = (details: string): PresenceConfig => ({
    states: { inMatch: { details } },
    variants: {},
    heroes: {},
});

function fakeApi(overrides: Partial<PresenceConfigApi> = {}): PresenceConfigApi {
    return {
        presenceConfig: vi.fn(async () => withDetails("saved")),
        setPresenceConfig: vi.fn(async () => {}),
        presenceDefaults: vi.fn(async () => withDetails("default")),
        presenceLayout: vi.fn(async () => [{ id: "inMatch" as const, variants: [], heroScope: true }]),
        presencePlaceholders: vi.fn(async () => [
            { name: "hero", sensitive: false },
            { name: "matchId", sensitive: true },
        ]),
        exportPresenceConfig: vi.fn(async () => "{}"),
        importPresenceConfig: vi.fn(async () => withDetails("imported")),
        ...overrides,
    };
}

describe("PresenceConfigStore", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("loads config, defaults and layout", async () => {
        const store = new PresenceConfigStore(fakeApi());
        expect(store.status).toBe("loading");
        await store.load();
        expect(store.status).toBe("ready");
        expect(store.config.states.inMatch?.details).toBe("saved");
        expect(store.defaults.states.inMatch?.details).toBe("default");
        expect(store.layout).toHaveLength(1);
        expect(store.placeholders.map((p) => p.name)).toEqual(["hero", "matchId"]);
        expect(store.placeholders[1].sensitive).toBe(true);
        expect(store.error).toBeNull();
    });

    it("ends in the error status when loading fails", async () => {
        const store = new PresenceConfigStore(
            fakeApi({
                presenceConfig: vi.fn(async () => {
                    throw "boom";
                }),
            }),
        );
        await store.load();
        expect(store.status).toBe("error");
    });

    it("shows loading again while a retry runs, then ready", async () => {
        let fail = true;
        const store = new PresenceConfigStore(
            fakeApi({
                presenceLayout: vi.fn(async () => {
                    if (fail) throw "boom";
                    return [{ id: "inMatch" as const, variants: [], heroScope: true }];
                }),
            }),
        );
        await store.load();
        expect(store.status).toBe("error");
        fail = false;
        const retry = store.load();
        expect(store.status).toBe("loading");
        await retry;
        expect(store.status).toBe("ready");
    });

    it("updates state at once and saves after 400 ms", async () => {
        const api = fakeApi();
        const store = new PresenceConfigStore(api);
        store.edit(withDetails("a"));
        expect(store.config.states.inMatch?.details).toBe("a");
        await vi.advanceTimersByTimeAsync(399);
        expect(api.setPresenceConfig).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(api.setPresenceConfig).toHaveBeenCalledTimes(1);
        expect(api.setPresenceConfig).toHaveBeenCalledWith(withDetails("a"));
    });

    it("collapses rapid edits into one save of the latest config", async () => {
        const api = fakeApi();
        const store = new PresenceConfigStore(api);
        store.edit(withDetails("a"));
        await vi.advanceTimersByTimeAsync(300);
        store.edit(withDetails("b"));
        await vi.advanceTimersByTimeAsync(300);
        expect(api.setPresenceConfig).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(100);
        expect(api.setPresenceConfig).toHaveBeenCalledTimes(1);
        expect(api.setPresenceConfig).toHaveBeenCalledWith(withDetails("b"));
    });

    it("flush saves a pending edit immediately and only once", async () => {
        const api = fakeApi();
        const store = new PresenceConfigStore(api);
        store.edit(withDetails("a"));
        await store.flush();
        expect(api.setPresenceConfig).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(api.setPresenceConfig).toHaveBeenCalledTimes(1);
    });

    it("flush is a no-op without a pending edit", async () => {
        const api = fakeApi();
        const store = new PresenceConfigStore(api);
        await store.flush();
        expect(api.setPresenceConfig).not.toHaveBeenCalled();
    });

    it("loading again keeps an edit that was not saved yet", async () => {
        let saved = withDetails("saved");
        const api = fakeApi({
            presenceConfig: vi.fn(async () => saved),
            setPresenceConfig: vi.fn(async (config: PresenceConfig) => void (saved = config)),
        });
        const store = new PresenceConfigStore(api);
        await store.load();
        store.edit(withDetails("a"));
        await store.load();
        await vi.advanceTimersByTimeAsync(1000);
        expect(store.config.states.inMatch?.details).toBe("a");
        expect(saved).toEqual(withDetails("a"));
    });

    it("records a save failure in error", async () => {
        const store = new PresenceConfigStore(
            fakeApi({
                setPresenceConfig: vi.fn(async () => {
                    throw "disk full";
                }),
            }),
        );
        store.edit(withDetails("a"));
        await store.flush();
        expect(store.error).toBe("Couldn't save your Discord activity changes. Try again.");
    });

    it("imports text, replaces the config and drops a pending save", async () => {
        const api = fakeApi();
        const store = new PresenceConfigStore(api);
        store.edit(withDetails("a"));
        await store.importText("{}");
        expect(api.importPresenceConfig).toHaveBeenCalledWith("{}");
        expect(store.config.states.inMatch?.details).toBe("imported");
        await vi.advanceTimersByTimeAsync(1000);
        expect(api.setPresenceConfig).not.toHaveBeenCalled();
    });

    it("answers false for a bad import and keeps the config", async () => {
        const store = new PresenceConfigStore(
            fakeApi({
                importPresenceConfig: vi.fn(async () => {
                    throw "bad json";
                }),
            }),
        );
        store.edit(withDetails("a"));
        await expect(store.importText("nope")).resolves.toBe(false);
        expect(store.config.states.inMatch?.details).toBe("a");
    });

    it("saves pending edits before exporting", async () => {
        const api = fakeApi();
        const store = new PresenceConfigStore(api);
        store.edit(withDetails("a"));
        expect(await store.exportText()).toBe("{}");
        expect(api.setPresenceConfig).toHaveBeenCalledWith(withDetails("a"));
    });

    it("resetAll clears the config and saves at once", async () => {
        const api = fakeApi();
        const store = new PresenceConfigStore(api);
        store.edit(withDetails("a"));
        await store.resetAll();
        expect(store.config).toEqual(empty());
        expect(api.setPresenceConfig).toHaveBeenLastCalledWith(empty());
    });

    it("saves a pending edit before the app exits", async () => {
        presenceConfigStore.edit(withDetails("quit"));
        await runBeforeExit();
        expect(setPresenceConfig).toHaveBeenCalledWith(withDetails("quit"));
    });
});
