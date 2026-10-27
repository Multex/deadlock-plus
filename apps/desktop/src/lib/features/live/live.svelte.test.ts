import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async (name: string) => (name === "get_live_match" ? { garbage: true } : null)),
    listen: vi.fn(async () => () => {}),
}));
vi.mock("$lib/features/heroes/heroes", () => ({
    lacksDiscordArt: () => false,
    loadHeroes: vi.fn(async () => ({})),
    onHeroesRefreshed: () => () => {},
}));
vi.mock("$lib/features/ranks/ranks", () => ({ loadRankTiers: vi.fn(async () => []) }));
vi.mock("$lib/features/gamedata/art-refresh", () => ({ keepGameArt: () => () => {} }));

import { live } from "./live.svelte";

describe("live store", () => {
    it("shows no live match when get_live_match answers garbage", async () => {
        const stop = live.start();
        await vi.waitFor(async () => {
            const { command } = await import("$lib/core/tauri");
            expect(command).toHaveBeenCalledWith("get_live_match");
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(live.match).toBeNull();
        stop();
    });
});
