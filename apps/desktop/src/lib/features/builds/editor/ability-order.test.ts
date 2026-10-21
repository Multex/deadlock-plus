import type { CurrencyChangeView } from "@deadlock-plus/ipc-types/CurrencyChangeView";
import { describe, expect, it } from "vitest";
import type { Level } from "../levels";
import {
    abilityProgress,
    appendStep,
    dependents,
    fillRest,
    isValid,
    loadOrder,
    moveStep,
    orderSteps,
    pointsSummary,
    removeStep,
    slotState,
} from "./ability-order";

const ABILITIES = [10, 20, 30, 40] as const;
const ULT = 40;

const unlock = (abilityId: number, annotation: string | null = null): CurrencyChangeView => ({
    abilityId,
    currencyType: 2,
    delta: -1,
    annotation,
});
const ap = (abilityId: number, delta: number): CurrencyChangeView => ({
    abilityId,
    currencyType: 1,
    delta,
    annotation: null,
});

const row = (level: number, ap: number, unlocks: number): Level => ({
    level,
    souls: level * 100,
    ap,
    unlocks,
    apGained: 0,
    unlocksGained: 0,
});
// Levels 1-8: unlocks on odd levels, one AP on each even level.
const LEVELS = [
    row(1, 0, 1),
    row(2, 1, 1),
    row(3, 1, 2),
    row(4, 2, 2),
    row(5, 2, 3),
    row(6, 3, 3),
    row(7, 3, 4),
    row(8, 4, 4),
];

const ids = (order: readonly CurrencyChangeView[]) =>
    order.map((c) => `${c.abilityId}:${c.currencyType === 2 ? "U" : -c.delta}`);

const apply = (order: CurrencyChangeView[], abilityId: number): CurrencyChangeView[] => {
    const edit = appendStep(order, abilityId, ABILITIES, ULT);
    if (!edit.ok) throw new Error(`refused: ${edit.reason}`);
    return edit.order;
};

const FULL_UNLOCKS = [unlock(10), unlock(20), unlock(30), unlock(40)];

describe("orderSteps", () => {
    it("gives each step its tier and the level it becomes affordable", () => {
        const steps = orderSteps([unlock(10), ap(10, -1), unlock(20), ap(10, -2)], LEVELS);
        expect(steps).toEqual([
            { abilityId: 10, tier: 0, level: 1 },
            { abilityId: 10, tier: 1, level: 2 },
            { abilityId: 20, tier: 0, level: 3 },
            { abilityId: 10, tier: 2, level: 6 },
        ]);
    });

    it("never puts a step at a lower level than the step before it", () => {
        const steps = orderSteps([unlock(10), unlock(20), unlock(30), ap(10, -1)], LEVELS);
        expect(steps.map((s) => s.level)).toEqual([1, 3, 5, 5]);
    });

    it("has no level past the end of the level table", () => {
        const steps = orderSteps([unlock(10), ap(10, -1), ap(10, -2), ap(10, -5)], LEVELS);
        expect(steps.map((s) => s.level)).toEqual([1, 2, 6, null]);
    });
});

describe("slotState", () => {
    it("offers the unlocks and blocks tiers and the ultimate on an empty order", () => {
        const slots = slotState([], ABILITIES, ULT, LEVELS);
        expect(slots[0]![0]).toEqual({ kind: "next", level: 1 });
        expect(slots[0]![1]).toEqual({ kind: "blocked", reason: "locked" });
        expect(slots[3]![0]).toEqual({ kind: "blocked", reason: "ultimate" });
    });

    it("shows filled slots with their step and level, the next tier, and later tiers as out of order", () => {
        const slots = slotState([unlock(20), unlock(10)], ABILITIES, ULT, LEVELS);
        expect(slots[0]).toEqual([
            { kind: "filled", step: 1, level: 3 },
            { kind: "next", level: 3 },
            { kind: "blocked", reason: "tier_order" },
            { kind: "blocked", reason: "tier_order" },
        ]);
        expect(slots[1]![0]).toEqual({ kind: "filled", step: 0, level: 1 });
    });

    it("opens the ultimate once the other 3 abilities are unlocked", () => {
        const slots = slotState([unlock(10), unlock(20), unlock(30)], ABILITIES, ULT, LEVELS);
        expect(slots[3]![0]).toEqual({ kind: "next", level: 7 });
    });
});

