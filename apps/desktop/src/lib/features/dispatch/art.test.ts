import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadHeroes, type Hero } from "$lib/features/heroes/heroes";
import { heroPortrait } from "./art";

vi.mock("$lib/features/heroes/heroes", () => ({ loadHeroes: vi.fn() }));

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
