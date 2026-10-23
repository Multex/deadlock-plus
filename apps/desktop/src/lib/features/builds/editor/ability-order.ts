import type { CurrencyChangeView } from "@deadlock-plus/ipc-types/CurrencyChangeView";
import type { Level } from "../levels";

const ABILITY_POINTS = 1;
const ABILITY_UNLOCK = 2;
export const TIER_COSTS = [1, 2, 5] as const;
const MAX_TIER = TIER_COSTS.length;
const ABILITY_SLOTS = 4;
/** Abilities other than the ultimate that must be unlocked before it. */
const BEFORE_ULTIMATE = 3;

export type BlockReason = "unknown" | "locked" | "tier_order" | "ultimate" | "maxed";

/** A step by what it buys: tier 0 is the unlock, 1-3 the tiers. */
export interface OrderStep {
    abilityId: number;
    tier: number;
    /**
     * The level the game takes this step at; null past the level table. Unlocks and points are two queues, so a step
     * can come at an earlier level than a step stored before it.
     */
    level: number | null;
}

export type SlotState =
    | { kind: "filled"; step: number; level: number | null }
    | { kind: "next"; level: number | null }
    | { kind: "blocked"; reason: BlockReason };

export type Edit = { ok: true; order: CurrencyChangeView[] } | { ok: false; reason: BlockReason };

/** `changed` is false when the move leaves the order as it was: same index, or a drop outside the order. */
export type MoveEdit = { ok: true; order: CurrencyChangeView[]; changed: boolean } | { ok: false; reason: BlockReason };

interface Rules {
    abilities: readonly number[];
    ultimateId: number | null;
}

type Bought = { abilityId: number; tier: number };

const change = ({ abilityId, tier }: Bought, annotation: string | null = null): CurrencyChangeView =>
    tier === 0
        ? { abilityId, currencyType: ABILITY_UNLOCK, delta: -1, annotation }
        : { abilityId, currencyType: ABILITY_POINTS, delta: -TIER_COSTS[tier - 1]!, annotation };

/** Tiers counted per ability in order; a change in neither currency maps to null. */
function bought(order: readonly CurrencyChangeView[]): (Bought | null)[] {
    const counts = new Map<number, number>();
    return order.map((c) => {
        if (c.currencyType === ABILITY_UNLOCK) return { abilityId: c.abilityId, tier: 0 };
        if (c.currencyType !== ABILITY_POINTS) return null;
        const tier = (counts.get(c.abilityId) ?? 0) + 1;
        counts.set(c.abilityId, tier);
        return { abilityId: c.abilityId, tier };
    });
}

/**
 * The game keeps unlocks and ability points as two queues and never orders one against the other, so the rules are
 * checked with every unlock first, then every point step, each in stored order.
 */
function rulesOrder(steps: readonly (Bought | null)[]): number[] {
    const all = steps.map((_, i) => i);
    return [...all.filter((i) => steps[i]?.tier === 0), ...all.filter((i) => steps[i]?.tier !== 0)];
}

/**
 * The level the game takes each step at, in the order given: the k-th unlock at the level that grants the k-th
 * unlock; a point step once its points are earned, its ability is unlocked and the point step before it is taken.
 */
function schedule(steps: readonly Bought[], levels: readonly Level[]): (number | null)[] {
    const reach = (enough: (l: Level) => boolean) => levels.find(enough)?.level ?? Infinity;
    const at: number[] = [];
    const unlockedAt = new Map<number, number>();
    let unlocks = 0;
    steps.forEach((step, i) => {
        if (step.tier !== 0) return;
        const count = ++unlocks;
        at[i] = reach((l) => l.unlocks >= count);
        unlockedAt.set(step.abilityId, at[i]!);
    });
    let spent = 0;
    let floor = 0;
    steps.forEach((step, i) => {
        if (step.tier === 0) return;
        spent += TIER_COSTS[step.tier - 1]!;
        const total = spent;
        floor = Math.max(
            floor,
            reach((l) => l.ap >= total),
            unlockedAt.get(step.abilityId) ?? Infinity,
        );
        at[i] = floor;
    });
    return at.map((level) => (Number.isFinite(level) ? level : null));
}

const withLevels = (steps: readonly Bought[], levels: readonly Level[]): OrderStep[] => {
    const at = schedule(steps, levels);
    return steps.map(({ abilityId, tier }, i) => ({ abilityId, tier, level: at[i]! }));
};

