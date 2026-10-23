import type { CurrencyChangeView } from "@deadlock-plus/ipc-types/CurrencyChangeView";
import { describe, expect, it } from "vitest";
import { createProgressionTable, type Level } from "../levels";
import {
    abilityProgress,
    appendStep,
    dependents,
    isUnlocksFirst,
    isValid,
    loadOrder,
    moveStep,
    orderSteps,
    pointsSummary,
    previewUnlocksFirst,
    readSteps,
    removeStep,
    slotState,
    stepsSummary,
    type OrderStep,
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

// The game's level table (heroes.vdata hero_base m_mapLevelInfo): unlocks at levels 1, 3, 5 and 8, one AP at every
// other level.
const GAME_SOULS = [
    0, 200, 500, 900, 1400, 2000, 2600, 3200, 3900, 4600, 5300, 6000, 6800, 7600, 8400, 9200, 10100, 11000, 11900,
    12800, 13800, 14900, 16100, 17400, 18900, 20600, 22500, 24600, 26900, 29400, 32100, 35000, 38100, 41400, 44900,
    48600,
];
const GAME_UNLOCK_LEVELS = [1, 3, 5, 8];
const GAME_LEVELS = createProgressionTable(
    GAME_SOULS.map((souls, i) => {
        const unlocks = GAME_UNLOCK_LEVELS.includes(i + 1) ? 1 : 0;
        return { level: i + 1, souls, ap: 1 - unlocks, unlocks };
    }),
).levels;

const ids = (order: readonly CurrencyChangeView[]) =>
    order.map((c) => `${c.abilityId}:${c.currencyType === 2 ? "U" : -c.delta}`);

const apply = (order: CurrencyChangeView[], abilityId: number): CurrencyChangeView[] => {
    const edit = appendStep(order, abilityId, ABILITIES, ULT);
    if (!edit.ok) throw new Error(`refused: ${edit.reason}`);
    return edit.order;
};

const FULL_UNLOCKS = [unlock(10), unlock(20), unlock(30), unlock(40)];

// Every unlock, the ultimate last of them, then each tier in slot order.
const COMPLETE = [...FULL_UNLOCKS, ...[-1, -2, -5].flatMap((delta) => ABILITIES.map((id) => ap(id, delta)))];

// Seven: Static Charge, Power Surge, Lightning Ball, Storm Cloud (ultimate).
const [STATIC_CHARGE, POWER_SURGE, LIGHTNING_BALL, STORM_CLOUD] = [1074714947, 539192269, 1065103387, 2061574352];
// The game's own copy code of a user's Seven build: every unlock first, then every ability point step.
const SEVEN_ORDER = [
    unlock(STATIC_CHARGE),
    unlock(POWER_SURGE),
    unlock(LIGHTNING_BALL),
    unlock(STORM_CLOUD),
    ap(STATIC_CHARGE, -1),
    ap(POWER_SURGE, -1),
    ap(POWER_SURGE, -2),
    ap(POWER_SURGE, -5),
    ap(LIGHTNING_BALL, -1),
    ap(STORM_CLOUD, -1),
    ap(STORM_CLOUD, -2),
    ap(STATIC_CHARGE, -2),
    ap(STATIC_CHARGE, -5),
    ap(STORM_CLOUD, -5),
    ap(LIGHTNING_BALL, -2),
    ap(LIGHTNING_BALL, -5),
];

describe("unlocks and ability points as two queues", () => {
    it("trains the game-stored Seven order's first point at level 2, between the first two unlocks", () => {
        for (const steps of [orderSteps(SEVEN_ORDER, GAME_LEVELS), readSteps(SEVEN_ORDER, GAME_LEVELS)]) {
            expect(steps.slice(0, 5).map((s) => [s.abilityId, s.tier, s.level])).toEqual([
                [STATIC_CHARGE, 0, 1],
                [POWER_SURGE, 0, 3],
                [LIGHTNING_BALL, 0, 5],
                [STORM_CLOUD, 0, 8],
                [STATIC_CHARGE, 1, 2],
            ]);
        }
    });

    it("holds a point on an ability unlocked later until that unlock, and the points after it too", () => {
        const steps = orderSteps([unlock(10), unlock(20), unlock(30), ap(30, -1), ap(10, -1)], GAME_LEVELS);
        expect(steps.map((s) => s.level)).toEqual([1, 3, 5, 5, 5]);
    });

    it("never holds an unlock behind a point step still waiting", () => {
        const steps = orderSteps([unlock(10), ap(10, -1), ap(10, -2), unlock(20)], GAME_LEVELS);
        expect(steps.map((s) => [s.abilityId, s.tier, s.level])).toEqual([
            [10, 0, 1],
            [10, 1, 2],
            [10, 2, 6],
            [20, 0, 3],
        ]);
    });

    it("accepts points stored before their unlock: they wait for it", () => {
        expect(isValid([ap(10, -1), unlock(10)], ABILITIES, ULT)).toBe(true);
        expect(orderSteps([ap(10, -1), unlock(10)], GAME_LEVELS)).toEqual([
            { abilityId: 10, tier: 1, level: 2 },
            { abilityId: 10, tier: 0, level: 1 },
        ]);
    });
});

const levelOf = (steps: readonly OrderStep[]) => new Map(steps.map((s) => [`${s.abilityId}:${s.tier}`, s.level]));

describe("previewUnlocksFirst", () => {
    const mixed = [unlock(10), ap(10, -1), unlock(20), ap(20, -1), ap(10, -2), unlock(30), unlock(40), ap(40, -1)];

    it("moves every unlock before every point step, each keeping its order", () => {
        expect(ids(previewUnlocksFirst(mixed))).toEqual([
            "10:U",
            "20:U",
            "30:U",
            "40:U",
            "10:1",
            "20:1",
            "10:2",
            "40:1",
        ]);
        expect(previewUnlocksFirst(SEVEN_ORDER)).toEqual(SEVEN_ORDER);
    });

    it("leaves every step at the level it had", () => {
        const before = orderSteps(mixed, GAME_LEVELS);
        const after = orderSteps(previewUnlocksFirst(mixed), GAME_LEVELS);
        expect(levelOf(after)).toEqual(levelOf(before));
        expect(isValid(previewUnlocksFirst(mixed), ABILITIES, ULT)).toBe(true);
    });
});

describe("isUnlocksFirst", () => {
    it("is true once no point step comes before an unlock", () => {
        expect(isUnlocksFirst([])).toBe(true);
        expect(isUnlocksFirst(SEVEN_ORDER)).toBe(true);
        expect(isUnlocksFirst(COMPLETE)).toBe(true);
        expect(isUnlocksFirst([unlock(10), unlock(20), ap(10, -1)])).toBe(true);
    });

    it("is false while a point step comes before an unlock", () => {
        expect(isUnlocksFirst([unlock(10), ap(10, -1), unlock(20)])).toBe(false);
        expect(isUnlocksFirst([ap(10, -1), unlock(10)])).toBe(false);
    });

    it("holds for the result of previewUnlocksFirst", () => {
        const mixed = [unlock(10), ap(10, -1), unlock(20), ap(20, -1), unlock(30)];
        expect(isUnlocksFirst(previewUnlocksFirst(mixed))).toBe(true);
    });
});

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

    it("keeps stored order and gives a point step stored after unlocks its own, earlier level", () => {
        const steps = orderSteps([unlock(10), unlock(20), unlock(30), ap(10, -1)], LEVELS);
        expect(steps.map((s) => [s.abilityId, s.tier, s.level])).toEqual([
            [10, 0, 1],
            [20, 0, 3],
            [30, 0, 5],
            [10, 1, 2],
        ]);
    });

    it("puts each step at its own level on the game's table, an upgrade between unlocks", () => {
        const order = [unlock(10), ap(10, -1), unlock(20), ap(10, -2), unlock(30), ap(20, -1), unlock(40)];
        expect(orderSteps(order, GAME_LEVELS).map((s) => [s.abilityId, s.tier, s.level])).toEqual([
            [10, 0, 1],
            [10, 1, 2],
            [20, 0, 3],
            [10, 2, 6],
            [30, 0, 5],
            [20, 1, 7],
            [40, 0, 8],
        ]);
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
        expect(edit).toEqual({ ok: true, order: [unlock(20), unlock(10, "first"), ap(10, -1)], changed: true });
    });

    it("moves a step across the other currency's steps, which changes only the preview", () => {
        const edit = moveStep([unlock(10), ap(10, -1)], 1, 0, ABILITIES, ULT);
        expect(edit).toEqual({ ok: true, order: [ap(10, -1), unlock(10)], changed: true });
        expect(edit.ok && levelOf(orderSteps(edit.order, GAME_LEVELS))).toEqual(
            levelOf(orderSteps([unlock(10), ap(10, -1)], GAME_LEVELS)),
        );
    });

    it("changes when a step comes once it passes a step of its own currency", () => {
        const edit = moveStep([unlock(10), ap(10, -1), unlock(20), ap(20, -1)], 3, 1, ABILITIES, ULT);
        expect(edit.ok && ids(edit.order)).toEqual(["10:U", "20:1", "10:1", "20:U"]);
        expect(edit.ok && orderSteps(edit.order, GAME_LEVELS).map((s) => s.level)).toEqual([1, 3, 4, 3]);
    });

    it("makes a moved unlock's points wait for it", () => {
        const edit = moveStep([unlock(10), unlock(20), unlock(30), ap(20, -1)], 1, 3, ABILITIES, ULT);
        expect(edit.ok && ids(edit.order)).toEqual(["10:U", "30:U", "20:1", "20:U"]);
        expect(edit.ok && orderSteps(edit.order, GAME_LEVELS).map((s) => s.level)).toEqual([1, 3, 5, 5]);
    });

    it("reports a move to the same index as unchanged", () => {
        const order = [unlock(10), unlock(20), ap(10, -1)];
        expect(moveStep(order, 1, 1, ABILITIES, ULT)).toEqual({ ok: true, order, changed: false });
    });

    it("reports a drop outside the order as unchanged", () => {
        const order = [unlock(10), unlock(20), ap(10, -1)];
        expect(moveStep(order, 1, 9, ABILITIES, ULT)).toEqual({ ok: true, order, changed: false });
        expect(moveStep(order, 1, -1, ABILITIES, ULT)).toEqual({ ok: true, order, changed: false });
        expect(moveStep(order, 7, 0, ABILITIES, ULT)).toEqual({ ok: true, order, changed: false });
    });

    it("reports a real move as changed", () => {
        const edit = moveStep([unlock(10), unlock(20)], 0, 1, ABILITIES, ULT);
        expect(edit.ok && edit.changed).toBe(true);
    });

    it("refuses tiers out of order", () => {
        const order = [unlock(10), ap(10, -1), unlock(20), ap(10, -2)];
        expect(moveStep(order, 3, 1, ABILITIES, ULT)).toEqual({ ok: false, reason: "tier_order" });
    });

    it("refuses the ultimate before the third other unlock", () => {
        expect(moveStep(FULL_UNLOCKS, 3, 2, ABILITIES, ULT)).toEqual({ ok: false, reason: "ultimate" });
    });
});

