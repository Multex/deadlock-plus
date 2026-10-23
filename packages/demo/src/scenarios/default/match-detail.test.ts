import type { BuildTag } from "@deadlock-plus/ipc-types/BuildTag";
import type { ItemStats } from "@deadlock-plus/ipc-types/ItemStats";
import { afterEach, describe, expect, it, vi } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { defaultScenario } from "./index";

const OPTIONS = { appVersion: "1.2.3", changelog: "# Changelog\n", mapItemsTsv: "" };
const ASSETS = "https://api.deadlock-api.com/v1/assets";
const ICON_FILES = "https://assets-bucket.deadlock-api.com/assets-api-res/icons";

const ICONS = {
    builds: { "citadel_build_tag_weapon.svg": `${ICON_FILES}/builds/citadel_build_tag_weapon.svg` },
    shop: {
        "tier_corner_cap.svg": `${ICON_FILES}/shop/tier_corner_cap.svg`,
        catalog: { filters: { "icon_recommend_up.svg": `${ICON_FILES}/shop/catalog/filters/icon_recommend_up.svg` } },
    },
    upgrades: { "tier_numbers_small_02.svg": `${ICON_FILES}/upgrades/tier_numbers_small_02.svg` },
};

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
        properties: {
            AbilityCooldown: { value: "0", label: "Cooldown", postfix: "s" },
            ChannelMoveSpeed: { value: "-1", postfix: "m" },
            BonusClipSizePercent: {
                value: "30",
                provided_property_type: "MODIFIER_VALUE_AMMO_CLIP_SIZE_PERCENT",
                label: "Max Ammo",
                postfix: "%",
                postvalue_label: "Max Ammo",
            },
            BaseAttackDamagePercent: {
                value: "8",
                provided_property_type: "MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE",
                label: "Weapon Damage",
                postfix: "%",
                postvalue_label: "Weapon Damage",
            },
        },
        tooltip_sections: [
            {
                section_type: "innate",
                section_attributes: [
                    { properties: ["BaseAttackDamagePercent"], elevated_properties: ["BonusClipSizePercent"] },
                ],
            },
        ],
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
        properties: {
            Stamina: { value: "1", provided_property_type: "MODIFIER_VALUE_STAMINA", postvalue_label: "Stamina" },
            BonusFireRate: {
                value: "25",
                provided_property_type: "MODIFIER_VALUE_FIRE_RATE",
                usage_flags: ["ConditionallyApplied"],
                label: "Fire Rate",
                postfix: "%",
            },
            NonPlayerBonusWeaponPower: {
                value: 15,
                provided_property_type: "MODIFIER_VALUE_WEAPON_DAMAGE_TO_NPC_INCREASE",
                conditional: "against NPCs",
                label: "Weapon Damage",
                postfix: "%",
            },
            AbilityCastRange: { value: "12m", label: "Cast Range", postfix: "" },
            StatusEffectStun: { value: "1" },
        },
        tooltip_sections: [
            { section_type: "innate", section_attributes: [{ properties: ["Stamina", "NonPlayerBonusWeaponPower"] }] },
            {
                section_type: "passive",
                section_attributes: [{ important_properties: ["BonusFireRate"] }],
            },
            {
                section_type: "active",
                section_attributes: [
                    {
                        properties: ["AbilityCastRange"],
                        important_properties_with_icon: [{ name: "StatusEffectStun" }],
                    },
                ],
            },
        ],
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
    {
        id: 9,
        class_name: "ability_x",
        name: "X",
        type: "ability",
        properties: {
            BonusSpirit: { value: "5", label: "Spirit Power", provided_property_type: "MODIFIER_VALUE_TECH_POWER" },
        },
        tooltip_sections: [{ section_type: "innate", section_attributes: [{ properties: ["BonusSpirit"] }] }],
    },
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
            if (url === `${ASSETS}/icons`) return Response.json(ICONS);
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
                shopFilters: [],
                disabledShopFilters: [],
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
                shopFilters: [],
                disabledShopFilters: [],
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
                shopFilters: [],
                disabledShopFilters: [],
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

    it("gives the stats each item's tooltip shows, flat only when always on", async () => {
        const stat = (
            key: string,
            value: number,
            unit: string | null,
            label: string,
            flat: boolean,
            provides: string | null,
            section: string,
        ) => ({
            key,
            value,
            unit,
            label,
            flat,
            provides,
            section,
        });
        const list = (await start().invoke("game_item_stats", { locale: "english" })) as ItemStats[];
        expect(list.map(({ itemId, stats }) => ({ itemId, stats }))).toEqual([
            {
                itemId: 7,
                stats: [
                    stat("Stamina", 1, null, "Stamina", true, "MODIFIER_VALUE_STAMINA", "innate"),
                    stat("BonusFireRate", 25, "%", "Fire Rate", false, "MODIFIER_VALUE_FIRE_RATE", "passive"),
                    stat(
                        "NonPlayerBonusWeaponPower",
                        15,
                        "%",
                        "Weapon Damage",
                        false,
                        "MODIFIER_VALUE_WEAPON_DAMAGE_TO_NPC_INCREASE",
                        "innate",
                    ),
                    stat("AbilityCastRange", 12, "m", "Cast Range", false, null, "active"),
                ],
            },
            {
                itemId: 1548066885,
                stats: [
                    stat(
                        "BonusClipSizePercent",
                        30,
                        "%",
                        "Max Ammo",
                        true,
                        "MODIFIER_VALUE_AMMO_CLIP_SIZE_PERCENT",
                        "innate",
                    ),
                    stat(
                        "BaseAttackDamagePercent",
                        8,
                        "%",
                        "Weapon Damage",
                        true,
                        "MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE",
                        "innate",
                    ),
                ],
            },
        ]);
    });

    it("names the game's standard build tags with the ids builds store", async () => {
        const tags = (await start().invoke("game_build_tags", { locale: "en" })) as BuildTag[];
        expect(tags).toHaveLength(14);
        expect(tags[0]).toEqual({
            key: "weapon",
            id: 47026193,
            name: "Weapon",
            icon: `${ICON_FILES}/builds/citadel_build_tag_weapon.svg`,
        });
        expect(tags.find((t) => t.key === "complexity_1")).toEqual({
            key: "complexity_1",
            id: 1052421347,
            name: "For New Players",
        });
        expect(tags.at(-1)).toEqual({ key: "debuff", id: 255841590, name: "Debuff" });
    });

    it("draws the shop UI images the public icon set has, and leaves the rest out", async () => {
        expect(await start().invoke("game_shop_ui_art", {})).toEqual([
            { image: "tier_corner", path: `${ICON_FILES}/shop/tier_corner_cap.svg` },
            { image: "tier_number_2", path: `${ICON_FILES}/upgrades/tier_numbers_small_02.svg` },
            { image: "popular_thumb", path: `${ICON_FILES}/shop/catalog/filters/icon_recommend_up.svg` },
        ]);
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
        expect(await handle.invoke("game_item_stats", { locale: "english" })).toEqual([]);
        expect(await handle.invoke("game_shop_ui_art", {})).toEqual([]);
        const tags = (await handle.invoke("game_build_tags", { locale: "en" })) as BuildTag[];
        expect(tags).toHaveLength(14);
        expect(tags.every((t) => t.icon === undefined)).toBe(true);
    });
});
