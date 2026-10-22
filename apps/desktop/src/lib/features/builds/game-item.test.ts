import type { ItemStat } from "@deadlock-plus/ipc-types/ItemStat";
import type { TooltipSection } from "@deadlock-plus/ipc-types/TooltipSection";
import { describe, expect, it } from "vitest";
import type { ShopItem } from "./catalog";
import { builtFrom, gameItem, itemTooltipInput, popularityFor, sectionsFromStats, upgradesTo } from "./game-item";

function stat(over: Partial<ItemStat> & Pick<ItemStat, "key" | "value" | "label">): ItemStat {
    return { unit: null, flat: true, provides: null, section: "innate", ...over };
}

const item = (id: number, over: Partial<ShopItem> = {}): ShopItem => ({
    id,
    className: `c${id}`,
    name: `Item ${id}`,
    slot: "weapon",
    tier: 1,
    cost: 800,
    active: false,
    componentIds: [],
    shopable: true,
    disabled: false,
    imbue: false,
    ...over,
});

const byId = new Map<number, ShopItem>([
    [1, item(1, { name: "Extended Magazine", art: "mag.png" })],
    [2, item(2, { name: "Titanic Magazine", tier: 3, cost: 3200, componentIds: [1] })],
    [3, item(3, { name: "Escalating Resilience", tier: 3, cost: 3200, componentIds: [1, 4] })],
    [4, item(4, { name: "Basic Part", slot: "vitality" })],
    [5, item(5, { name: "Dropped Upgrade", tier: 2, cost: 1600, componentIds: [1], disabled: true })],
    [6, item(6, { name: "Cheaper Upgrade", tier: 2, cost: 1600, componentIds: [1] })],
]);

const statsById = new Map<number, ItemStat[]>([
    [
        2,
        [
            stat({ key: "BonusClipSize", value: 60, unit: "%", label: "Max Ammo" }),
            stat({ key: "ProcDamage", value: 40, label: "Bonus Damage", flat: false, section: "passive" }),
            stat({ key: "AbilityCooldown", value: 18, unit: "s", label: "Cooldown", section: "active" }),
            stat({ key: "AbilityDuration", value: 5, unit: "s", label: "Duration", section: "active" }),
        ],
    ],
]);

const GAME_SECTION: TooltipSection = {
    kind: "passive",
    cooldown: 12,
    blocks: [
        {
            description: "Shoots <span class='highlight'>faster</span>",
            values: {},
            elevated: [],
            important: [],
            properties: [],
        },
    ],
};

const catalog = { byId, statsById, sectionsById: new Map([[3, [GAME_SECTION]]]) };

describe("gameItem", () => {
    it("carries what the game's card and tooltip draw", () => {
        expect(gameItem(byId.get(1)!)).toEqual({
            id: 1,
            name: "Extended Magazine",
            slot: "weapon",
            tier: 1,
            cost: 800,
            active: false,
            imbue: false,
            art: "mag.png",
        });
    });

    it("leaves the art out when the item has none, so the card draws its initials", () => {
        expect(gameItem(byId.get(4)!)).not.toHaveProperty("art");
    });

    it("reads a missing imbue flag as not imbue", () => {
        const { imbue: _, ...plain } = item(9);
        expect(gameItem(plain).imbue).toBe(false);
    });
});

describe("upgradesTo", () => {
    it("lists shop items built from the item, cheapest first", () => {
        expect(upgradesTo(byId, 1).map((i) => i.id)).toEqual([6, 3, 2]);
    });

    it("is empty for an item nothing is built from", () => {
        expect(upgradesTo(byId, 2)).toEqual([]);
    });
});

describe("builtFrom", () => {
    it("lists the components in the game's order and skips unknown ones", () => {
        const known = new Map(byId).set(7, item(7, { componentIds: [4, 404, 1] }));
        expect(builtFrom(known, 7).map((i) => i.id)).toEqual([4, 1]);
    });
});

