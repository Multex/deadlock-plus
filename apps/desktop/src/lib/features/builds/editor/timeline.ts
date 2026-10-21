import type { AnalyticsFilter, DeadlockApi, PerformanceCurvePoint } from "@deadlock-plus/deadlock-api";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { CurrencyChangeView } from "@deadlock-plus/ipc-types/CurrencyChangeView";
import {
    groupFilter,
    groupLabel,
    nextGroup,
    startGroup,
    type ComparisonGroup,
    type GroupLabel,
} from "@deadlock-plus/stats/lobby-badge";
import { chainCost, type ShopItem } from "../catalog";
import { STARTING_SOULS, netWorthFor, type Level } from "../levels";
import { statsSoFar, type StatsById, type StatTotal } from "../stats";
import { orderSteps } from "./ability-order";
import type { ItemRef } from "./document";

export interface OrderEntry {
    abilityId: number;
    ref: ItemRef;
}

export interface TimelineEntry extends OrderEntry {
    /** What this purchase costs after owned components; 0 for a repeat. */
    cost: number;
    /** Net worth at which the running cost reaches this item, with souls spent as earned. */
    netWorth: number;
}

export interface Breakpoint {
    abilityId: number;
    /** 0 for the unlock, 1-3 for a tier. */
    tier: number;
    level: number;
    netWorth: number;
}

export interface CurvePoint {
    time: number;
    netWorth: number;
}

export interface NetWorthCurve {
    points: CurvePoint[];
    group: GroupLabel;
}

export type CurveApi = Pick<DeadlockApi, "heroStats" | "performanceCurve">;

const inShop = (item: ShopItem | undefined): item is ShopItem => !!item && item.shopable && !item.disabled;

const sameRef = (a: ItemRef, b: ItemRef) => a.category === b.category && a.index === b.index;

/** Quick Buy order: categories top to bottom, items left to right, optional categories and items the shop dropped left out. */
export function quickBuyOrder(build: BuildView, byId: ReadonlyMap<number, ShopItem>): OrderEntry[] {
    const order: OrderEntry[] = [];
    build.modCategories.forEach((category, c) => {
        if (category.optional) return;
        category.mods.forEach((mod, index) => {
            if (inShop(byId.get(mod.abilityId))) order.push({ abilityId: mod.abilityId, ref: { category: c, index } });
        });
    });
    return order;
}

function place(order: readonly OrderEntry[], byId: ReadonlyMap<number, ShopItem>): TimelineEntry[] {
    const { costs } = chainCost(
        byId,
        order.map((e) => e.abilityId),
    );
    let running = 0;
    return order.map((entry, i) => {
        const cost = costs[i] ?? 0;
        running += cost;
        return { ...entry, cost, netWorth: running };
    });
}

export function placeItems(build: BuildView, byId: ReadonlyMap<number, ShopItem>): TimelineEntry[] {
    return place(quickBuyOrder(build, byId), byId);
}

/** The build's ability steps at the net worth of the level that first affords each; steps past the table are left out. */
export function breakpoints(order: readonly CurrencyChangeView[], levels: readonly Level[]): Breakpoint[] {
    const byLevel = new Map(levels.map((l) => [l.level, l]));
    return orderSteps(order, levels).flatMap((step) => {
        const level = step.level === null ? undefined : byLevel.get(step.level);
        return level
            ? [{ abilityId: step.abilityId, tier: step.tier, level: level.level, netWorth: netWorthFor(level.souls) }]
            : [];
    });
}

/** Net worth of every level that grants an ability point, up to `end`. */
export function apTicks(levels: readonly Level[], end: number): number[] {
    return levels.filter((l) => l.apGained > 0 && netWorthFor(l.souls) <= end).map((l) => netWorthFor(l.souls));
}

/** The strip ends at the build's total cost or its last named breakpoint, whichever is larger; else the last level. */
export function timelineEnd(
    entries: readonly { netWorth: number }[],
    marks: readonly { netWorth: number }[],
    levels: readonly Level[],
): number {
    const end = Math.max(0, ...entries.map((e) => e.netWorth), ...marks.map((m) => m.netWorth));
    if (end > 0) return end;
    const last = levels.at(-1);
    return last ? netWorthFor(last.souls) : STARTING_SOULS;
}

export function itemsBoughtBy(entries: readonly TimelineEntry[], netWorth: number): number[] {
    return entries.filter((e) => e.netWorth <= netWorth).map((e) => e.abilityId);
}

