import type { HeroStatsRow, PerformanceCurvePoint } from "@deadlock-plus/deadlock-api";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { CurrencyChangeView } from "@deadlock-plus/ipc-types/CurrencyChangeView";
import type { ItemStat } from "@deadlock-plus/ipc-types/ItemStat";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: {} }));
vi.mock("$lib/core/tauri", () => ({ command: vi.fn(), fileSrc: (p: string) => p }));
vi.mock("$lib/features/gamedata/gamedata", () => ({ loadItemArt: vi.fn() }));

import type { ShopItem } from "../catalog";
import type { Level } from "../levels";
import {
    apTicks,
    breakpoints,
    curvePoints,
    dropRef,
    formatClock,
    itemsBoughtBy,
    levelAt,
    loadNetWorthCurve,
    packLane,
    placeItems,
    quickBuyOrder,
    readoutPlacement,
    soulScale,
    soulTicks,
    statsAt,
    timeFor,
    timelineEnd,
    timelineLayout,
    timelineSize,
    type CurveApi,
} from "./timeline";

const item = (id: number, cost: number, over: Partial<ShopItem> = {}): ShopItem => ({
    id,
    className: `item_${id}`,
    name: `Item ${id}`,
    slot: "spirit",
    tier: 1,
    cost,
    active: false,
    componentIds: [],
    shopable: true,
    disabled: false,
    ...over,
});

const BY_ID = new Map<number, ShopItem>([
    [1, item(1, 800)],
    [2, item(2, 1600, { tier: 2 })],
    [3, item(3, 3200, { tier: 3, componentIds: [1] })],
    [4, item(4, 500)],
    [9, item(9, 800, { shopable: false })],
]);

const category = (mods: number[], optional = false): ModCategoryView => ({
    mods: mods.map((abilityId) => ({
        abilityId,
        annotation: null,
        requiredFlexSlots: null,
        sellPriority: null,
        imbueTargetAbilityId: null,
    })),
    name: "C",
    description: "",
    width: null,
    height: null,
    optional,
});

const buildOf = (categories: ModCategoryView[], abilityOrder: CurrencyChangeView[] = []): BuildView => ({
    heroBuildId: 1,
    heroId: 7,
    authorAccountId: 1,
    lastUpdatedTimestamp: null,
    name: "B",
    description: "",
    language: 0,
    version: 1,
    originBuildId: null,
    modCategories: categories,
    abilityOrder,
    tags: [],
    developmentBuild: false,
    publishTimestamp: null,
    favorited: false,
});

const row = (level: number, souls: number, ap: number, unlocks: number, apGained = 0, unlocksGained = 0): Level => ({
    level,
    souls,
    ap,
    unlocks,
    apGained,
    unlocksGained,
});
// Unlocks at levels 1, 3, 5, 8 as the game's table; one AP at each other level.
const LEVELS: Level[] = [
    row(1, 0, 0, 1, 0, 1),
    row(2, 200, 1, 1, 1, 0),
    row(3, 500, 1, 2, 0, 1),
    row(4, 900, 2, 2, 1, 0),
    row(5, 1400, 2, 3, 0, 1),
    row(6, 2000, 3, 3, 1, 0),
    row(7, 2600, 4, 3, 1, 0),
    row(8, 3200, 4, 4, 0, 1),
    row(9, 4000, 5, 4, 1, 0),
];

const unlock = (abilityId: number): CurrencyChangeView => ({ abilityId, currencyType: 2, delta: -1, annotation: null });
const ap = (abilityId: number, delta: number): CurrencyChangeView => ({
    abilityId,
    currencyType: 1,
    delta,
    annotation: null,
});

describe("quickBuyOrder", () => {
    it("lists categories in order and items in order, leaving optional categories out", () => {
        const build = buildOf([category([1, 2]), category([4], true), category([3])]);
        expect(quickBuyOrder(build, BY_ID)).toEqual([
            { abilityId: 1, ref: { category: 0, index: 0 } },
            { abilityId: 2, ref: { category: 0, index: 1 } },
            { abilityId: 3, ref: { category: 2, index: 0 } },
        ]);
    });

    it("leaves out items the shop no longer sells", () => {
        const build = buildOf([category([9, 1])]);
        expect(quickBuyOrder(build, BY_ID).map((e) => e.abilityId)).toEqual([1]);
    });

    it("keeps an item listed twice", () => {
        const build = buildOf([category([1]), category([1])]);
        expect(quickBuyOrder(build, BY_ID).map((e) => e.ref)).toEqual([
            { category: 0, index: 0 },
            { category: 1, index: 0 },
        ]);
    });
});