describe("appendStep", () => {
    it("unlocks first, then buys tiers at 1, 2 and 5 points", () => {
        let order: CurrencyChangeView[] = [];
        for (let i = 0; i < 4; i++) order = apply(order, 10);
        expect(order).toEqual([unlock(10), ap(10, -1), ap(10, -2), ap(10, -5)]);
    });

    it("refuses a fifth step on a maxed ability", () => {
        const order = [unlock(10), ap(10, -1), ap(10, -2), ap(10, -5)];
        expect(appendStep(order, 10, ABILITIES, ULT)).toEqual({ ok: false, reason: "maxed" });
    });

    it("refuses the ultimate among the first 3 unlocks", () => {
        expect(appendStep([unlock(10), unlock(20)], ULT, ABILITIES, ULT)).toEqual({ ok: false, reason: "ultimate" });
        expect(appendStep([unlock(10), unlock(20), unlock(30)], ULT, ABILITIES, ULT).ok).toBe(true);
    });

    it("refuses an ability the hero does not have", () => {
        expect(appendStep([], 99, ABILITIES, ULT)).toEqual({ ok: false, reason: "unknown" });
    });

    it("does not change the order it was given", () => {
        const order = [unlock(10)];
        apply(order, 10);
        expect(order).toEqual([unlock(10)]);
    });
});

describe("removeStep", () => {
    it("removes an unlock together with that ability's tiers", () => {
        const order = [unlock(10), unlock(20), ap(10, -1), ap(20, -1), ap(10, -2)];
        expect(dependents(order, 0, ABILITIES, ULT)).toEqual([2, 4]);
        expect(ids(removeStep(order, 0, ABILITIES, ULT))).toEqual(["20:U", "20:1"]);
    });

    it("removes a tier together with the later tiers of the same ability only", () => {
        const order = [unlock(10), unlock(20), ap(10, -1), ap(20, -1), ap(10, -2), ap(10, -5)];
        expect(dependents(order, 2, ABILITIES, ULT)).toEqual([4, 5]);
        expect(ids(removeStep(order, 2, ABILITIES, ULT))).toEqual(["10:U", "20:U", "20:1"]);
    });

    it("removes the ultimate and its tiers when one of the 3 unlocks before it goes", () => {
        const order = [...FULL_UNLOCKS, ap(40, -1), ap(10, -1)];
        expect(dependents(order, 1, ABILITIES, ULT)).toEqual([3, 4]);
        expect(ids(removeStep(order, 1, ABILITIES, ULT))).toEqual(["10:U", "30:U", "10:1"]);
    });

    it("removes nothing else when the last tier goes", () => {
        const order = [unlock(10), ap(10, -1)];
        expect(dependents(order, 1, ABILITIES, ULT)).toEqual([]);
        expect(removeStep(order, 1, ABILITIES, ULT)).toEqual([unlock(10)]);
    });
});

describe("moveStep", () => {
    it("moves a step to its new index and keeps its annotation", () => {
        const edit = moveStep([unlock(10, "first"), unlock(20), ap(10, -1)], 0, 1, ABILITIES, ULT);
        expect(edit).toEqual({ ok: true, order: [unlock(20), unlock(10, "first"), ap(10, -1)] });
    });

    it("refuses a tier before its ability's unlock", () => {
        expect(moveStep([unlock(10), ap(10, -1)], 1, 0, ABILITIES, ULT)).toEqual({ ok: false, reason: "locked" });
    });

    it("refuses tiers out of order", () => {
        const order = [unlock(10), ap(10, -1), unlock(20), ap(10, -2)];
        expect(moveStep(order, 3, 1, ABILITIES, ULT)).toEqual({ ok: false, reason: "tier_order" });
    });

    it("refuses the ultimate before the third other unlock", () => {
        expect(moveStep(FULL_UNLOCKS, 3, 2, ABILITIES, ULT)).toEqual({ ok: false, reason: "ultimate" });
    });
});

describe("fillRest", () => {
    it("unlocks the 3 abilities, then the ultimate, then evens tiers out in slot order", () => {
        const filled = fillRest([], ABILITIES, ULT);
        expect(ids(filled)).toEqual([
            "10:U",
            "20:U",
            "30:U",
            "40:U",
            "10:1",
            "20:1",
            "30:1",
            "40:1",
            "10:2",
            "20:2",
            "30:2",
            "40:2",
            "10:5",
            "20:5",
            "30:5",
            "40:5",
        ]);
        expect(isValid(filled, ABILITIES, ULT)).toBe(true);
    });

    it("keeps the steps already chosen and gives the lowest tier the next point", () => {
        const filled = fillRest([unlock(20), ap(20, -1), ap(20, -2)], ABILITIES, ULT);
        expect(ids(filled).slice(0, 9)).toEqual([
            "20:U",
            "20:1",
            "20:2",
            "10:U",
            "30:U",
            "40:U",
            "10:1",
            "30:1",
            "40:1",
        ]);
        expect(filled).toHaveLength(16);
    });
});

