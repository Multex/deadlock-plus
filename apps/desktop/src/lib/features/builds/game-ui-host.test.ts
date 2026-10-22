import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UiText } from "@deadlock-plus/game-ui/item-tooltip/model";
import type { GameUiStrings } from "@deadlock-plus/ipc-types/GameUiStrings";
import type { HeroStatsData } from "@deadlock-plus/ipc-types/HeroStatsData";
import { loadGameUiStrings, loadHeroStats, loadPropertyIcons, loadShopUiArt } from "$lib/features/gamedata/vdata";
import { keepGameArt, onGameArtChanged } from "$lib/features/gamedata/art-refresh";
import { loadHeroMinimapArt } from "$lib/features/gamedata/gamedata";
import { loadHeroes, type Hero } from "$lib/features/heroes/heroes";

vi.mock("$lib/features/gamedata/vdata", () => ({
    loadShopUiArt: vi.fn(),
    loadPropertyIcons: vi.fn(),
    loadGameUiStrings: vi.fn(),
    loadHeroStats: vi.fn(),
}));
vi.mock("$lib/features/gamedata/art-refresh", () => ({ keepGameArt: vi.fn(), onGameArtChanged: vi.fn() }));
vi.mock("$lib/features/gamedata/gamedata", () => ({ loadHeroMinimapArt: vi.fn() }));
vi.mock("$lib/features/heroes/heroes", () => ({ loadHeroes: vi.fn() }));

const shopUiArt = vi.mocked(loadShopUiArt);
const propertyIcons = vi.mocked(loadPropertyIcons);
const keep = vi.mocked(keepGameArt);
const gameStrings = vi.mocked(loadGameUiStrings);
const artChanged = vi.mocked(onGameArtChanged);
const heroStats = vi.mocked(loadHeroStats);
const minimapArt = vi.mocked(loadHeroMinimapArt);
const heroes = vi.mocked(loadHeroes);

/** An image that fails to decode when its url names it broken, as a missing file does in the webview. */
class FakeImage {
    src = "";
    decode(): Promise<void> {
        return this.src.includes("broken") ? Promise.reject(new Error("decode")) : Promise.resolve();
    }
}

async function host() {
    vi.resetModules();
    return import("./game-ui-host.svelte");
}