describe("placeItems", () => {
    it("places each item at the net worth its running cost is reached", () => {
        const build = buildOf([category([1, 2]), category([4])]);
        expect(placeItems(build, BY_ID).map((e) => [e.abilityId, e.cost, e.netWorth])).toEqual([
            [1, 800, 800],
            [2, 1600, 2400],
            [4, 500, 2900],
        ]);
    });

    it("discounts an upgrade by an owned component, as chainCost does", () => {
        const build = buildOf([category([1, 3])]);
        expect(placeItems(build, BY_ID).map((e) => [e.cost, e.netWorth])).toEqual([
            [800, 800],
            [2400, 3200],
        ]);
    });

    it("prices a repeat at nothing, so it sits on the copy before it", () => {
        const build = buildOf([category([1, 4, 1])]);
        expect(placeItems(build, BY_ID).map((e) => [e.cost, e.netWorth])).toEqual([
            [800, 800],
            [500, 1300],
            [0, 1300],
        ]);
    });
});

describe("breakpoints", () => {
    it("names each ability step at the net worth of the level that affords it", () => {
        const order = [unlock(10), unlock(20), ap(10, -1), unlock(30), ap(10, -2)];
        expect(breakpoints(order, LEVELS)).toEqual([
            { abilityId: 10, tier: 0, level: 1, netWorth: 600 },
            { abilityId: 20, tier: 0, level: 3, netWorth: 1100 },
            { abilityId: 10, tier: 1, level: 3, netWorth: 1100 },
            { abilityId: 30, tier: 0, level: 5, netWorth: 2000 },
            { abilityId: 10, tier: 2, level: 6, netWorth: 2600 },
        ]);
    });

    it("leaves out steps past the level table", () => {
        const order = [unlock(10), ap(10, -1), ap(10, -2), ap(10, -5)];
        expect(breakpoints(order, LEVELS).map((b) => b.tier)).toEqual([0, 1, 2]);
    });
});

describe("apTicks", () => {
    it("marks every level that grants an ability point, up to the end", () => {
        expect(apTicks(LEVELS, 3000)).toEqual([800, 1500, 2600]);
    });
});

describe("timelineEnd", () => {
    it("is the build's total cost when that is larger", () => {
        expect(timelineEnd([{ netWorth: 5000 }], [{ netWorth: 2600 }], LEVELS)).toBe(5000);
    });

    it("is the last named breakpoint when that is larger", () => {
        expect(timelineEnd([{ netWorth: 800 }], [{ netWorth: 2600 }], LEVELS)).toBe(2600);
    });

    it("falls back to the last level when the build is empty", () => {
        expect(timelineEnd([], [], LEVELS)).toBe(4600);
    });
});

describe("itemsBoughtBy", () => {
    it("lists the items whose running cost the net worth has reached", () => {
        const entries = placeItems(buildOf([category([1, 2, 4])]), BY_ID);
        expect(itemsBoughtBy(entries, 2400)).toEqual([1, 2]);
        expect(itemsBoughtBy(entries, 799)).toEqual([]);
    });
});

describe("statsAt", () => {
    const stat = (value: number, flat = true): ItemStat => ({
        key: "TechPower",
        value,
        unit: null,
        label: "Spirit Power",
        flat,
        provides: "TechPower",
        section: null,
    });
    const statsById = new Map<number, ItemStat[]>([
        [1, [stat(4)]],
        [2, [stat(6), { ...stat(30, false), key: "Conditional" }]],
    ]);

    it("sums the flat stats of the items bought so far", () => {
        const entries = placeItems(buildOf([category([1, 2])]), BY_ID);
        expect(statsAt(entries, 2400, statsById, BY_ID).map((s) => s.total)).toEqual([10]);
        expect(statsAt(entries, 1000, statsById, BY_ID).map((s) => s.total)).toEqual([4]);
    });
});

describe("levelAt", () => {
    it("reads the level from the souls earned past the starting 600", () => {
        expect(levelAt(LEVELS, 600)).toBe(1);
        expect(levelAt(LEVELS, 1099)).toBe(2);
        expect(levelAt(LEVELS, 1100)).toBe(3);
        expect(levelAt(LEVELS, 100)).toBe(1);
        expect(levelAt(LEVELS, 99_999)).toBe(9);
    });

    it("is null without a level table", () => {
        expect(levelAt([], 1000)).toBeNull();
    });
});

