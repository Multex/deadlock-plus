import { beforeEach, describe, expect, it, vi } from "vitest";
import { command } from "$lib/core/tauri";
import { deadlockApi } from "$lib/core/deadlock-api";
import { loadHeroes, type Hero } from "$lib/features/heroes/heroes";
import { heroBackdrop, heroPortrait } from "./art";

vi.mock("$lib/features/heroes/heroes", () => ({ loadHeroes: vi.fn() }));
vi.mock("$lib/core/tauri", () => ({ command: vi.fn(), fileSrc: (path: string) => `asset://${path}` }));
vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: { heroes: vi.fn() } }));

const api = vi.mocked(deadlockApi.heroes);

const invoke = vi.mocked(command);

const heroes = vi.mocked(loadHeroes);

const hero = (id: number, portrait: string | null): Hero => ({
    id,
    name: `Hero ${id}`,
    icon: null,
    portrait,
    artIcon: null,
    hideoutLine: null,
});

beforeEach(() => {
    heroes.mockReset();
    invoke.mockReset();
    api.mockReset();
});

describe("heroPortrait", () => {
    it("returns the hero's card cutout and asks the store for that hero", async () => {
        heroes.mockResolvedValue({ 15: hero(15, "asset://C:/art/hero_haze_card.png") });
        expect(await heroPortrait(15)).toBe("asset://C:/art/hero_haze_card.png");
        expect(heroes).toHaveBeenCalledWith([15]);
    });

    it("falls back to the API card the store already merged in", async () => {
        heroes.mockResolvedValue({ 15: hero(15, "https://assets-bucket.deadlock-api.com/haze_card.png") });
        expect(await heroPortrait(15)).toBe("https://assets-bucket.deadlock-api.com/haze_card.png");
    });

    it("is null for a hero the roster lacks", async () => {
        heroes.mockResolvedValue({ 15: hero(15, "asset://x.png") });
        expect(await heroPortrait(99)).toBeNull();
    });

    it("is null when the hero has no art", async () => {
        heroes.mockResolvedValue({ 15: hero(15, null) });
        expect(await heroPortrait(15)).toBeNull();
    });

    it("is null when the roster cannot load", async () => {
        heroes.mockRejectedValue(new Error("offline"));
        expect(await heroPortrait(15)).toBeNull();
    });
});

describe("heroBackdrop", () => {
    it("asks the game for that hero's backdrop and returns it as an asset url", async () => {
        invoke.mockResolvedValue("C:/art/hero_haze_bg.png");
        expect(await heroBackdrop(15)).toBe("asset://C:/art/hero_haze_bg.png");
        expect(invoke).toHaveBeenCalledWith("game_hero_backdrop", { heroId: 15 });
    });

    it("is null when the hero has no backdrop", async () => {
        invoke.mockResolvedValue(null);
        expect(await heroBackdrop(15)).toBeNull();
    });

    it("is null when the command fails", async () => {
        invoke.mockRejectedValue(new Error("no game"));
        expect(await heroBackdrop(15)).toBeNull();
    });
});

describe("heroMood", () => {
    const API_ROWS = [
        {
            id: 15,
            images: {
                hero_card_gloat_webp: "https://cdn/haze_card_gloat.webp",
                hero_card_gloat: "https://cdn/haze_card_gloat.png",
                hero_card_critical: "https://cdn/haze_card_critical.png",
            },
        },
    ];

    // The API rows are cached per module; a fresh module gives each test its own API answer.
    async function load() {
        vi.resetModules();
        return (await import("./art")).heroMood;
    }

    it("asks the game for that hero's mood card and returns it as an asset url", async () => {
        const heroMood = await load();
        invoke.mockResolvedValue("C:/art/hero_haze_card_gloat.png");
        expect(await heroMood(15, "gloat")).toBe("asset://C:/art/hero_haze_card_gloat.png");
        expect(invoke).toHaveBeenCalledWith("game_hero_mood", { heroId: 15, mood: "gloat" });
        expect(api).not.toHaveBeenCalled();
    });

    it("falls back to the API's copy, webp first, when the game has none", async () => {
        const heroMood = await load();
        invoke.mockResolvedValue(null);
        api.mockResolvedValue(API_ROWS as never);
        expect(await heroMood(15, "gloat")).toBe("https://cdn/haze_card_gloat.webp");
        expect(await heroMood(15, "critical")).toBe("https://cdn/haze_card_critical.png");
        expect(api).toHaveBeenCalledTimes(1);
    });

    it("falls back to the API's copy when the game command fails", async () => {
        const heroMood = await load();
        invoke.mockRejectedValue(new Error("no game"));
        api.mockResolvedValue(API_ROWS as never);
        expect(await heroMood(15, "critical")).toBe("https://cdn/haze_card_critical.png");
    });

    it("falls back to the plain portrait for a hero with no mood card anywhere", async () => {
        const heroMood = await load();
        invoke.mockResolvedValue(null);
        api.mockResolvedValue(API_ROWS as never);
        heroes.mockResolvedValue({ 21: hero(21, "asset://C:/art/hero_kali_card.png") });
        expect(await heroMood(21, "gloat")).toBe("asset://C:/art/hero_kali_card.png");
    });

    it("falls back to the plain portrait when the API cannot load", async () => {
        const heroMood = await load();
        invoke.mockResolvedValue(null);
        api.mockRejectedValue(new Error("offline"));
        heroes.mockResolvedValue({ 15: hero(15, "asset://C:/art/hero_haze_card.png") });
        expect(await heroMood(15, "gloat")).toBe("asset://C:/art/hero_haze_card.png");
    });

    it("is null when there is no art at all", async () => {
        const heroMood = await load();
        invoke.mockResolvedValue(null);
        api.mockRejectedValue(new Error("offline"));
        heroes.mockRejectedValue(new Error("offline"));
        expect(await heroMood(15, "critical")).toBeNull();
    });
});
