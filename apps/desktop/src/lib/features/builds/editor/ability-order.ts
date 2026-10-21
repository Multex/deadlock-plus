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
    /** The level this step is first affordable at, never below the step before it; null past the level table. */
    level: number | null;
}

export type SlotState =
    | { kind: "filled"; step: number; level: number | null }
    | { kind: "next"; level: number | null }
    | { kind: "blocked"; reason: BlockReason };

export type Edit = { ok: true; order: CurrencyChangeView[] } | { ok: false; reason: BlockReason };

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

const walkOf = (order: readonly CurrencyChangeView[], rules: Rules): Walk => {
    const walk = new Walk(rules);
    for (const b of bought(order)) if (b && walk.check(b) === null) walk.take(b);
    return walk;
};

/** Indices of the steps that still hold once every step that no longer can is left out, in order. */
function survivors(steps: readonly (Bought | null)[], rules: Rules): number[] {
    const walk = new Walk(rules);
    const kept: number[] = [];
    steps.forEach((b, i) => {
        if (b && walk.check(b) === null) {
            walk.take(b);
            kept.push(i);
        }
    });
    return kept;
}

class Levels {
    private unlocks = 0;
    private points = 0;
    private floor = 0;
    private reachable = true;

    constructor(private readonly levels: readonly Level[]) {}

    level({ tier }: Bought): number | null {
        if (tier === 0) this.unlocks++;
        else this.points += TIER_COSTS[tier - 1]!;
        if (!this.reachable) return null;
        const unlocks = this.unlocks;
        const points = this.points;
        const found = this.levels.find((l) => l.unlocks >= unlocks && l.ap >= points);
        if (!found) {
            this.reachable = false;
            return null;
        }
        this.floor = Math.max(this.floor, found.level);
        return this.floor;
    }

    /** The level `step` would get as the next step, without taking it. */
    peek(step: Bought): number | null {
        const saved = [this.unlocks, this.points, this.floor, this.reachable] as const;
        const level = this.level(step);
        [this.unlocks, this.points, this.floor, this.reachable] = saved;
        return level;
    }
}

/** Expects an order the editor accepts ({@link isValid}). */
export function orderSteps(order: readonly CurrencyChangeView[], levels: readonly Level[]): OrderStep[] {
    const table = new Levels(levels);
    return bought(order)
        .filter((b): b is Bought => b !== null)
        .map((b) => ({ ...b, level: table.level(b) }));
}

/**
 * A stored order as the game reads it, for showing a build as-is: up to the leftover tail, points on a
 * locked ability skipped, nothing moved. Unlocks are read by currency, as some builds store them free.
 */
export function readSteps(order: readonly CurrencyChangeView[], levels: readonly Level[]): OrderStep[] {
    const table = new Levels(levels);
    const tiers = new Map<number, number>();
    const steps: OrderStep[] = [];
    for (const c of order.slice(0, tailStart(order))) {
        const current = tiers.get(c.abilityId);
        let tier: number;
        if (c.currencyType === ABILITY_UNLOCK) tier = 0;
        else if (c.currencyType === ABILITY_POINTS && current !== undefined) tier = current + 1;
        else continue;
        tiers.set(c.abilityId, tier);
        const step = { abilityId: c.abilityId, tier };
        steps.push({ ...step, level: table.level(step) });
    }
    return steps;
}

/** Per ability (in `abilities` order), its unlock slot then tiers 1-3. */
export function slotState(
    order: readonly CurrencyChangeView[],
    abilities: readonly number[],
    ultimateId: number | null,
    levels: readonly Level[],
): SlotState[][] {
    const rules = { abilities, ultimateId };
    const walk = new Walk(rules);
    const table = new Levels(levels);
    const filled = new Map<string, SlotState>();
    bought(order).forEach((b, step) => {
        if (!b || walk.check(b) !== null) return;
        walk.take(b);
        filled.set(`${b.abilityId}:${b.tier}`, { kind: "filled", step, level: table.level(b) });
    });
    return abilities.map((abilityId) =>
        Array.from({ length: MAX_TIER + 1 }, (_, tier): SlotState => {
            const done = filled.get(`${abilityId}:${tier}`);
            if (done) return done;
            const step = { abilityId, tier };
            const reason = walk.check(step);
            return reason === null ? { kind: "next", level: table.peek(step) } : { kind: "blocked", reason };
        }),
    );
}