describe("isValid", () => {
    it("accepts a complete order", () => {
        expect(isValid(fillRest([], ABILITIES, ULT), ABILITIES, ULT)).toBe(true);
    });

    it.each([
        ["a free unlock", [{ ...unlock(10), delta: 0 }]],
        ["a wrong tier cost", [unlock(10), ap(10, -2)]],
        ["points on a locked ability", [ap(10, -1)]],
        ["an unknown ability", [unlock(99)]],
        ["an early ultimate", [unlock(10), unlock(40)]],
        ["a repeated unlock", [unlock(10), unlock(10)]],
        ["an unknown currency", [{ ...unlock(10), currencyType: 3 }]],
    ])("rejects %s", (_name, order) => {
        expect(isValid(order, ABILITIES, ULT)).toBe(false);
    });
});

describe("loadOrder", () => {
    it("drops a leftover tail and counts the dropped steps", () => {
        const complete = fillRest([], ABILITIES, ULT);
        const loaded = loadOrder([...complete, unlock(10), ap(10, -1), ap(20, -1)], ABILITIES, ULT);
        expect(loaded).toEqual({ order: complete, dropped: 3, moved: 0 });
    });

    it("drops everything from the first repeated unlock, as the game files' tails start", () => {
        const loaded = loadOrder([unlock(10), unlock(20), unlock(10), unlock(30)], ABILITIES, ULT);
        expect(loaded).toEqual({ order: [unlock(10), unlock(20)], dropped: 2, moved: 0 });
    });

    it("turns free unlocks into paid ones without counting them as dropped", () => {
        const loaded = loadOrder([{ ...unlock(10), delta: 0 }, ap(10, -1)], ABILITIES, ULT);
        expect(loaded).toEqual({ order: [unlock(10), ap(10, -1)], dropped: 0, moved: 0 });
    });

    it("moves an early ultimate and its tiers after the third other unlock", () => {
        const loaded = loadOrder([unlock(10), unlock(40), ap(40, -1), unlock(20), unlock(30)], ABILITIES, ULT);
        expect(ids(loaded.order)).toEqual(["10:U", "20:U", "30:U", "40:U", "40:1"]);
        expect(loaded.moved).toBe(2);
        expect(loaded.dropped).toBe(0);
    });

    it("drops steps on abilities the hero no longer has", () => {
        const loaded = loadOrder([unlock(10), unlock(99), ap(99, -1), ap(10, -1)], ABILITIES, ULT);
        expect(loaded).toEqual({ order: [unlock(10), ap(10, -1)], dropped: 2, moved: 0 });
    });

    it("always gives an order the editor accepts", () => {
        const loaded = loadOrder([ap(10, -1), unlock(40), unlock(10), ap(10, -5), unlock(20)], ABILITIES, ULT);
        expect(isValid(loaded.order, ABILITIES, ULT)).toBe(true);
    });
});

describe("pointsSummary", () => {
    it("sums the points spent against what the last level gives and names the last step's level", () => {
        const order = [unlock(10), ap(10, -1), ap(10, -2)];
        expect(pointsSummary(order, LEVELS)).toEqual({ spent: 3, available: 4, lastLevel: 6 });
    });

    it("has no level for an empty order or a missing level table", () => {
        expect(pointsSummary([], LEVELS)).toEqual({ spent: 0, available: 4, lastLevel: null });
        expect(pointsSummary([unlock(10)], [])).toEqual({ spent: 0, available: null, lastLevel: null });
    });
});

describe("abilityProgress", () => {
    it("offers each unlock on an empty order and holds the ultimate back", () => {
        const progress = abilityProgress([], ABILITIES, ULT, LEVELS);
        expect(progress[0]).toEqual({ tier: null, lastStep: null, next: { kind: "next", tier: 0, level: 1 } });
        expect(progress[3]).toEqual({ tier: null, lastStep: null, next: { kind: "blocked", reason: "ultimate" } });
    });

    it("gives the highest tier taken, the ability's latest step and its next tier", () => {
        const order = [unlock(10), unlock(20), ap(10, -1), ap(20, -1)];
        const progress = abilityProgress(order, ABILITIES, ULT, LEVELS);
        expect(progress[0]).toEqual({ tier: 1, lastStep: 2, next: { kind: "next", tier: 2, level: 8 } });
        expect(progress[1]).toEqual({ tier: 1, lastStep: 3, next: { kind: "next", tier: 2, level: 8 } });
    });

    it("says maxed once all three tiers are taken", () => {
        const order = [unlock(10), ap(10, -1), ap(10, -2), ap(10, -5)];
        expect(abilityProgress(order, ABILITIES, ULT, LEVELS)[0]).toEqual({
            tier: 3,
            lastStep: 3,
            next: { kind: "blocked", reason: "maxed" },
        });
    });
});
