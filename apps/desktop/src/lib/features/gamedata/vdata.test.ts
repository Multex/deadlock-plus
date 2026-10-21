import { beforeEach, describe, expect, it, vi } from "vitest";
import { command } from "$lib/core/tauri";
import type { ShopItem } from "@deadlock-plus/ipc-types/ShopItem";
import {
    loadBuildTags,
    loadHeroAbilities,
    loadHeroProgression,
    loadItemStats,
    loadPopularItems,
    loadShopItems,
    loadShopUiArt,
} from "./vdata";

vi.mock("$lib/core/tauri", () => ({ command: vi.fn(), fileSrc: (path: string) => `asset://${path}` }));

const invoke = vi.mocked(command);

beforeEach(() => {
    invoke.mockReset();
});

const item: ShopItem = {
    id: 1,
    className: "upgrade_a",
    slot: "spirit",
    tier: 1,
    cost: 800,
    active: false,
    components: [],
    disabled: false,
    shopable: true,
    imbue: false,
};

describe("loadShopItems", () => {
    it("returns the game's shop items", async () => {
        invoke.mockResolvedValue([item]);
        expect(await loadShopItems()).toEqual([item]);
        expect(invoke).toHaveBeenCalledWith("game_shop_items");
    });

    it("is empty when the command fails", async () => {
        invoke.mockRejectedValue(new Error("no backend"));
        expect(await loadShopItems()).toEqual([]);
    });
});

describe("loadHeroProgression", () => {
    it("returns the game's level table", async () => {
        const progression = { levels: [{ level: 1, souls: 0, ap: 0, unlocks: 1 }] };
        invoke.mockResolvedValue(progression);
        expect(await loadHeroProgression()).toEqual(progression);
        expect(invoke).toHaveBeenCalledWith("game_hero_progression");
    });

    it("has no levels when the command fails", async () => {
        invoke.mockRejectedValue(new Error("no backend"));
        expect(await loadHeroProgression()).toEqual({ levels: [] });
    });
});

describe("loadHeroAbilities", () => {
    it("returns each hero's four ability ids", async () => {
        const abilities = [{ heroId: 1, abilityIds: [1, 2, 3, 4] }];
        invoke.mockResolvedValue(abilities);
        expect(await loadHeroAbilities()).toEqual(abilities);
        expect(invoke).toHaveBeenCalledWith("game_hero_abilities");
    });

    it("is empty when the command fails", async () => {
        invoke.mockRejectedValue(new Error("no backend"));
        expect(await loadHeroAbilities()).toEqual([]);
    });
});

describe("loadPopularItems", () => {
    it("asks for one hero", async () => {
        const popular = { timestamp: 1, earlyGame: [], midGame: [], lateGame: [] };
        invoke.mockResolvedValue(popular);
        expect(await loadPopularItems(7)).toEqual(popular);
        expect(invoke).toHaveBeenCalledWith("game_popular_items", { heroId: 7 });
    });

    it("is null when the command fails", async () => {
        invoke.mockRejectedValue(new Error("no backend"));
        expect(await loadPopularItems(7)).toBeNull();
    });
});

describe("loadItemStats", () => {
    it("asks for the stats in one locale", async () => {
        const stats = [
            {
                itemId: 1,
                stats: [
                    {
                        key: "TechPower",
                        value: 10,
                        unit: null,
                        label: "Spirit Power",
                        flat: true,
                        provides: "MODIFIER_VALUE_TECH_POWER",
                        section: "innate",
                    },
                ],
            },
        ];
        invoke.mockResolvedValue(stats);
        expect(await loadItemStats("german")).toEqual(stats);
        expect(invoke).toHaveBeenCalledWith("game_item_stats", { locale: "german" });
    });

    it("is empty when the command fails", async () => {
        invoke.mockRejectedValue(new Error("no backend"));
        expect(await loadItemStats("english")).toEqual([]);
    });
});

describe("loadBuildTags", () => {
    it("turns each tag's local icon into an asset url", async () => {
        invoke.mockResolvedValue([
            { key: "weapon", id: 47026193, name: "Waffe", icon: "C:/art/build_tag_weapon.svg" },
            { key: "debuff", id: 255841590, name: "Debuff" },
        ]);
        expect(await loadBuildTags("german")).toEqual([
            { key: "weapon", id: 47026193, name: "Waffe", icon: "asset://C:/art/build_tag_weapon.svg" },
            { key: "debuff", id: 255841590, name: "Debuff" },
        ]);
        expect(invoke).toHaveBeenCalledWith("game_build_tags", { locale: "german" });
    });

    it("is empty when the command fails", async () => {
        invoke.mockRejectedValue(new Error("no backend"));
        expect(await loadBuildTags("english")).toEqual([]);
    });
});

describe("loadShopUiArt", () => {
    it("keys each image's asset url by its name", async () => {
        invoke.mockResolvedValue([
            { image: "tier_corner", path: "C:/art/ui_tier_corner.svg" },
            { image: "card_backer_weapon_t1", path: "C:/art/ui_card_backer_weapon_t1.png" },
        ]);
        expect(await loadShopUiArt()).toEqual({
            tier_corner: "asset://C:/art/ui_tier_corner.svg",
            card_backer_weapon_t1: "asset://C:/art/ui_card_backer_weapon_t1.png",
        });
        expect(invoke).toHaveBeenCalledWith("game_shop_ui_art");
    });

    it("is empty when the command fails", async () => {
        invoke.mockRejectedValue(new Error("no backend"));
        expect(await loadShopUiArt()).toEqual({});
    });
});
