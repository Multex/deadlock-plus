import { afterEach, describe, expect, it, vi } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { defaultScenario } from "./index";

const OPTIONS = { appVersion: "1.2.3", changelog: "# Changelog\n", mapItemsTsv: "" };
const ASSETS = "https://api.deadlock-api.com/v1/assets";

const ITEMS = [
    {
        id: 1548066885,
        class_name: "upgrade_clip_size",
        name: "Extended Magazine",
        type: "upgrade",
        item_slot_type: "weapon",
        item_tier: 1,
        cost: 800,
        is_active_item: false,
        shopable: true,
        disabled: false,
    },
    {
        id: 7,
        class_name: "upgrade_big_clip",
        name: "Big Clip",
        type: "upgrade",
        item_slot_type: "weapon",
        item_tier: 2,
        cost: 1600,
        is_active_item: true,
        shopable: true,
        component_items: ["upgrade_clip_size"],
        imbue: "imbue_modifier_value",
    },
    {
        id: 8,
        class_name: "upgrade_unreleased",
        name: "upgrade_unreleased",
        type: "upgrade",
        item_slot_type: "spirit",
        item_tier: 5,
        cost: 9999,
        shopable: false,
        disabled: true,
    },
    { id: 9, class_name: "ability_x", name: "X", type: "ability" },
];

const HEROES = [
    {
        id: 1,
        items: {
            weapon_primary: "citadel_weapon_inferno_set",
            signature1: "ability_incendiary_projectile",
            signature2: "ability_flame_dash",
            signature3: "ability_afterburn",
            signature4: "ability_fire_bomb",
        },
        level_info: {
            "3": { required_gold: 500, bonus_currencies: ["EAbilityUnlocks"] },
            "1": { required_gold: 0, bonus_currencies: ["EAbilityUnlocks"] },
            "2": { required_gold: 200, bonus_currencies: ["EAbilityPoints"] },
        },
        popular_items: {
            timestamp: 1790702781,
            early_game: [
                { item_id: 1548066885, class_name: "upgrade_clip_size", pick_pct: 60.34076, winrate_pct: 50.475616 },
            ],
            mid_game: [],
            late_game: [],
        },
    },
    { id: 21, items: { signature1: "a", signature2: "b", signature3: "c" } },
];

describe("game files from the default scenario", () => {
    const handles: DemoHandle[] = [];
    const start = () => {
        vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url === `${ASSETS}/items`) return Response.json(ITEMS);
            if (url === `${ASSETS}/heroes`) return Response.json(HEROES);
            return new Response("not found", { status: 404 });
        });
        const handle = install(defaultScenario(OPTIONS));
        handles.push(handle);
        return handle;
    };
    afterEach(() => {
        while (handles.length) handles.pop()!.uninstall();
        vi.unstubAllGlobals();
    });

    it("lists the shop items of the items asset in the game's shape", async () => {
        expect(await start().invoke("game_shop_items", {})).toEqual([
            {
                id: 7,
                className: "upgrade_big_clip",
                slot: "weapon",
                tier: 2,
                cost: 1600,
                active: true,
                components: [1548066885],
                disabled: false,
                shopable: true,
                imbue: true,
            },
            {
                id: 8,
                className: "upgrade_unreleased",
                slot: "spirit",
                tier: 5,
                cost: 9999,
                active: false,
                components: [],
                disabled: true,
                shopable: false,
                imbue: false,
            },
            {
                id: 1548066885,
                className: "upgrade_clip_size",
                slot: "weapon",
                tier: 1,
                cost: 800,
                active: false,
                components: [],
                disabled: false,
                shopable: true,
                imbue: false,
            },
        ]);
    });

    it("gives the level table of the hero asset, each level with what it adds", async () => {
        expect(await start().invoke("game_hero_progression", {})).toEqual({
            levels: [
                { level: 1, souls: 0, ap: 0, unlocks: 1 },
                { level: 2, souls: 200, ap: 1, unlocks: 0 },
                { level: 3, souls: 500, ap: 0, unlocks: 1 },
            ],
        });
    });

    it("hashes each hero's four signature abilities like the game, leaving out heroes without four", async () => {
        expect(await start().invoke("game_hero_abilities", {})).toEqual([
            { heroId: 1, abilityIds: [491391007, 3516947824, 1593133799, 1142270357] },
        ]);
    });

    it("gives a hero's popular items, null for a hero without any", async () => {
        const handle = start();
        expect(await handle.invoke("game_popular_items", { heroId: 1 })).toEqual({
            timestamp: 1790702781,
            earlyGame: [{ id: 1548066885, className: "upgrade_clip_size", pickPct: 60.34076, winPct: 50.475616 }],
            midGame: [],
            lateGame: [],
        });
        expect(await handle.invoke("game_popular_items", { heroId: 21 })).toBeNull();
        expect(await handle.invoke("game_popular_items", { heroId: 999 })).toBeNull();
    });

    it("answers as an unreadable game does when the assets cannot be fetched", async () => {
        vi.stubGlobal("fetch", async () => {
            throw new TypeError("Failed to fetch");
        });
        const handle = install(defaultScenario(OPTIONS));
        handles.push(handle);
        expect(await handle.invoke("game_shop_items", {})).toEqual([]);
        expect(await handle.invoke("game_hero_progression", {})).toEqual({ levels: [] });
        expect(await handle.invoke("game_hero_abilities", {})).toEqual([]);
        expect(await handle.invoke("game_popular_items", { heroId: 1 })).toBeNull();
    });
});