describe("dropRef", () => {
    const build = buildOf([category([1, 2]), category([4], true), category([3])]);

    it("inserts before the first item whose running cost reaches the point", () => {
        expect(dropRef(build, BY_ID, 900)).toEqual({ category: 0, index: 1 });
        expect(dropRef(build, BY_ID, 0)).toEqual({ category: 0, index: 0 });
        expect(dropRef(build, BY_ID, 2400)).toEqual({ category: 0, index: 1 });
        expect(dropRef(build, BY_ID, 2401)).toEqual({ category: 2, index: 0 });
    });

    it("appends to the last category Quick Buy uses past the last item", () => {
        expect(dropRef(build, BY_ID, 99_999)).toEqual({ category: 2, index: 1 });
        const trailingOptional = buildOf([category([1]), category([4], true)]);
        expect(dropRef(trailingOptional, BY_ID, 99_999)).toEqual({ category: 0, index: 1 });
    });

    it("prices the order without the items being moved", () => {
        // Without item 1 (800), item 2 is reached at 1600, so 1000 lands before it.
        expect(dropRef(build, BY_ID, 1000, [{ category: 0, index: 0 }])).toEqual({ category: 0, index: 1 });
        expect(dropRef(build, BY_ID, 1000)).toEqual({ category: 0, index: 1 });
        expect(dropRef(build, BY_ID, 1700, [{ category: 0, index: 0 }])).toEqual({ category: 2, index: 0 });
        expect(dropRef(build, BY_ID, 1700)).toEqual({ category: 0, index: 1 });
    });

    it("is null when no category feeds Quick Buy", () => {
        expect(dropRef(buildOf([]), BY_ID, 500)).toBeNull();
        expect(dropRef(buildOf([category([1], true)]), BY_ID, 500)).toBeNull();
    });

    it("lands in an empty category Quick Buy uses", () => {
        expect(dropRef(buildOf([category([])]), BY_ID, 500)).toEqual({ category: 0, index: 0 });
    });
});

const curvePoint = (game_time: number, net_worth_avg: number | null): PerformanceCurvePoint =>
    ({ game_time, net_worth_avg, net_worth_std: 0 }) as PerformanceCurvePoint;

describe("curvePoints", () => {
    it("starts at the starting souls and skips points with no data", () => {
        expect(curvePoints([curvePoint(180, 2400), curvePoint(360, null), curvePoint(540, 7000)])).toEqual([
            { time: 0, netWorth: 600 },
            { time: 180, netWorth: 2400 },
            { time: 540, netWorth: 7000 },
        ]);
    });

    it("is empty when no point has data", () => {
        expect(curvePoints([curvePoint(180, null)])).toEqual([]);
    });
});

describe("timeFor", () => {
    const curve = [
        { time: 0, netWorth: 600 },
        { time: 180, netWorth: 2400 },
        { time: 540, netWorth: 7000 },
    ];

    it("interpolates between the points around the net worth", () => {
        expect(timeFor(curve, 1500)).toBe(90);
        expect(timeFor(curve, 4700)).toBe(360);
        expect(timeFor(curve, 2400)).toBe(180);
    });

    it("is zero before the starting souls run out", () => {
        expect(timeFor(curve, 300)).toBe(0);
    });

    it("is null past the last point or without a curve", () => {
        expect(timeFor(curve, 7001)).toBeNull();
        expect(timeFor([], 1000)).toBeNull();
    });
});

describe("formatClock", () => {
    it("rounds to the nearest 30 seconds", () => {
        expect(formatClock(750)).toBe("12:30");
        expect(formatClock(764)).toBe("12:30");
        expect(formatClock(766)).toBe("13:00");
        expect(formatClock(5)).toBe("0:00");
        expect(formatClock(3725)).toBe("62:00");
    });
});

