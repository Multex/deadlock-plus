import { describe, expect, it } from "vitest";
import { parseApiDetail } from "../api-detail";
import { playerBySlot, type MatchItem, type MatchPlayer } from "../detail";
import paths from "../fixtures/api-paths.json";
import ranked from "../fixtures/api-ranked.json";
import type { VisualKind } from "./catalog";
import { clampStep, purchaseActions, purchaseStateAt } from "./purchases";

function player(fixture: unknown, slot: number): MatchPlayer {
    const d = parseApiDetail(fixture);
    if (!d) throw new Error("fixture did not parse");
    return playerBySlot(d, slot)!;
}

const unknown = () => undefined;

describe("purchase actions", () => {
    it("lists buys, sells, ability unlocks and ability upgrades in time order", () => {
        const actions = purchaseActions(player(ranked, 2).items, unknown);
        expect(actions).toEqual([
            { kind: "ability-unlock", timeS: 25, id: 1426567660, level: 1 },
            { kind: "item-buy", timeS: 51, id: 1437614329 },
            { kind: "ability-upgrade", timeS: 66, id: 1426567660, level: 2 },
            { kind: "ability-unlock", timeS: 101, id: 4131517918, level: 1 },
            { kind: "item-buy", timeS: 348, id: 3399065363 },
            { kind: "item-sell", timeS: 379, id: 3399065363 },
            { kind: "item-sell", timeS: 1443, id: 1437614329 },
        ]);
    });

    it("puts a sale after the purchase when both share one second", () => {
        const actions = purchaseActions(player(ranked, 11).items, unknown);
        const at179 = actions.filter((a) => a.timeS === 179);
        expect(at179.map((a) => a.kind)).toEqual(["item-buy", "item-sell"]);
    });

    it("keeps rows of one second in the order the match recorded them", () => {
        const actions = purchaseActions(player(paths, 6).items, unknown);
        const at21 = actions.filter((a) => a.timeS === 21);
        expect(at21.map((a) => [a.id, a.kind, a.level])).toEqual([
            [4011110259, "ability-unlock", 1],
            [4011110259, "ability-upgrade", 2],
            [4180486641, "ability-unlock", 1],
            [4180486641, "ability-upgrade", 2],
            [4180486641, "ability-upgrade", 3],
            [4011110259, "ability-upgrade", 3],
        ]);
    });

    it("reads the level from the row's upgrade bits", () => {
        const items: MatchItem[] = [
            { itemId: 7, boughtS: 10, upgradeId: 0, upgradeBits: 0b1 },
            { itemId: 7, boughtS: 20, upgradeId: 0, upgradeBits: 0b111 },
            { itemId: 7, boughtS: 30, upgradeId: 0, upgradeBits: 0b1111 },
        ];
        expect(purchaseActions(items, unknown)).toEqual([
            { kind: "ability-unlock", timeS: 10, id: 7, level: 1 },
            { kind: "ability-upgrade", timeS: 20, id: 7, level: 3 },
            { kind: "ability-upgrade", timeS: 30, id: 7, level: 4 },
        ]);
    });

    it("splits a first row that already carries an upgrade into the unlock and the upgrade", () => {
        const items: MatchItem[] = [{ itemId: 7, boughtS: 10, upgradeId: 0, upgradeBits: 0b11 }];
        expect(purchaseActions(items, unknown)).toEqual([
            { kind: "ability-unlock", timeS: 10, id: 7, level: 1 },
            { kind: "ability-upgrade", timeS: 10, id: 7, level: 2 },
        ]);
    });

    it("counts rows when the upgrade bits are missing", () => {
        const items: MatchItem[] = [
            { itemId: 7, boughtS: 10, upgradeId: 0 },
            { itemId: 7, boughtS: 20, upgradeId: 0 },
            { itemId: 7, boughtS: 30, upgradeId: 0 },
        ];
        expect(purchaseActions(items, unknown).map((a) => [a.kind, a.level])).toEqual([
            ["ability-unlock", 1],
            ["ability-upgrade", 2],
            ["ability-upgrade", 3],
        ]);
    });

    it("counts on from the last known level when a later row has no upgrade bits", () => {
        const items: MatchItem[] = [
            { itemId: 7, boughtS: 10, upgradeId: 0, upgradeBits: 0b11 },
            { itemId: 7, boughtS: 20, upgradeId: 0 },
        ];
        expect(purchaseActions(items, unknown).map((a) => a.level)).toEqual([1, 2, 3]);
    });

    it("carries the ability an item was imbued on", () => {
        const actions = purchaseActions(player(paths, 2).items, unknown);
        expect(actions.find((a) => a.id === 3919289022)).toEqual({
            kind: "item-buy",
            timeS: 61,
            id: 3919289022,
            imbuedAbilityId: 3443575800,
        });
    });

    it("lets the catalog kind win over the row's upgrade id", () => {
        const items: MatchItem[] = [
            { itemId: 7, boughtS: 10, upgradeId: 0 },
            { itemId: 8, boughtS: 20, upgradeId: 1 },
            { itemId: 9, boughtS: 30, upgradeId: 0 },
        ];
        const kinds: Record<number, VisualKind> = { 7: "item", 8: "ability", 9: "unknown" };
        expect(purchaseActions(items, (id) => kinds[id]).map((a) => a.kind)).toEqual([
            "item-buy",
            "ability-unlock",
            "ability-unlock",
        ]);
    });

    it("is empty for a player with no rows", () => {
        expect(purchaseActions([], unknown)).toEqual([]);
    });
});