class Walk {
    /** Ability id -> highest tier bought (0 = unlocked only). */
    readonly tiers = new Map<number, number>();

    constructor(readonly rules: Rules) {}

    private othersUnlocked(): number {
        let n = 0;
        for (const id of this.tiers.keys()) if (id !== this.rules.ultimateId) n++;
        return n;
    }

    check({ abilityId, tier }: Bought): BlockReason | null {
        if (!this.rules.abilities.includes(abilityId)) return "unknown";
        const current = this.tiers.get(abilityId);
        if (tier === 0) {
            if (current !== undefined) return "maxed";
            if (abilityId === this.rules.ultimateId && this.othersUnlocked() < BEFORE_ULTIMATE) return "ultimate";
            return null;
        }
        if (current === undefined) return "locked";
        if (current >= tier) return "maxed";
        return current === tier - 1 ? null : "tier_order";
    }

    take({ abilityId, tier }: Bought): void {
        this.tiers.set(abilityId, tier);
    }

    nextFor(abilityId: number): Bought | null {
        const current = this.tiers.get(abilityId);
        if (current === undefined) return { abilityId, tier: 0 };
        return current < MAX_TIER ? { abilityId, tier: current + 1 } : null;
    }
}

/** The steps that still hold once every step that no longer can is left out; `kept` is in stored order. */
function walkSteps(steps: readonly (Bought | null)[], rules: Rules): { walk: Walk; kept: number[] } {
    const walk = new Walk(rules);
    const kept: number[] = [];
    for (const i of rulesOrder(steps)) {
        const b = steps[i];
        if (b && walk.check(b) === null) {
            walk.take(b);
            kept.push(i);
        }
    }
    return { walk, kept: kept.sort((a, b) => a - b) };
}

/** Expects an order the editor accepts ({@link isValid}). Steps stay in stored order, the game's preview order. */
export function orderSteps(order: readonly CurrencyChangeView[], levels: readonly Level[]): OrderStep[] {
    return withLevels(
        bought(order).filter((b): b is Bought => b !== null),
        levels,
    );
}

/**
 * A stored order as the game reads it, for showing a build as-is, in stored order: up to the leftover tail, points
 * on an ability it never unlocks skipped. Unlocks are read by currency, as some builds store them free.
 */
export function readSteps(order: readonly CurrencyChangeView[], levels: readonly Level[]): OrderStep[] {
    const head = order.slice(0, tailStart(order));
    const unlocked = new Set(head.filter((c) => c.currencyType === ABILITY_UNLOCK).map((c) => c.abilityId));
    return withLevels(
        bought(head).filter((b): b is Bought => b !== null && (b.tier === 0 || unlocked.has(b.abilityId))),
        levels,
    );
}

/**
 * The same steps with every unlock moved before every point step, each keeping its order. The game takes them at the
 * same levels; only its build preview changes.
 */
export function previewUnlocksFirst(order: readonly CurrencyChangeView[]): CurrencyChangeView[] {
    const unlock = (c: CurrencyChangeView) => c.currencyType === ABILITY_UNLOCK;
    return [...order.filter(unlock), ...order.filter((c) => !unlock(c))];
}

/** Whether {@link previewUnlocksFirst} would leave the order as it is. */
export function isUnlocksFirst(order: readonly CurrencyChangeView[]): boolean {
    const firstPoint = order.findIndex((c) => c.currencyType !== ABILITY_UNLOCK);
    return firstPoint === -1 || order.every((c, i) => i < firstPoint || c.currencyType !== ABILITY_UNLOCK);
}

/** Per ability (in `abilities` order), its unlock slot then tiers 1-3. */
export function slotState(
    order: readonly CurrencyChangeView[],
    abilities: readonly number[],
    ultimateId: number | null,
    levels: readonly Level[],
): SlotState[][] {
    const steps = bought(order);
    const { walk, kept } = walkSteps(steps, { abilities, ultimateId });
    const taken = kept.map((i) => steps[i]!);
    const at = schedule(taken, levels);
    const filled = new Map<string, SlotState>();
    kept.forEach((step, k) => {
        filled.set(`${taken[k]!.abilityId}:${taken[k]!.tier}`, { kind: "filled", step, level: at[k]! });
    });
    return abilities.map((abilityId) =>
        Array.from({ length: MAX_TIER + 1 }, (_, tier): SlotState => {
            const done = filled.get(`${abilityId}:${tier}`);
            if (done) return done;
            const step = { abilityId, tier };
            const reason = walk.check(step);
            return reason === null
                ? { kind: "next", level: schedule([...taken, step], levels).at(-1)! }
                : { kind: "blocked", reason };
        }),
    );
}