beforeEach(() => {
    vi.stubGlobal("Image", FakeImage);
    keep.mockImplementation((load) => {
        void load();
        return () => {};
    });
    shopUiArt.mockResolvedValue({ tier_corner: "asset://corner.svg", tier_number_1: "asset://broken.svg" });
    propertyIcons.mockResolvedValue({
        tech_damage: { url: "asset://tech.svg", wash: "#ce90ff", color: null },
        StatusEffectEMP: { url: "asset://broken-emp.svg", wash: null, color: null },
    });
    artChanged.mockReturnValue(() => true);
    gameStrings.mockImplementation(async (locale): Promise<GameUiStrings> =>
        locale === "de"
            ? { Citadel_Mod_Tooltip_Passive: "Passiv" }
            : {
                  Citadel_Mod_Tooltip_Passive: "<b>Passive</b>",
                  Citadel_PopularityLabel_Early: "Purchased early game in {d:popular_pct}% of matches.",
                  Citadel_Shop_AbilityIsImbuing: "Imbued upon {s:imbued_ability_name}",
                  Citadel_Example_Count: "{i:count} stacks",
              },
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe("buildsGameArt", () => {
    it("starts empty and loads nothing until a component reads it", async () => {
        const { buildsGameArt } = await host();
        expect(shopUiArt).not.toHaveBeenCalled();
        expect(buildsGameArt()).toEqual({ ui: {}, propertyIcons: {} });
        expect(shopUiArt).toHaveBeenCalledTimes(1);
    });

    it("hands out only the images that decode, so a broken file falls back to plain CSS", async () => {
        const { buildsGameArt } = await host();
        buildsGameArt();
        await vi.waitFor(() => expect(buildsGameArt().ui).not.toEqual({}));
        expect(buildsGameArt()).toEqual({
            ui: { tier_corner: "asset://corner.svg" },
            propertyIcons: { tech_damage: { url: "asset://tech.svg", wash: "#ce90ff", color: null } },
        });
    });

    it("loads once however many components read it", async () => {
        const { buildsGameArt } = await host();
        buildsGameArt();
        buildsGameArt();
        expect(keep).toHaveBeenCalledTimes(1);
        expect(propertyIcons).toHaveBeenCalledTimes(1);
    });

    it("reloads when a game update moves the art", async () => {
        const { buildsGameArt } = await host();
        buildsGameArt();
        await vi.waitFor(() => expect(buildsGameArt().ui).not.toEqual({}));

        shopUiArt.mockResolvedValue({ tier_corner: "asset://new/corner.svg" });
        await keep.mock.calls[0]![0]();
        expect(buildsGameArt().ui).toEqual({ tier_corner: "asset://new/corner.svg" });
    });
});

describe("gameUiText", () => {
    it("reads the app's locale key with its params", async () => {
        const { gameUiText } = await host();
        const text = { key: "builds.view.removed_one", params: { count: 1 }, game: null };
        expect(gameUiText(text)).toBe("1 item is no longer in the shop.");
    });
});

describe("gameUiText with the game's own strings", () => {
    const passive: UiText = {
        key: "game_ui.item_tooltip.passive",
        params: {},
        game: { token: "Citadel_Mod_Tooltip_Passive", params: {} },
    };
    const early: UiText = {
        key: "game_ui.item_tooltip.popular_early",
        params: { percent: 42 },
        game: { token: "Citadel_PopularityLabel_Early", params: { popular_pct: 42 } },
    };

    // The app's English and the game's English match, so this token, which has no app key, shows which one won.
    const count: UiText = { key: "x", params: {}, game: { token: "Citadel_Example_Count", params: { count: 3 } } };

    async function loaded() {
        const module = await host();
        const { i18n } = await import("$lib/core/i18n.svelte");
        await vi.waitFor(() => expect(module.gameUiText(count)).toBe("3 stacks"));
        return { ...module, i18n };
    }

    it("reads the app's locale until the game's strings load, then the game's", async () => {
        const { gameUiText } = await host();
        expect(gameUiText(count)).toBe("x");
        expect(gameStrings).toHaveBeenCalledWith("en");
        await vi.waitFor(() => expect(gameUiText(count)).toBe("3 stacks"));
        expect(gameUiText({ ...early, params: { percent: 1 } })).toBe("Purchased early game in 42% of matches.");
    });

    it("fills the game's {s:} and {i:} params", async () => {
        const { gameUiText } = await loaded();
        const imbued: UiText = {
            key: "game_ui.item_tooltip.imbued_upon",
            params: { ability: "Fireball" },
            game: { token: "Citadel_Shop_AbilityIsImbuing", params: { imbued_ability_name: "Bébé Fireball" } },
        };
        expect(gameUiText(imbued)).toBe("Imbued upon Bébé Fireball");
    });

    it("strips the game's markup tags", async () => {
        const { gameUiText } = await loaded();
        expect(gameUiText(passive)).toBe("Passive");
    });

    it("falls back to the locale key when the game lacks the token or a param", async () => {
        const { gameUiText } = await loaded();
        const missing: UiText = { ...passive, game: { token: "Citadel_Not_There", params: {} } };
        expect(gameUiText(missing)).toBe("Passive");
        const noParam: UiText = { ...early, params: { percent: 9 }, game: { ...early.game!, params: {} } };
        expect(gameUiText(noParam)).toBe("Purchased early game in 9% of matches.");
        expect(gameUiText({ ...early, params: { percent: 5 }, game: null })).toBe(
            "Purchased early game in 5% of matches.",
        );
    });

    it("loads once per locale and again when the locale changes", async () => {
        const { gameUiText, i18n } = await loaded();
        gameUiText(passive);
        gameUiText(early);
        expect(gameStrings).toHaveBeenCalledTimes(1);

        i18n.setLocale("de");
        await vi.waitFor(() => expect(gameUiText(passive)).toBe("Passiv"));
        expect(gameStrings).toHaveBeenLastCalledWith("de");
        expect(gameStrings).toHaveBeenCalledTimes(2);
        i18n.setLocale("en");
    });

    it("reloads the loaded locales after a game update", async () => {
        const { gameUiText } = await loaded();
        gameStrings.mockResolvedValue({ Citadel_Mod_Tooltip_Passive: "Passive (new)" });
        await artChanged.mock.calls[0]![0]();
        expect(gameUiText(passive)).toBe("Passive (new)");
    });
});

describe("buildsHero", () => {
    const seven = (bulletDamage: number): HeroStatsData => ({
        heroId: 2,
        base: { EMaxHealth: 730 },
        perLevel: {},
        investment: { weapon: [], spirit: [], vitality: [] },
        bulletDamage,
    });

    beforeEach(() => {
        heroStats.mockImplementation(async (heroId) => (heroId === 2 ? seven(10.8) : null));
        minimapArt.mockResolvedValue({ 2: "asset://seven_mm.png" });
        heroes.mockResolvedValue({ 4: { icon: "https://api/lady_geist.webp" } as Hero });
    });

    it("is null until the hero loads, then its stats and minimap head", async () => {
        const { buildsHero } = await host();
        expect(buildsHero(2)).toBeNull();
        await vi.waitFor(() => expect(buildsHero(2)).not.toBeNull());
        expect(buildsHero(2)).toEqual({ stats: seven(10.8), icon: "asset://seven_mm.png" });
    });

    it("loads each hero once however many components read it", async () => {
        const { buildsHero } = await host();
        buildsHero(2);
        buildsHero(2);
        await vi.waitFor(() => expect(buildsHero(2)).not.toBeNull());
        expect(heroStats).toHaveBeenCalledTimes(1);
    });

    it("falls back to the hero's icon without minimap art, and to no stats for an unknown hero", async () => {
        const { buildsHero } = await host();
        buildsHero(4);
        await vi.waitFor(() => expect(buildsHero(4)).not.toBeNull());
        expect(buildsHero(4)).toEqual({ stats: null, icon: "https://api/lady_geist.webp" });
    });

    it("reloads the loaded heroes after a game update", async () => {
        const { buildsHero } = await host();
        buildsHero(2);
        await vi.waitFor(() => expect(buildsHero(2)).not.toBeNull());
        heroStats.mockResolvedValue(seven(11));
        await artChanged.mock.calls[0]![0]();
        expect(buildsHero(2)?.stats?.bulletDamage).toBe(11);
    });
});