describe("loadNetWorthCurve", () => {
    const HERO = 7;
    const fakeApi = (matchesByMin: Record<string, number>) => {
        const api = {
            heroStats: vi.fn(async (filter: { minAverageBadge?: number }): Promise<HeroStatsRow[]> => [
                { hero_id: HERO, matches: matchesByMin[String(filter.minAverageBadge)] ?? 0 },
            ]),
            performanceCurve: vi.fn(async () => [curvePoint(180, 2400)]),
        };
        return api satisfies CurveApi;
    };

    it("asks for every rank when the rank is unknown", async () => {
        const api = fakeApi({});
        const curve = await loadNetWorthCurve(api, HERO, null);
        expect(api.heroStats).not.toHaveBeenCalled();
        expect(api.performanceCurve).toHaveBeenCalledWith(HERO, { gameMode: "normal" });
        expect(curve).toEqual({
            points: [
                { time: 0, netWorth: 600 },
                { time: 180, netWorth: 2400 },
            ],
            group: { kind: "allRanks" },
        });
    });

    it("keeps the rank's own tier when it has enough matches", async () => {
        const api = fakeApi({ "71": 500 });
        const curve = await loadNetWorthCurve(api, HERO, 73);
        expect(api.performanceCurve).toHaveBeenCalledWith(HERO, {
            gameMode: "normal",
            minAverageBadge: 71,
            maxAverageBadge: 76,
        });
        expect(curve?.group).toEqual({ kind: "rank", tier: 7 });
    });

    it("widens the rank band while the sample is small", async () => {
        const api = fakeApi({ "71": 50, "61": 500 });
        const curve = await loadNetWorthCurve(api, HERO, 73);
        expect(api.performanceCurve).toHaveBeenCalledWith(HERO, {
            gameMode: "normal",
            minAverageBadge: 61,
            maxAverageBadge: 86,
        });
        expect(curve?.group).toEqual({ kind: "range", fromTier: 6, toTier: 8 });
    });

    it("is null when the curve has no data", async () => {
        const api = fakeApi({});
        api.performanceCurve.mockResolvedValue([curvePoint(180, null)]);
        expect(await loadNetWorthCurve(api, HERO, null)).toBeNull();
    });
});

describe("soulScale", () => {
    const scale = soulScale(40_000);

    it("spreads the early game: a quarter of the souls takes half the width", () => {
        expect(scale.at(0)).toBe(0);
        expect(scale.at(10_000)).toBeCloseTo(0.5);
        expect(scale.at(40_000)).toBe(1);
    });

    it("maps a fraction of the width back to its net worth", () => {
        expect(scale.netWorthAt(0.5)).toBeCloseTo(10_000);
        expect(scale.netWorthAt(scale.at(1234))).toBeCloseTo(1234);
    });

    it("clamps to the strip", () => {
        expect(scale.at(-5)).toBe(0);
        expect(scale.at(90_000)).toBe(1);
        expect(scale.netWorthAt(2)).toBe(40_000);
    });

    it("is flat rather than NaN for an empty strip", () => {
        expect(soulScale(0).at(100)).toBe(0);
    });
});

describe("soulTicks", () => {
    const px = (end: number, width: number) => (souls: number) => soulScale(end).at(souls) * width;

    it("labels round soul counts up to the end, in order", () => {
        const ticks = soulTicks(50_000, 1000, 40);
        expect(ticks).toEqual(expect.arrayContaining([1000, 2000, 5000, 10_000, 20_000, 40_000]));
        expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
        expect(Math.max(...ticks)).toBeLessThanOrEqual(50_000);
    });

    it("keeps every label at least the gap apart", () => {
        for (const width of [300, 700, 1400]) {
            const at = px(50_000, width);
            const ticks = soulTicks(50_000, width, 40);
            for (let i = 1; i < ticks.length; i++) expect(at(ticks[i]!) - at(ticks[i - 1]!)).toBeGreaterThanOrEqual(40);
        }
    });

    it("drops the minor ticks first when the strip is narrow", () => {
        const ticks = soulTicks(50_000, 300, 40);
        expect(ticks).toEqual(expect.arrayContaining([1000, 10_000, 20_000, 40_000]));
        expect(ticks).not.toContain(5000);
    });
});

describe("packLane", () => {
    const opts = { size: 24, gap: 2, width: 300, rows: 3 };
    const pitch = opts.size + opts.gap;

    const noOverlap = (packed: { x: number; row: number }[]) => {
        for (const a of packed)
            for (const b of packed)
                if (a !== b && a.row === b.row) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(pitch - 1e-9);
    };

    it("keeps icons that do not touch at their own x on the first row", () => {
        expect(packLane([20, 100], opts)).toEqual([
            { x: 20, row: 0 },
            { x: 100, row: 0 },
        ]);
    });

    it("stacks icons at the same x into rows", () => {
        expect(packLane([50, 50, 50], opts)).toEqual([
            { x: 50, row: 0 },
            { x: 50, row: 1 },
            { x: 50, row: 2 },
        ]);
    });

    it("nudges along a row once every row is taken, never overlapping", () => {
        const packed = packLane([50, 50, 50, 50], opts);
        noOverlap(packed);
        expect(packed[3]!.x).toBeGreaterThanOrEqual(50 + pitch);
    });

    it("keeps every icon inside both edges", () => {
        const packed = packLane([0, 300], opts);
        expect(packed[0]!.x).toBe(12);
        expect(packed[1]!.x).toBe(288);
    });

    it("pushes a crowd at the right edge back inside without overlap", () => {
        const packed = packLane(Array(20).fill(295), opts);
        noOverlap(packed);
        for (const p of packed) {
            expect(p.x).toBeGreaterThanOrEqual(12);
            expect(p.x).toBeLessThanOrEqual(288);
        }
    });

    it("returns the icons in the order given", () => {
        const packed = packLane([200, 10], { ...opts, rows: 1 });
        expect(packed.map((p) => p.x)).toEqual([200, 12]);
    });
});

