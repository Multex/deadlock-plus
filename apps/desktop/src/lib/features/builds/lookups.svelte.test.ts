import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadKit: vi.fn() }));
vi.mock("$lib/core/tauri", () => ({ command: vi.fn(), listen: vi.fn(), fileSrc: (p: string) => p }));
vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: {} }));
vi.mock("$lib/core/i18n.svelte", () => ({ i18n: { locale: "en", onLocaleChange: vi.fn() }, t: (key: string) => key }));
vi.mock("$lib/features/gamedata/vdata", () => ({ loadBuildTags: vi.fn(async () => []) }));
vi.mock("./build-detail.svelte", async (actual) => ({
    ...(await actual<typeof import("./build-detail.svelte")>()),
    loadKit: mocks.loadKit,
}));

import { BuildLookups } from "./lookups.svelte";

const KIT = { abilities: new Map([[7, { id: 7, name: "Lightning Ball" }]]), ultimateId: null, levels: [] };

describe("BuildLookups.loadKits", () => {
    it("holds a failed kit for a hero whose abilities cannot be read, so the ability order stops loading", async () => {
        mocks.loadKit.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(KIT);
        const lookups = new BuildLookups();
        lookups.loadKits([1]);
        await vi.waitFor(() => expect(lookups.kits.get(1)?.failed).toBeDefined());

        lookups.kits.get(1)!.failed!.retry();
        await vi.waitFor(() => expect(lookups.kits.get(1)).toBe(KIT));
        expect(mocks.loadKit).toHaveBeenCalledTimes(2);
    });
});