export interface AbilityProgress {
    /** Highest tier taken: null while locked, 0 unlocked only, 1-3 a tier. */
    tier: number | null;
    /** Index of the step that took the highest tier. */
    lastStep: number | null;
    /** What appending to this ability adds next, or why it cannot. */
    next: { kind: "next"; tier: number; level: number | null } | { kind: "blocked"; reason: BlockReason };
}

/** Per ability (in `abilities` order), as the game's ability bar shows it. */
export function abilityProgress(
    order: readonly CurrencyChangeView[],
    abilities: readonly number[],
    ultimateId: number | null,
    levels: readonly Level[],
): AbilityProgress[] {
    return slotState(order, abilities, ultimateId, levels).map((slots) => {
        let tier: number | null = null;
        let lastStep: number | null = null;
        for (const [i, slot] of slots.entries()) {
            if (slot.kind !== "filled") continue;
            tier = i;
            lastStep = slot.step;
        }
        const open = slots.findIndex((slot) => slot.kind !== "filled");
        const slot = slots[open];
        const next: AbilityProgress["next"] =
            slot?.kind === "next"
                ? { kind: "next", tier: open, level: slot.level }
                : { kind: "blocked", reason: slot?.kind === "blocked" ? slot.reason : "maxed" };
        return { tier, lastStep, next };
    });
}

export function appendStep(
    order: readonly CurrencyChangeView[],
    abilityId: number,
    abilities: readonly number[],
    ultimateId: number | null,
): Edit {
    const { walk } = walkSteps(bought(order), { abilities, ultimateId });
    if (!abilities.includes(abilityId)) return { ok: false, reason: "unknown" };
    const next = walk.nextFor(abilityId);
    if (!next) return { ok: false, reason: "maxed" };
    const reason = walk.check(next);
    return reason === null ? { ok: true, order: [...order, change(next)] } : { ok: false, reason };
}

/** Steps that go along with `index`: later tiers of its ability, an unlock's tiers, an ultimate left without its 3 unlocks. */
export function dependents(
    order: readonly CurrencyChangeView[],
    index: number,
    abilities: readonly number[],
    ultimateId: number | null,
): number[] {
    const steps = bought(order).map((b, i) => (i === index ? null : b));
    const kept = new Set(walkSteps(steps, { abilities, ultimateId }).kept);
    return order.flatMap((_, i) => (i !== index && !kept.has(i) ? [i] : []));
}

export function removeStep(
    order: readonly CurrencyChangeView[],
    index: number,
    abilities: readonly number[],
    ultimateId: number | null,
): CurrencyChangeView[] {
    const gone = new Set([index, ...dependents(order, index, abilities, ultimateId)]);
    return order.filter((_, i) => !gone.has(i));
}

/**
 * `to` is the index the step ends up at. Passing steps of the other currency changes only the game's preview;
 * passing steps of its own currency changes when it comes. Refuses a move that breaks the order, with the first rule
 * it breaks.
 */
export function moveStep(
    order: readonly CurrencyChangeView[],
    from: number,
    to: number,
    abilities: readonly number[],
    ultimateId: number | null,
): MoveEdit {
    const steps = bought(order);
    const next = [...order];
    const [moved] = next.splice(from, 1);
    const [movedStep] = steps.splice(from, 1);
    if (!moved || to < 0 || to > next.length || to === from) return { ok: true, order: [...order], changed: false };
    next.splice(to, 0, moved);
    steps.splice(to, 0, movedStep!);
    const walk = new Walk({ abilities, ultimateId });
    for (const i of rulesOrder(steps)) {
        const b = steps[i];
        if (!b) return { ok: false, reason: "unknown" };
        const reason = walk.check(b);
        if (reason !== null) return { ok: false, reason };
        walk.take(b);
    }
    return { ok: true, order: next, changed: true };
}