describe("isValid", () => {
    it("accepts a complete order", () => {
        expect(isValid(COMPLETE, ABILITIES, ULT)).toBe(true);
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
        const loaded = loadOrder([...COMPLETE, unlock(10), ap(10, -1), ap(20, -1)], ABILITIES, ULT);
        expect(loaded).toEqual({ order: COMPLETE, dropped: 3, moved: 0 });
    });

    it("drops everything from the first repeated unlock, as the game files' tails start", () => {
        const loaded = loadOrder([unlock(10), unlock(20), unlock(10), unlock(30)], ABILITIES, ULT);
        expect(loaded).toEqual({ order: [unlock(10), unlock(20)], dropped: 2, moved: 0 });
    });

    it("turns free unlocks into paid ones without counting them as dropped", () => {
        const loaded = loadOrder([{ ...unlock(10), delta: 0 }, ap(10, -1)], ABILITIES, ULT);
        expect(loaded).toEqual({ order: [unlock(10), ap(10, -1)], dropped: 0, moved: 0 });
    });

    it("moves an early ultimate after the third other unlock and leaves its points where they are", () => {
        const loaded = loadOrder([unlock(10), unlock(40), ap(40, -1), unlock(20), unlock(30)], ABILITIES, ULT);
        expect(ids(loaded.order)).toEqual(["10:U", "40:1", "20:U", "30:U", "40:U"]);
        expect(loaded.moved).toBe(1);
        expect(loaded.dropped).toBe(0);
    });

    it("keeps points stored before their unlock where they are", () => {
        const raw = [ap(20, -1), ap(10, -1), unlock(10), unlock(20)];
        expect(loadOrder(raw, ABILITIES, ULT)).toEqual({ order: raw, dropped: 0, moved: 0 });
    });

    it("drops points on an ability the order never unlocks", () => {
        expect(loadOrder([unlock(10), ap(20, -1), ap(10, -1)], ABILITIES, ULT)).toEqual({
            order: [unlock(10), ap(10, -1)],
            dropped: 1,
            moved: 0,
        });
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

    it("sums steps read as the game reads them", () => {
        const steps = readSteps([ap(30, -1), unlock(10), ap(10, -1), ap(10, -2)], LEVELS);
        expect(stepsSummary(steps, LEVELS)).toEqual({ spent: 3, available: 4, lastLevel: 6 });
    });
});

describe("abilityProgress", () => {
    it("offers each unlock on an empty order and holds the ultimate back", () => {
        const progress = abilityProgress([], ABILITIES, ULT, LEVELS);
        expect(progress[0]).toEqual({ tier: null, lastStep: null, next: { kind: "next", tier: 0, level: 1 } });
        expect(progress[3]).toEqual({ tier: null, lastStep: null, next: { kind: "blocked", reason: "ultimate" } });
    });

    it("gives the highest tier taken, the step that took it and its next tier", () => {
        const order = [unlock(10), unlock(20), ap(10, -1), ap(20, -1)];
        const progress = abilityProgress(order, ABILITIES, ULT, LEVELS);
        expect(progress[0]).toEqual({ tier: 1, lastStep: 2, next: { kind: "next", tier: 2, level: 8 } });
        expect(progress[1]).toEqual({ tier: 1, lastStep: 3, next: { kind: "next", tier: 2, level: 8 } });
    });

    it("points at the highest tier's step even when the unlock is stored after it", () => {
        expect(abilityProgress([ap(10, -1), unlock(10)], ABILITIES, ULT, LEVELS)[0]).toMatchObject({
            tier: 1,
            lastStep: 0,
        });
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

describe("readSteps", () => {
    it("keeps a stored order as the game reads it, with each step's level", () => {
        const steps = readSteps([unlock(10), ap(10, -1), unlock(20), ap(10, -2)], LEVELS);
        expect(steps).toEqual([
            { abilityId: 10, tier: 0, level: 1 },
            { abilityId: 10, tier: 1, level: 2 },
            { abilityId: 20, tier: 0, level: 3 },
            { abilityId: 10, tier: 2, level: 6 },
        ]);
    });

    it("leaves an early ultimate where it is", () => {
        expect(readSteps([unlock(40), unlock(10)], LEVELS).map((s) => s.abilityId)).toEqual([40, 10]);
    });

    it("skips points on a locked ability and reads a free unlock as an unlock", () => {
        const steps = readSteps([ap(30, -1), { ...unlock(10), delta: 0 }, ap(10, -1)], LEVELS);
        expect(steps.map((s) => [s.abilityId, s.tier])).toEqual([
            [10, 0],
            [10, 1],
        ]);
    });

    it("stops at the leftover tail: a repeated unlock or a tier past the last", () => {
        expect(readSteps([unlock(10), unlock(20), unlock(10), unlock(30)], LEVELS)).toHaveLength(2);
        const maxed = [unlock(10), ap(10, -1), ap(10, -2), ap(10, -5), ap(10, -1), unlock(20)];
        expect(readSteps(maxed, LEVELS)).toHaveLength(4);
    });
});