describe("sectionsFromStats", () => {
    const sections = sectionsFromStats(statsById.get(2)!);

    it("groups the stats into the game's innate, passive and active sections", () => {
        expect(sections.map((s) => s.kind)).toEqual(["innate", "passive", "active"]);
        expect(sections.map((s) => s.blocks[0]!.properties.map((p) => p.label))).toEqual([
            ["Max Ammo"],
            ["Bonus Damage"],
            ["Duration"],
        ]);
    });

    it("lifts the cooldown out of the rows into its section's header", () => {
        expect(sections.map((s) => s.cooldown)).toEqual([null, null, 18]);
    });

    it("signs innate bonuses only", () => {
        expect(sections.map((s) => s.blocks[0]!.properties[0]!.signed)).toEqual([true, false, false]);
    });

    it("keeps the value and unit of each row", () => {
        expect(sections[0]!.blocks[0]!.properties[0]).toMatchObject({ key: "BonusClipSize", value: 60, unit: "%" });
    });

    it("puts stats with no tooltip section with the innate ones", () => {
        const hidden = sectionsFromStats([stat({ key: "Hidden", value: 3, label: "Hidden", section: null })]);
        expect(hidden.map((s) => s.kind)).toEqual(["innate"]);
    });

    it("keeps a section that shows only a cooldown", () => {
        const only = sectionsFromStats([
            stat({ key: "AbilityCooldown", value: 9, label: "Cooldown", section: "active" }),
        ]);
        expect(only).toEqual([{ kind: "active", cooldown: 9, blocks: [] }]);
    });

    it("is empty for an item with no stats", () => {
        expect(sectionsFromStats([])).toEqual([]);
    });
});

describe("popularityFor", () => {
    const game = new Map([
        [1, [{ phase: "mid" as const, pickPct: 41.6 }]],
        [
            2,
            [
                { phase: "early" as const, pickPct: 12 },
                { phase: "late" as const, pickPct: 30 },
            ],
        ],
    ]);

    it("is the game's Popular line with the hero icon", () => {
        expect(popularityFor(game, "hero.png", 1)).toEqual({ phase: "mid", percent: 41.6, heroIcon: "hero.png" });
    });

    it("takes the earliest phase the game lists the item in", () => {
        expect(popularityFor(game, null, 2)).toEqual({ phase: "early", percent: 12, heroIcon: null });
    });

    it("is null for an item the hero's Popular page does not list", () => {
        expect(popularityFor(game, "hero.png", 3)).toBeNull();
    });
});

describe("itemTooltipInput", () => {
    it("is null for an item the catalog does not know", () => {
        expect(itemTooltipInput(catalog, 99)).toBeNull();
    });

    it("uses the game's own tooltip sections when the game files have them", () => {
        expect(itemTooltipInput(catalog, 3)!.sections).toEqual([GAME_SECTION]);
    });

    it("builds sections from the item's stats when the game files have none", () => {
        expect(itemTooltipInput(catalog, 2)!.sections.map((s) => s.kind)).toEqual(["innate", "passive", "active"]);
    });

    it("links the components and upgrades as game items", () => {
        const input = itemTooltipInput(catalog, 3)!;
        expect(input.item).toMatchObject({ id: 3, cost: 3200, tier: 3 });
        expect(input.upgradesFrom!.map((i) => i.name)).toEqual(["Extended Magazine", "Basic Part"]);
        expect(itemTooltipInput(catalog, 1)!.upgradesTo!.map((i) => i.id)).toEqual([6, 3, 2]);
    });

    it("passes the popularity line and owned items through", () => {
        const popularity = { phase: "late" as const, percent: 20, heroIcon: null };
        const input = itemTooltipInput(catalog, 3, { popularity, ownedIds: [1] })!;
        expect(input.popularity).toBe(popularity);
        expect(input.ownedIds).toEqual([1]);
    });

    it("passes the ALT column, hero and build note through", () => {
        const details = { groups: [], condition: null, phases: [] };
        const buildNote = { text: "Rush", sellPriority: 1, imbueTarget: { name: "Burst Fire", icon: null } };
        const input = itemTooltipInput(catalog, 3, {
            position: "left",
            hasDetails: true,
            detailView: true,
            details,
            canAfford: false,
            buildNote,
            imbuedUpon: { name: "Burst Fire", icon: "burst.png" },
        })!;
        expect(input).toMatchObject({ position: "left", hasDetails: true, detailView: true, canAfford: false });
        expect(input.details).toBe(details);
        expect(input.buildNote).toBe(buildNote);
        expect(input.imbuedUpon).toEqual({ name: "Burst Fire", icon: "burst.png" });
    });
});
