import {
    COSTS_KEY,
    addCost,
    costRows,
    editCost,
    endCost,
    monthlyTotal,
    parseCosts,
    serializeCosts,
    totalSpent,
    type Cost,
    type CostEdit,
    type CostRef,
    type Costs,
    type EditError,
    type EditResult,
    type Store,
} from "@deadlock-plus/costs";

/** Option values by name, as Discord sent them. */
export type Input = Readonly<Record<string, unknown>>;

export interface Choice {
    name: string;
    value: string;
}

type Loaded = { state: "missing" } | { state: "broken" } | { state: "ok"; costs: Costs };

const BROKEN =
    "The stored cost list is broken, so nothing was changed. Fix the `costs` key in the Cloudflare dashboard first.";

const ERRORS: Record<EditError, string> = {
    invalid: "That cost is not valid: amounts must be 0 or more and days must be real dates as YYYY-MM-DD.",
    "not-found": "No cost matches that. Pick one from the list.",
    duplicate: "A cost with that name already starts on that day.",
    "already-ended": "That cost has already ended. Use `/cost edit` to change its end day.",
    "ends-before-start": "The end day must come after the start day.",
};

async function load(store: Store): Promise<Loaded> {
    const raw = await store.get(COSTS_KEY);
    if (raw === null) return { state: "missing" };
    const costs = parseCosts(raw);
    return costs ? { state: "ok", costs } : { state: "broken" };
}

function money(amount: number, currency: string): string {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

function price(cost: Cost, currency: string): string {
    return `${money(cost.amount, currency)} ${cost.period === "once" ? "once" : `every ${cost.period}`}`;
}

function span(cost: Cost): string {
    return cost.until ? `${cost.since} to ${cost.until}` : `since ${cost.since}`;
}

function line(cost: Cost, currency: string): string {
    return `${cost.name}: ${price(cost, currency)}, ${span(cost)} (${cost.purpose})`;
}

function refValue(cost: Cost): string {
    return `${cost.since} ${cost.name}`;
}

/** A picked choice carries the start day; a typed name works when only one row has it. */
function resolve(costs: Costs, value: unknown): CostRef | null {
    if (typeof value !== "string") return null;
    const match = /^(\d{4}-\d{2}-\d{2}) (.+)$/.exec(value);
    if (match) {
        const ref = { since: match[1] as string, name: match[2] as string };
        if (costs.items.some((cost) => cost.name === ref.name && cost.since === ref.since)) return ref;
    }
    const named = costs.items.filter((cost) => cost.name === value);
    return named.length === 1 ? (named[0] as Cost) : null;
}

function list(costs: Costs, now: Date): string {
    const rows = costRows(costs, now);
    const group = (title: string, items: Cost[]) =>
        items.length ? [`**${title}**`, ...items.map((cost) => `- ${line(cost, costs.currency)}`)] : [];
    return [
        ...group(
            "Running",
            rows.filter((row) => !row.ended),
        ),
        ...group(
            "Ended",
            rows.filter((row) => row.ended),
        ),
        `${money(monthlyTotal(costs, now), costs.currency)} a month, ${money(totalSpent(costs, now), costs.currency)} spent so far.`,
    ].join("\n");
}

function newCost(input: Input): Cost {
    const { name, purpose, amount, period, since, until } = input as unknown as Cost;
    return { name, purpose, amount, period, since, ...(until === undefined ? {} : { until }) };
}

function changes(input: Input): CostEdit | string {
    const edit: CostEdit = {};
    for (const key of ["name", "purpose", "amount", "period", "since", "until"] as const) {
        if (input[key] !== undefined) Object.assign(edit, { [key]: input[key] });
    }
    if (input.running === true) {
        if (edit.until !== undefined) return "Give either an end day or `running`, not both.";
        edit.until = null;
    }
    return Object.keys(edit).length ? edit : "Nothing to change.";
}

function today(now: Date): string {
    return now.toISOString().slice(0, 10);
}

export async function runCost(sub: string, input: Input, store: Store, now: Date): Promise<string> {
    const loaded = await load(store);
    if (loaded.state === "broken") return BROKEN;
    if (sub === "list") return loaded.state === "ok" ? list(loaded.costs, now) : "No cost list is stored yet.";

    const costs = loaded.state === "ok" ? loaded.costs : { currency: "USD", items: [] };
    let result: EditResult;
    let verb: string;
    let index = costs.items.length;
    if (sub === "add") {
        result = addCost(costs, newCost(input));
        verb = "Added";
    } else {
        const ref = resolve(costs, input.cost);
        if (!ref) return ERRORS["not-found"];
        index = costs.items.findIndex((cost) => cost.name === ref.name && cost.since === ref.since);
        if (sub === "edit") {
            const edit = changes(input);
            if (typeof edit === "string") return edit;
            result = editCost(costs, ref, edit);
            verb = "Updated";
        } else {
            result = endCost(costs, ref, typeof input.until === "string" ? input.until : today(now));
            verb = "Ended";
        }
    }
    if (!result.ok) return ERRORS[result.error];

    await store.put(COSTS_KEY, serializeCosts(result.costs));
    const changed = result.costs.items[index] as Cost;
    return `${verb} **${changed.name}**: ${price(changed, result.costs.currency)}, ${span(changed)}.`;
}

export async function costChoices(sub: string, typed: string, store: Store): Promise<Choice[]> {
    const loaded = await load(store);
    if (loaded.state !== "ok") return [];
    const { currency, items } = loaded.costs;
    const needle = typed.toLowerCase();
    return items
        .filter((cost) => (sub !== "end" || !cost.until) && cost.name.toLowerCase().includes(needle))
        .slice(0, 25)
        .map((cost) => ({
            name: `${cost.name} · ${price(cost, currency)} · ${span(cost)}`.slice(0, 100),
            value: refValue(cost),
        }));
}
