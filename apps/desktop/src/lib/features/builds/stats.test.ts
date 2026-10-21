import type { ItemStat } from "@deadlock-plus/ipc-types/ItemStat";
import { describe, expect, it } from "vitest";
import type { ShopItem } from "./catalog";
import { searchItems } from "./catalog";
import { statLabelMatchers, statsSoFar } from "./stats";

const SPIRIT = "MODIFIER_VALUE_TECH_POWER";
const HEALTH = "MODIFIER_VALUE_BONUS_HEALTH";

function stat(over: Partial<ItemStat> & Pick<ItemStat, "key" | "value" | "label">): ItemStat {
    return { unit: null, flat: true, provides: null, section: "innate", ...over };
}

const statsById = new Map<number, ItemStat[]>([
    [1, [stat({ key: "TechPower", value: 10, label: "Spirit Power", provides: SPIRIT })]],
    [
        2,
        [
            stat({ key: "BonusHealth", value: 210, label: "Bonus Health", provides: HEALTH }),
            stat({ key: "BonusSpirit", value: 6, label: "Bonus Spirit", provides: SPIRIT }),
        ],
    ],
    [
        3,
        [
            stat({
                key: "TechPower",
                value: 30,
                label: "Spirit Power",
                provides: SPIRIT,
                flat: false,
                section: "passive",
            }),
            stat({
                key: "BonusFireRate",
                value: 9,
                unit: "%",
                label: "Fire Rate",
                provides: "MODIFIER_VALUE_FIRE_RATE",
            }),
        ],
    ],
    [4, [stat({ key: "WeirdHealth", value: 5, unit: "%", label: "Health %", provides: HEALTH })]],
    [5, [stat({ key: "Range", value: 0.1, unit: "m", label: "Range", provides: "R" })]],
    [6, [stat({ key: "Range", value: 0.2, unit: "m", label: "Range", provides: "R" })]],
]);

const part = (id: number, cost: number, componentIds: number[] = []): ShopItem => ({
    id,
    className: `c${id}`,
    name: `Item ${id}`,
    slot: "spirit",
    tier: 1,
    cost,
    active: false,
    componentIds,
    shopable: true,
    disabled: false,
    imbue: false,
});
const noCatalog = new Map<number, ShopItem>();

describe("statsSoFar", () => {
    it("is empty with nothing bought", () => {
        expect(statsSoFar([], statsById, noCatalog)).toEqual([]);
    });

    it("sums flat stats that provide the same thing, under the first stat's label, in first-bought order", () => {
        expect(statsSoFar([2, 1], statsById, noCatalog)).toEqual([
            { provides: HEALTH, label: "Bonus Health", unit: null, total: 210 },
            { provides: SPIRIT, label: "Bonus Spirit", unit: null, total: 16 },
        ]);
    });

    it("counts an item bought twice twice", () => {
        expect(statsSoFar([1, 1], statsById, noCatalog)).toEqual([
            { provides: SPIRIT, label: "Spirit Power", unit: null, total: 20 },
        ]);
    });

    it("leaves out stats that are not always on", () => {
        expect(statsSoFar([1, 3], statsById, noCatalog)).toEqual([
            { provides: SPIRIT, label: "Spirit Power", unit: null, total: 10 },
            { provides: "MODIFIER_VALUE_FIRE_RATE", label: "Fire Rate", unit: "%", total: 9 },
        ]);
    });

    it("keeps a stat with another unit apart", () => {
        expect(statsSoFar([2, 4], statsById, noCatalog).filter((s) => s.provides === HEALTH)).toEqual([
            { provides: HEALTH, label: "Bonus Health", unit: null, total: 210 },
            { provides: HEALTH, label: "Health %", unit: "%", total: 5 },
        ]);
    });

    it("skips items without stats", () => {
        expect(statsSoFar([99, 1], statsById, noCatalog)).toEqual([
            { provides: SPIRIT, label: "Spirit Power", unit: null, total: 10 },
        ]);
    });

    it("does not show floating point noise", () => {
        expect(statsSoFar([5, 6], statsById, noCatalog)[0]?.total).toBe(0.3);
    });
});

describe("statsSoFar with components", () => {
    const base = part(1, 500);
    const upgrade = part(2, 1250, [1]);
    const top = part(3, 3000, [2]);
    const byId = new Map([base, upgrade, top].map((i) => [i.id, i]));

    it("counts only the upgrade once it has used up its component", () => {
        expect(statsSoFar([1, 2], statsById, byId)).toEqual([
            { provides: HEALTH, label: "Bonus Health", unit: null, total: 210 },
            { provides: SPIRIT, label: "Bonus Spirit", unit: null, total: 6 },
        ]);
    });

    it("uses up an owned base through a missing middle component", () => {
        expect(statsSoFar([1, 3], statsById, byId)).toEqual([
            { provides: "MODIFIER_VALUE_FIRE_RATE", label: "Fire Rate", unit: "%", total: 9 },
        ]);
    });

    it("keeps both when the component is bought after its upgrade", () => {
        expect(statsSoFar([2, 1], statsById, byId)).toEqual([
            { provides: HEALTH, label: "Bonus Health", unit: null, total: 210 },
            { provides: SPIRIT, label: "Bonus Spirit", unit: null, total: 16 },
        ]);
    });

    it("uses up only one copy of a component bought twice", () => {
        expect(statsSoFar([1, 1, 2], statsById, byId)).toEqual([
            { provides: SPIRIT, label: "Spirit Power", unit: null, total: 16 },
            { provides: HEALTH, label: "Bonus Health", unit: null, total: 210 },
        ]);
    });
});

describe("statLabelMatchers", () => {
    const item = (id: number, name: string): ShopItem => ({
        id,
        className: `c${id}`,
        name,
        slot: "spirit",
        tier: 1,
        cost: 800,
        active: false,
        componentIds: [],
        shopable: true,
        disabled: false,
        imbue: false,
    });
    const items = [item(1, "Extra Spirit"), item(2, "Extra Health"), item(3, "Mystic Burst"), item(7, "Fire Rate")];
    const accented = new Map([[9, [stat({ key: "X", value: 1, label: "Énergie" })]]]);

    it("matches an item by any of its stat labels, ignoring case", () => {
        expect(searchItems(items, "FIRE RATE", statLabelMatchers(statsById)).map((i) => i.id)).toEqual([7, 3]);
        expect(searchItems(items, "power", statLabelMatchers(statsById)).map((i) => i.id)).toEqual([1, 3]);
    });

    it("ignores accents like item names do", () => {
        const [match] = statLabelMatchers(accented);
        expect(match?.(item(9, "x"), "energie")).toBe(true);
    });

    it("matches no item without stats", () => {
        expect(searchItems([item(8, "Plain")], "spirit", statLabelMatchers(statsById))).toEqual([]);
    });
});
