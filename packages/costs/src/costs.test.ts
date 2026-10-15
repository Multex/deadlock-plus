import { describe, expect, it } from "vitest";
import { costRows, loadCosts, monthlyTotal, parseCosts, promoteCosts, totalSpent, type Costs } from "./costs";

const NOW = new Date("2026-10-15T12:00:00.000Z");

function doc(items: unknown[], currency = "USD"): string {
    return JSON.stringify({ currency, items });
}

const DOMAIN = { name: "Domain", purpose: "deadlockplus.app", amount: 12, period: "year", since: "2026-10-14" };
const HOSTING = { name: "Hosting", purpose: "Website", amount: 5, period: "month", since: "2026-08-01" };

function memory(entries: Record<string, string> = {}) {
    const data = new Map(Object.entries(entries));
    return {
        data,
        get: async (key: string) => data.get(key) ?? null,
        put: async (key: string, value: string) => void data.set(key, value),
    };
}

describe("parseCosts", () => {
    it("reads a valid list", () => {
        const costs = parseCosts(doc([DOMAIN, HOSTING]));
        expect(costs?.currency).toBe("USD");
        expect(costs?.items).toHaveLength(2);
    });

    it("rejects text that is not JSON", () => {
        expect(parseCosts("{ items: [")).toBeNull();
        expect(parseCosts(null)).toBeNull();
    });

    it("rejects the whole list when one row is wrong, so a typo never drops a cost silently", () => {
        expect(parseCosts(doc([DOMAIN, { ...HOSTING, amount: "5" }]))).toBeNull();
        expect(parseCosts(doc([DOMAIN, { ...HOSTING, period: "week" }]))).toBeNull();
        expect(parseCosts(doc([DOMAIN, { ...HOSTING, since: "August" }]))).toBeNull();
        expect(parseCosts(doc([DOMAIN, { ...HOSTING, until: "2026-13-01" }]))).toBeNull();
        expect(parseCosts(doc([DOMAIN, { ...HOSTING, amount: -1 }]))).toBeNull();
    });

    it("rejects a currency that is not a three-letter code", () => {
        expect(parseCosts(doc([DOMAIN], "dollars"))).toBeNull();
    });

    it("accepts an empty list", () => {
        expect(parseCosts(doc([]))?.items).toEqual([]);
    });
});

describe("monthlyTotal", () => {
    it("adds monthly costs and spreads yearly ones over twelve months", () => {
        const costs = parseCosts(doc([DOMAIN, HOSTING])) as Costs;
        expect(monthlyTotal(costs, NOW)).toBe(6);
    });

    it("leaves out one-off costs, ended costs and costs that have not started", () => {
        const costs = parseCosts(
            doc([
                HOSTING,
                { name: "Signing", purpose: "Certificate", amount: 99, period: "once", since: "2026-09-01" },
                {
                    name: "Old",
                    purpose: "Ended",
                    amount: 50,
                    period: "month",
                    since: "2026-01-01",
                    until: "2026-10-01",
                },
                { name: "Next", purpose: "Planned", amount: 50, period: "month", since: "2026-11-01" },
            ]),
        ) as Costs;
        expect(monthlyTotal(costs, NOW)).toBe(5);
    });
});

describe("totalSpent", () => {
    it("charges a monthly cost once per started month", () => {
        // 1 Aug, 1 Sep and 1 Oct have been billed by 15 Oct.
        const costs = parseCosts(doc([HOSTING])) as Costs;
        expect(totalSpent(costs, NOW)).toBe(15);
    });

    it("charges a yearly cost once per started year", () => {
        const costs = parseCosts(doc([DOMAIN])) as Costs;
        expect(totalSpent(costs, NOW)).toBe(12);
        expect(totalSpent(costs, new Date("2027-10-14T00:00:00.000Z"))).toBe(24);
    });

    it("stops charging on the end date", () => {
        const costs = parseCosts(doc([{ ...HOSTING, until: "2026-10-01" }])) as Costs;
        expect(totalSpent(costs, NOW)).toBe(10);
    });

    it("counts a one-off cost once it has been paid", () => {
        const signing = { name: "Signing", purpose: "Certificate", amount: 99.5, period: "once", since: "2026-09-01" };
        expect(totalSpent(parseCosts(doc([signing])) as Costs, NOW)).toBe(99.5);
        expect(totalSpent(parseCosts(doc([{ ...signing, since: "2026-11-01" }])) as Costs, NOW)).toBe(0);
    });

    it("counts a month that is shorter than the start day", () => {
        const late = { ...HOSTING, since: "2026-01-31" };
        // Billed 31 Jan, then the last day of each month through 30 Sep: nine charges by 15 Oct.
        expect(totalSpent(parseCosts(doc([late])) as Costs, NOW)).toBe(45);
    });
});

describe("costRows", () => {
    it("lists running costs by monthly share, then one-off and ended costs", () => {
        const costs = parseCosts(
            doc([
                DOMAIN,
                {
                    name: "Old",
                    purpose: "Ended",
                    amount: 50,
                    period: "month",
                    since: "2026-01-01",
                    until: "2026-10-01",
                },
                { name: "Signing", purpose: "Certificate", amount: 99, period: "once", since: "2026-09-01" },
                HOSTING,
            ]),
        ) as Costs;
        expect(costRows(costs, NOW).map((row) => [row.name, row.ended])).toEqual([
            ["Hosting", false],
            ["Domain", false],
            ["Signing", false],
            ["Old", true],
        ]);
    });
});

describe("loadCosts", () => {
    it("shows the edited list when it is valid", async () => {
        const store = memory({ costs: doc([HOSTING]), "costs:last-good": doc([DOMAIN]) });
        expect((await loadCosts(store))?.items[0]?.name).toBe("Hosting");
    });

    it("falls back to the last good list when the edited one is broken", async () => {
        const store = memory({ costs: "{ broken", "costs:last-good": doc([DOMAIN]) });
        expect((await loadCosts(store))?.items[0]?.name).toBe("Domain");
    });

    it("returns nothing when no list was ever saved", async () => {
        expect(await loadCosts(memory())).toBeNull();
    });
});

describe("promoteCosts", () => {
    it("keeps a valid edited list as the last good one", async () => {
        const store = memory({ costs: doc([HOSTING]) });
        await promoteCosts(store);
        expect(store.data.get("costs:last-good")).toBe(doc([HOSTING]));
    });

    it("keeps the last good list when the edited one is broken", async () => {
        const store = memory({ costs: "{ broken", "costs:last-good": doc([DOMAIN]) });
        await promoteCosts(store);
        expect(store.data.get("costs:last-good")).toBe(doc([DOMAIN]));
    });
});
