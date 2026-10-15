import type { Store } from "./store";

export type Period = "month" | "year" | "once";

export interface Cost {
    name: string;
    purpose: string;
    amount: number;
    period: Period;
    /** First charge, `YYYY-MM-DD`. */
    since: string;
    /** No charge on or after this day, `YYYY-MM-DD`. */
    until?: string;
}

export interface Costs {
    currency: string;
    items: Cost[];
}

/** Edited by hand in the Cloudflare dashboard or with `wrangler kv key put`. */
export const COSTS_KEY = "costs";
/** Copied from `costs` by the hourly cron whenever that parses, so a broken edit never empties the page. */
export const LAST_GOOD_KEY = "costs:last-good";

const PERIODS: readonly string[] = ["month", "year", "once"];

function parseDay(value: unknown): Date | null {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const day = new Date(`${value}T00:00:00.000Z`);
    // An impossible day like 2026-02-30 either fails to parse or rolls into the next month.
    return !Number.isNaN(day.getTime()) && day.toISOString().startsWith(value) ? day : null;
}

function isCost(row: unknown): row is Cost {
    if (typeof row !== "object" || row === null) return false;
    const { name, purpose, amount, period, since, until } = row as Record<string, unknown>;
    return (
        typeof name === "string" &&
        typeof purpose === "string" &&
        typeof amount === "number" &&
        Number.isFinite(amount) &&
        amount >= 0 &&
        typeof period === "string" &&
        PERIODS.includes(period) &&
        parseDay(since) !== null &&
        (until === undefined || parseDay(until) !== null)
    );
}

/** One bad row rejects the whole list: a typo must not drop a cost from the page without anyone noticing. */
export function parseCosts(raw: string | null): Costs | null {
    if (raw === null) return null;
    let body: unknown;
    try {
        body = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof body !== "object" || body === null) return null;
    const { currency, items } = body as Record<string, unknown>;
    if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
    if (!Array.isArray(items) || !items.every(isCost)) return null;
    return { currency, items };
}

function cents(value: number): number {
    return Math.round(value * 100) / 100;
}

function isActive(cost: Cost, now: Date): boolean {
    const since = parseDay(cost.since) as Date;
    const until = cost.until ? parseDay(cost.until) : null;
    return since <= now && (!until || now < until);
}

function perMonth(cost: Cost): number {
    return cost.period === "month" ? cost.amount : cost.period === "year" ? cost.amount / 12 : 0;
}

export function monthlyTotal(costs: Costs, now = new Date()): number {
    return cents(costs.items.filter((cost) => isActive(cost, now)).reduce((sum, cost) => sum + perMonth(cost), 0));
}

export interface CostRow extends Cost {
    ended: boolean;
}

export function costRows(costs: Costs, now = new Date()): CostRow[] {
    return costs.items
        .map((cost) => ({ ...cost, ended: !!cost.until && (parseDay(cost.until) as Date) <= now }))
        .sort((a, b) => Number(a.ended) - Number(b.ended) || perMonth(b) - perMonth(a));
}

/** The start day moved `months` ahead, clamped to the end of a shorter month (31 Jan -> 28 Feb). */
function addMonths(start: Date, months: number): Date {
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth() + months;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay)));
}

function charges(cost: Cost, now: Date): number {
    const since = parseDay(cost.since) as Date;
    const until = cost.until ? parseDay(cost.until) : null;
    const billed = (day: Date) => day <= now && (!until || day < until);
    if (cost.period === "once") return billed(since) ? 1 : 0;

    const step = cost.period === "month" ? 1 : 12;
    let count = 0;
    while (billed(addMonths(since, count * step))) count++;
    return count;
}

export function totalSpent(costs: Costs, now = new Date()): number {
    return cents(costs.items.reduce((sum, cost) => sum + cost.amount * charges(cost, now), 0));
}

export async function loadCosts(store: Store): Promise<Costs | null> {
    return parseCosts(await store.get(COSTS_KEY)) ?? parseCosts(await store.get(LAST_GOOD_KEY));
}

export async function promoteCosts(store: Store): Promise<void> {
    const raw = await store.get(COSTS_KEY);
    if (!parseCosts(raw) || raw === (await store.get(LAST_GOOD_KEY))) return;
    await store.put(LAST_GOOD_KEY, raw as string);
}
