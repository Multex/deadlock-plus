import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => ({ values: new Map<string, unknown>(), set: vi.fn() }));

vi.mock("$lib/core/kv", () => ({
    kvGet: vi.fn(async (_store: string, key: string) => kv.values.get(key) ?? null),
    kvSet: kv.set,
}));
vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async () => null),
    listen: vi.fn(async () => () => {}),
    fileSrc: (p: string) => p,
}));
vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: {} }));

import { settings } from "./settings.svelte";

describe("front page after each match setting", () => {
    beforeEach(() => {
        kv.values.clear();
        kv.set.mockClear();
    });

    it("is on when nothing is stored", async () => {
        await settings.init();
        expect(settings.frontPageAfterMatch).toBe(true);
    });

    it("reads a stored choice", async () => {
        kv.values.set("frontPageAfterMatch", false);
        await settings.init();
        expect(settings.frontPageAfterMatch).toBe(false);
    });

    it("keeps the default for a value that is not a yes or no", async () => {
        kv.values.set("frontPageAfterMatch", "nope");
        await settings.init();
        expect(settings.frontPageAfterMatch).toBe(true);
    });

    it("saves a change to the app settings", async () => {
        await settings.setFrontPageAfterMatch(false);
        expect(settings.frontPageAfterMatch).toBe(false);
        expect(kv.set).toHaveBeenCalledWith("app-settings", "frontPageAfterMatch", false);
    });
});

describe("front page modes", () => {
    beforeEach(() => {
        kv.values.clear();
        kv.set.mockClear();
    });

    it("covers player matches and leaves bot and custom matches out by default", async () => {
        await settings.init();
        expect(settings.frontPageModes).toEqual({
            ranked: true,
            unranked: true,
            streetBrawl: true,
            other: true,
            bot: false,
            custom: false,
        });
    });

    it("reads stored changes and ignores values that are not a yes or no", async () => {
        kv.values.set("frontPageModes", { ranked: false, bot: true, custom: "yes", nonsense: false });
        await settings.init();
        expect(settings.frontPageModes).toMatchObject({ ranked: false, bot: true, custom: false, unranked: true });
        expect(settings.frontPageModes).not.toHaveProperty("nonsense");
    });

    it("stores only the modes that differ from the defaults", async () => {
        await settings.init();
        await settings.setFrontPageMode("bot", true);
        expect(kv.set).toHaveBeenLastCalledWith("app-settings", "frontPageModes", { bot: true });
        await settings.setFrontPageMode("ranked", false);
        expect(kv.set).toHaveBeenLastCalledWith("app-settings", "frontPageModes", { bot: true, ranked: false });
        await settings.setFrontPageMode("bot", false);
        await settings.setFrontPageMode("ranked", true);
        expect(kv.set).toHaveBeenLastCalledWith("app-settings", "frontPageModes", {});
        expect(settings.frontPageModes.ranked).toBe(true);
    });
});

describe("front page overlay alert", () => {
    beforeEach(() => {
        kv.values.clear();
        kv.set.mockClear();
    });

    it("is on when nothing is stored and reads a stored choice", async () => {
        await settings.init();
        expect(settings.frontPageOverlayAlert).toBe(true);
        kv.values.set("frontPageOverlayAlert", false);
        await settings.init();
        expect(settings.frontPageOverlayAlert).toBe(false);
    });

    it("saves a change", async () => {
        await settings.setFrontPageOverlayAlert(false);
        expect(settings.frontPageOverlayAlert).toBe(false);
        expect(kv.set).toHaveBeenCalledWith("app-settings", "frontPageOverlayAlert", false);
    });
});