describe("purchase state at a step", () => {
    const actions = purchaseActions(player(ranked, 2).items, unknown);

    it("holds what was bought and not yet sold, and each ability's level", () => {
        expect(purchaseStateAt(actions, 4)).toEqual({
            items: [{ itemId: 1437614329 }, { itemId: 3399065363 }],
            abilities: [
                { abilityId: 1426567660, level: 2 },
                { abilityId: 4131517918, level: 1 },
            ],
        });
    });

    it("drops an item at the step it is sold", () => {
        expect(purchaseStateAt(actions, 5).items).toEqual([{ itemId: 1437614329 }]);
        expect(purchaseStateAt(actions, 6).items).toEqual([]);
    });

    it("includes the selected step and nothing after it", () => {
        expect(purchaseStateAt(actions, 0)).toEqual({
            items: [],
            abilities: [{ abilityId: 1426567660, level: 1 }],
        });
    });

    it("removes one copy when the same item is held twice", () => {
        const twice = purchaseActions(
            [
                { itemId: 5, boughtS: 10, soldS: 30, upgradeId: 1 },
                { itemId: 5, boughtS: 20, upgradeId: 1 },
            ],
            unknown,
        );
        expect(purchaseStateAt(twice, 1).items).toHaveLength(2);
        expect(purchaseStateAt(twice, 2).items).toEqual([{ itemId: 5 }]);
    });

    it("keeps the imbued ability with the held item", () => {
        const imbued = purchaseActions(player(paths, 2).items, unknown);
        const step = imbued.findIndex((a) => a.id === 3919289022);
        expect(purchaseStateAt(imbued, step).items.at(-1)).toEqual({
            itemId: 3919289022,
            imbuedAbilityId: 3443575800,
        });
    });

    it("shows the recorded upgrade level, not the number of rows", () => {
        const street = purchaseActions(player(paths, 6).items, unknown);
        const last = purchaseStateAt(street, street.length - 1).abilities;
        expect(last).toEqual([
            { abilityId: 4011110259, level: 4 },
            { abilityId: 4180486641, level: 4 },
            { abilityId: 1389230689, level: 2 },
        ]);
        const firstUpgrade = street.findIndex((a) => a.kind === "ability-upgrade");
        expect(purchaseStateAt(street, firstUpgrade - 1).abilities).toEqual([{ abilityId: 4011110259, level: 1 }]);
        expect(purchaseStateAt(street, firstUpgrade).abilities).toEqual([{ abilityId: 4011110259, level: 2 }]);
    });

    it("is empty when there are no actions", () => {
        expect(purchaseStateAt([], 0)).toEqual({ items: [], abilities: [] });
    });
});

describe("clampStep", () => {
    it("stays inside the action list", () => {
        expect(clampStep(-1, 7)).toBe(0);
        expect(clampStep(3, 7)).toBe(3);
        expect(clampStep(7, 7)).toBe(6);
    });

    it("is 0 for an empty list and a non-number", () => {
        expect(clampStep(4, 0)).toBe(0);
        expect(clampStep(Number.NaN, 5)).toBe(0);
    });
});