/**
 * The editor's rules: each unlock and each tier once, tiers in order, the ultimate after the other 3 unlocks, points
 * only on an ability the order unlocks. Where a point step sits against the unlocks does not matter: it waits for
 * its unlock.
 */
export function isValid(
    order: readonly CurrencyChangeView[],
    abilities: readonly number[],
    ultimateId: number | null,
): boolean {
    const walk = new Walk({ abilities, ultimateId });
    const steps = bought(order);
    return rulesOrder(steps).every((i) => {
        const b = steps[i];
        if (!b || walk.check(b) !== null || order[i]!.delta !== change(b).delta) return false;
        walk.take(b);
        return true;
    });
}

export interface LoadedOrder {
    order: CurrencyChangeView[];
    /** Steps left out: a leftover tail, abilities the hero no longer has, steps that never become possible. */
    dropped: number;
    /** Ultimate unlocks that came among the first 3, moved after the third other unlock. */
    moved: number;
}

/**
 * Where the leftover tail starts: a repeated or fifth unlock, or a fourth point step on one ability. Point steps count
 * wherever they sit against the unlocks.
 */
function tailStart(order: readonly CurrencyChangeView[]): number {
    const unlocked = new Set<number>();
    const tiers = new Map<number, number>();
    for (const [i, c] of order.entries()) {
        if (c.currencyType === ABILITY_UNLOCK) {
            if (unlocked.has(c.abilityId) || unlocked.size >= ABILITY_SLOTS) return i;
            unlocked.add(c.abilityId);
        } else if (c.currencyType === ABILITY_POINTS) {
            const tier = tiers.get(c.abilityId) ?? 0;
            if (tier >= MAX_TIER) return i;
            tiers.set(c.abilityId, tier + 1);
        }
    }
    return order.length;
}

/**
 * Turns an order read from a build into one the editor accepts: drops the leftover tail, steps on abilities the hero
 * no longer has and points on an ability the order never unlocks, makes free unlocks paid, and moves an early ultimate
 * after the third other unlock. Every other step keeps its place.
 */
export function loadOrder(
    order: readonly CurrencyChangeView[],
    abilities: readonly number[],
    ultimateId: number | null,
): LoadedOrder {
    const head = order.slice(0, tailStart(order));
    const steps = bought(head);
    const unlocks = new Walk({ abilities, ultimateId });
    const placed: { at: number; i: number }[] = [];
    const early: number[] = [];
    let moved = 0;
    steps.forEach((b, i) => {
        if (b?.tier !== 0) return;
        const reason = unlocks.check(b);
        if (reason === "ultimate") early.push(i);
        if (reason !== null) return;
        unlocks.take(b);
        placed.push({ at: i, i });
        for (let k = 0; k < early.length;) {
            const e = early[k]!;
            if (unlocks.check(steps[e]!) !== null) {
                k++;
                continue;
            }
            unlocks.take(steps[e]!);
            placed.push({ at: i, i: e });
            early.splice(k, 1);
            moved++;
        }
    });
    const walk = new Walk({ abilities, ultimateId });
    for (const { i } of placed) walk.take(steps[i]!);
    steps.forEach((b, i) => {
        if (!b || b.tier === 0 || walk.check(b) !== null) return;
        walk.take(b);
        placed.push({ at: i, i });
    });
    // A moved ultimate sits right after the unlock that made it possible; everything else stays at its own index.
    placed.sort((a, b) => a.at - b.at || Number(a.i !== a.at) - Number(b.i !== b.at));
    const out = placed.map(({ i }) => change(steps[i]!, head[i]!.annotation));
    return { order: out, dropped: order.length - out.length, moved };
}

export interface PointsSummary {
    spent: number;
    /** Every ability point the level table hands out; null without a table. */
    available: number | null;
    lastLevel: number | null;
}

export function pointsSummary(order: readonly CurrencyChangeView[], levels: readonly Level[]): PointsSummary {
    return stepsSummary(orderSteps(order, levels), levels);
}

export function stepsSummary(steps: readonly OrderStep[], levels: readonly Level[]): PointsSummary {
    const spent = steps.reduce((sum, s) => sum + (s.tier > 0 ? TIER_COSTS[s.tier - 1]! : 0), 0);
    return { spent, available: levels.at(-1)?.ap ?? null, lastLevel: steps.at(-1)?.level ?? null };
}