describe("timelineSize", () => {
    it("uses big item icons and ability discs on a 1080 px tall window", () => {
        const size = timelineSize(1080);
        expect(size.item).toBeGreaterThanOrEqual(36);
        expect(size.item).toBeLessThanOrEqual(40);
        expect(size.mark).toBeGreaterThanOrEqual(28);
        expect(size.mark).toBeLessThanOrEqual(32);
    });

    it("shrinks both on a 900 px tall window", () => {
        const full = timelineSize(1080);
        const small = timelineSize(900);
        expect(small.item).toBeLessThan(full.item);
        expect(small.mark).toBeLessThan(full.mark);
        expect(small.mark).toBeGreaterThanOrEqual(24);
    });
});

describe("timelineLayout", () => {
    it("stacks the item lane, the axis, the ability lane and the labels top to bottom", () => {
        const l = timelineLayout(timelineSize(1080));
        expect(l.itemsTop).toBeGreaterThan(0);
        expect(l.itemsTop).toBeLessThan(l.itemsBottom);
        expect(l.itemsBottom).toBeLessThan(l.axisY);
        expect(l.axisY).toBeLessThan(l.marksTop);
        expect(l.marksTop).toBeLessThan(l.labelsY);
        expect(l.labelsY).toBeLessThan(l.height);
    });

    it("reserves every item row, so adding items never changes the height", () => {
        const size = timelineSize(1080);
        const l = timelineLayout(size);
        expect(l.itemsBottom - l.itemsTop).toBe(size.rows * size.item + (size.rows - 1) * size.gap);
    });

    it("leaves room under each disc for its tier pips before the labels", () => {
        const size = timelineSize(1080);
        const l = timelineLayout(size);
        expect(l.labelsY - (l.marksTop + size.mark)).toBeGreaterThanOrEqual(10);
    });

    it("keeps the plot near 170 px at 1080 px and shorter on a 900 px window", () => {
        const full = timelineLayout(timelineSize(1080)).height;
        expect(full).toBeGreaterThanOrEqual(150);
        expect(full).toBeLessThanOrEqual(175);
        expect(timelineLayout(timelineSize(900)).height).toBeLessThan(full);
    });
});

describe("readoutPlacement", () => {
    // A strip 800 px wide whose top sits 500 px down a pane that spans 40 to 900.
    const base = {
        anchor: 400,
        half: 19,
        gap: 6,
        track: { width: 800, top: 500, bottom: 640 },
        bounds: { top: 40, bottom: 900 },
    };

    it("sits above the strip, centred on the anchor, when it fits", () => {
        expect(readoutPlacement({ ...base, tip: { width: 340, height: 300 } })).toEqual({ left: 230, top: -306 });
    });

    it("stays inside the strip's edges", () => {
        const tip = { width: 340, height: 300 };
        expect(readoutPlacement({ ...base, anchor: 20, tip }).left).toBe(0);
        expect(readoutPlacement({ ...base, anchor: 790, tip }).left).toBe(460);
    });

    it("moves beside the anchor, bottom on the strip's bottom, when the pane has no room above", () => {
        expect(readoutPlacement({ ...base, tip: { width: 340, height: 500 } })).toEqual({ left: 425, top: -360 });
    });

    it("goes to the anchor's left when the right side has no room", () => {
        expect(readoutPlacement({ ...base, anchor: 600, tip: { width: 340, height: 500 } }).left).toBe(235);
    });

    it("keeps a tooltip taller than the pane's room inside the pane", () => {
        const placed = readoutPlacement({ ...base, tip: { width: 340, height: 700 } });
        expect(placed.top).toBe(-460);
        expect(placed.top + base.track.top + 700).toBeLessThanOrEqual(base.bounds.bottom);
    });
});