/** Flat stats of the items bought by `netWorth`; conditional effects are left out. */
export function statsAt(
    entries: readonly TimelineEntry[],
    netWorth: number,
    statsById: StatsById,
    byId: ReadonlyMap<number, ShopItem>,
): StatTotal[] {
    return statsSoFar(itemsBoughtBy(entries, netWorth), statsById, byId);
}

export function levelAt(levels: readonly Level[], netWorth: number): number | null {
    const souls = netWorth - STARTING_SOULS;
    let found: Level | undefined = levels[0];
    for (const l of levels) {
        if (l.souls > souls) break;
        found = l;
    }
    return found?.level ?? null;
}

/**
 * Where an item dropped at `netWorth` goes: before the first item whose running cost reaches it, else
 * after the last item of the last category Quick Buy uses. `moving` are items the drop takes out of
 * the order, so they are not priced; refs stay counted before their removal, as `moveItems` expects.
 */
export function dropRef(
    build: BuildView,
    byId: ReadonlyMap<number, ShopItem>,
    netWorth: number,
    moving: readonly ItemRef[] = [],
): ItemRef | null {
    const order = quickBuyOrder(build, byId).filter((e) => !moving.some((m) => sameRef(m, e.ref)));
    const hit = place(order, byId).find((e) => e.netWorth >= netWorth);
    if (hit) return hit.ref;
    const last = build.modCategories.findLastIndex((c) => !c.optional);
    return last < 0 ? null : { category: last, index: build.modCategories[last]!.mods.length };
}

/** Average net worth by game time, from the match start's starting souls; points with no data are left out. */
export function curvePoints(points: readonly PerformanceCurvePoint[]): CurvePoint[] {
    const out = points.flatMap((p) =>
        p.net_worth_avg === null ? [] : [{ time: p.game_time, netWorth: p.net_worth_avg }],
    );
    if (out.length === 0) return [];
    return out[0]!.time > 0 ? [{ time: 0, netWorth: STARTING_SOULS }, ...out] : out;
}

/** Seconds into a match the average player reaches `netWorth`; null past the curve's last point. */
export function timeFor(curve: readonly CurvePoint[], netWorth: number): number | null {
    const first = curve[0];
    if (!first) return null;
    if (netWorth <= first.netWorth) return first.time;
    for (let i = 1; i < curve.length; i++) {
        const a = curve[i - 1]!;
        const b = curve[i]!;
        if (netWorth > b.netWorth) continue;
        if (b.netWorth === a.netWorth) return b.time;
        return a.time + ((netWorth - a.netWorth) / (b.netWorth - a.netWorth)) * (b.time - a.time);
    }
    return null;
}

const CLOCK_STEP = 30;

/** "12:30", rounded to the nearest 30 seconds: the time is an average, not a schedule. */
export function formatClock(seconds: number): string {
    const rounded = Math.round(seconds / CLOCK_STEP) * CLOCK_STEP;
    const minutes = Math.floor(rounded / 60);
    return `${minutes}:${String(rounded % 60).padStart(2, "0")}`;
}

const MAX_HERO_STATS_CALLS = 6;

function filterFor(group: ComparisonGroup): AnalyticsFilter {
    const { minAverageBadge, maxAverageBadge } = groupFilter(group);
    return {
        gameMode: "normal",
        ...(minAverageBadge === undefined ? {} : { minAverageBadge }),
        ...(maxAverageBadge === undefined ? {} : { maxAverageBadge }),
    };
}

/**
 * The hero's average net worth curve for the rank band of `badge`, widened while the band has too
 * few matches; every rank when `badge` is unknown. Null when the API has no data. Throws when it is unreachable.
 */
export async function loadNetWorthCurve(
    api: CurveApi,
    heroId: number,
    badge: number | null,
): Promise<NetWorthCurve | null> {
    let group = startGroup({ streetBrawl: false, badge });
    for (let calls = 0; group.kind === "tiers" && calls < MAX_HERO_STATS_CALLS; calls++) {
        const rows = await api.heroStats(filterFor(group));
        const wider = nextGroup(group, rows.find((r) => r.hero_id === heroId)?.matches ?? 0);
        if (wider === null) break;
        group = wider;
    }
    const points = curvePoints(await api.performanceCurve(heroId, filterFor(group)));
    return points.length === 0 ? null : { points, group: groupLabel(group) };
}
