import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/core/tauri", () => ({ command: vi.fn(async () => ({ garbage: true })), fileSrc: (p: string) => p }));
vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: {} }));
vi.mock("$lib/features/gamedata/gamedata", () => ({ loadHeroMinimapArt: vi.fn() }));
vi.mock("$lib/features/heroes/heroes", () => ({ loadHeroes: vi.fn() }));

import { loadPopularItems } from "$lib/features/gamedata/vdata";
import { HeroPopularity } from "./popularity.svelte";

describe("HeroPopularity", () => {
    it("shows no game popular items when the game answers garbage", async () => {
        const popularity = new HeroPopularity({
            loadGame: loadPopularItems,
            itemStats: async () => [],
            heroStats: async () => [],
            loadIcon: async () => null,
        });
        await expect(popularity.load(7)).resolves.toBeUndefined();
        expect(popularity.game.size).toBe(0);
        expect(popularity.loading).toBe(false);
    });
});
