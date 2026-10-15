import { parseCosts, type Cost, type Costs } from "./costs";

/** Names one row. The name alone repeats when a plan ends and is taken up again later. */
export interface CostRef {
    name: string;
    since: string;
}

/** `until: null` removes the end day. */
export type CostEdit = Partial<Omit<Cost, "until">> & { until?: string | null };

export type EditError = "invalid" | "not-found" | "duplicate" | "already-ended" | "ends-before-start";

export type EditResult = { ok: true; costs: Costs } | { ok: false; error: EditError };

export function serializeCosts(costs: Costs): string {
    return JSON.stringify(costs, null, 4);
}

function same(a: CostRef, b: CostRef): boolean {
    return a.name === b.name && a.since === b.since;
}

function row({ name, purpose, amount, period, since, until }: Cost): Cost {
    return until === undefined
        ? { name, purpose, amount, period, since }
        : { name, purpose, amount, period, since, until };
}

/** Runs the list through `parseCosts`, so nothing is stored that the page would then refuse to show. */
function settle(costs: Costs, changed: Cost): EditResult {
    const next = parseCosts(serializeCosts(costs));
    if (!next) return { ok: false, error: "invalid" };
    // Valid days in `YYYY-MM-DD` sort as text.
    if (changed.until !== undefined && changed.until <= changed.since) return { ok: false, error: "ends-before-start" };
    if (next.items.filter((cost) => same(cost, changed)).length > 1) return { ok: false, error: "duplicate" };
    return { ok: true, costs: next };
}

export function addCost(costs: Costs, cost: Cost): EditResult {
    const added = row(cost);
    return settle({ currency: costs.currency, items: [...costs.items, added] }, added);
}

export function editCost(costs: Costs, ref: CostRef, edit: CostEdit): EditResult {
    const index = costs.items.findIndex((cost) => same(cost, ref));
    if (index === -1) return { ok: false, error: "not-found" };
    const { until, ...rest } = edit;
    const current = costs.items[index] as Cost;
    const edited = row({ ...current, ...rest, until: until === null ? undefined : (until ?? current.until) });
    return settle({ currency: costs.currency, items: costs.items.map((cost, i) => (i === index ? edited : cost)) }, edited);
}

export function endCost(costs: Costs, ref: CostRef, until: string): EditResult {
    const current = costs.items.find((cost) => same(cost, ref));
    if (!current) return { ok: false, error: "not-found" };
    if (current.until !== undefined) return { ok: false, error: "already-ended" };
    return editCost(costs, ref, { until });
}