export interface AbilityProgress {
    /** Highest tier taken: null while locked, 0 unlocked only, 1-3 a tier. */
    tier: number | null;
    /** Index of this ability's latest step in the order. */
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
            lastStep = Math.max(lastStep ?? -1, slot.step);
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
    const walk = walkOf(order, { abilities, ultimateId });
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
    const kept = new Set(survivors(steps, { abilities, ultimateId }));
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

/** `to` is the index the step ends up at. Refuses a move that breaks the order, with the first rule it breaks. */
export function moveStep(
    order: readonly CurrencyChangeView[],
    from: number,
    to: number,
    abilities: readonly number[],
    ultimateId: number | null,
): Edit {
    const steps = bought(order);
    const next = [...order];
    const [moved] = next.splice(from, 1);
    const [movedStep] = steps.splice(from, 1);
    if (!moved || to < 0 || to > next.length) return { ok: true, order: [...order] };
    next.splice(to, 0, moved);
    steps.splice(to, 0, movedStep!);
    const walk = new Walk({ abilities, ultimateId });
    for (const b of steps) {
        if (!b) return { ok: false, reason: "unknown" };
        const reason = walk.check(b);
        if (reason !== null) return { ok: false, reason };
        walk.take(b);
    }
    return { ok: true, order: next };
}

/**
 * Appends every step the order still lacks: the other abilities' unlocks in slot order, then the
 * ultimate, then one tier at a time to the ability with the lowest tier (slot order breaks ties).
 */
export function fillRest(
    order: readonly CurrencyChangeView[],
    abilities: readonly number[],
    ultimateId: number | null,
): CurrencyChangeView[] {
    const walk = walkOf(order, { abilities, ultimateId });
    const out = [...order];
    const take = (b: Bought) => {
        walk.take(b);
        out.push(change(b));
    };
    for (const id of abilities) {
        if (id !== ultimateId && !walk.tiers.has(id)) take({ abilityId: id, tier: 0 });
    }
    if (ultimateId !== null && abilities.includes(ultimateId) && !walk.tiers.has(ultimateId)) {
        const unlock = { abilityId: ultimateId, tier: 0 };
        if (walk.check(unlock) === null) take(unlock);
    }
    for (;;) {
        let pick: Bought | null = null;
        for (const id of abilities) {
            const next = walk.nextFor(id);
            if (next && next.tier > 0 && walk.check(next) === null && (!pick || next.tier < pick.tier)) pick = next;
        }
        if (!pick) return out;
        take(pick);
    }
}

/** The editor's rules, as the backend checks an order before writing it. */
export function isValid(
    order: readonly CurrencyChangeView[],
    abilities: readonly number[],
    ultimateId: number | null,
): boolean {
    const walk = new Walk({ abilities, ultimateId });
    const steps = bought(order);
    return order.every((c, i) => {
        const b = steps[i];
        if (!b || walk.check(b) !== null || c.delta !== change(b).delta) return false;
        walk.take(b);
        return true;
    });
}

export interface LoadedOrder {
    order: CurrencyChangeView[];
    /** Steps left out: a leftover tail, abilities the hero no longer has, steps that never become possible. */
    dropped: number;
    /** Steps that came too early (an early ultimate, points before an unlock), moved to where they become possible. */
    moved: number;
}

/** Where the leftover tail starts, read as the backend does: a repeated or fifth unlock, or a tier past the last. */
function tailStart(order: readonly CurrencyChangeView[]): number {
    const tiers = new Map<number, number>();
    for (const [i, c] of order.entries()) {
        const tier = tiers.get(c.abilityId);
        if (c.currencyType === ABILITY_UNLOCK) {
            if (tier !== undefined || tiers.size >= ABILITY_SLOTS) return i;
            tiers.set(c.abilityId, 0);
        } else if (c.currencyType === ABILITY_POINTS && tier !== undefined) {
            if (tier >= MAX_TIER) return i;
            tiers.set(c.abilityId, tier + 1);
        }
    }
    return order.length;
}

/**
 * Turns an order read from a build into one the editor accepts: drops the leftover tail, makes free
 * unlocks paid, and holds back a step that comes too early until it becomes possible.
 */
export function loadOrder(
    order: readonly CurrencyChangeView[],
    abilities: readonly number[],
    ultimateId: number | null,
): LoadedOrder {
    const head = order.slice(0, tailStart(order));
    const walk = new Walk({ abilities, ultimateId });
    const out: CurrencyChangeView[] = [];
    const pending: { b: Bought; annotation: string | null }[] = [];
    let moved = 0;
    const take = (b: Bought, annotation: string | null) => {
        walk.take(b);
        out.push(change(b, annotation));
    };
    bought(head).forEach((b, i) => {
        if (!b) return;
        const annotation = head[i]!.annotation;
        const reason = walk.check(b);
        if (reason === "unknown" || reason === "maxed") return;
        if (reason !== null) {
            pending.push({ b, annotation });
            return;
        }
        take(b, annotation);
        for (let again = true; again;) {
            again = false;
            const ready = pending.findIndex((p) => walk.check(p.b) === null);
            if (ready >= 0) {
                const [p] = pending.splice(ready, 1);
                take(p!.b, p!.annotation);
                moved++;
                again = true;
            }
        }
    });
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
