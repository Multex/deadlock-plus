import { describe, expect, it } from "vitest";
import { parseCosts, type Cost, type Costs } from "./costs";
import { addCost, editCost, endCost, serializeCosts } from "./edit";

const PRO: Cost = { name: "Claude Pro", purpose: "Coding help", amount: 20, period: "month", since: "2026-09-08" };
const MAX: Cost = {
    name: "Claude Max",
    purpose: "Coding help",
    amount: 100,
    period: "month",
    since: "2026-08-08",
    until: "2026-09-08",
};
const LIST: Costs = { currency: "USD", items: [MAX, PRO] };

describe("addCost", () => {
    it("appends a valid row", () => {
        const domain: Cost = {
            name: "Domain",
            purpose: "deadlockplus.app",
            amount: 15,
            period: "year",
            since: "2026-10-14",
        };
        const result = addCost(LIST, domain);
        expect(result).toEqual({ ok: true, costs: { currency: "USD", items: [MAX, PRO, domain] } });
    });

    it("does not change the list it was given", () => {
        addCost(LIST, { ...PRO, since: "2026-11-01" });
        expect(LIST.items).toHaveLength(2);
    });

    it("rejects a row the page would reject", () => {
        expect(addCost(LIST, { ...PRO, since: "2026-02-30" })).toEqual({ ok: false, error: "invalid" });
        expect(addCost(LIST, { ...PRO, since: "2026-11-01", amount: -5 })).toEqual({ ok: false, error: "invalid" });
        expect(addCost(LIST, { ...PRO, since: "2026-11-01", amount: Number.NaN })).toEqual({
            ok: false,
            error: "invalid",
        });
    });

    it("allows a name again once it starts on another day, as when a plan is taken up again", () => {
        const again = { ...MAX, since: "2026-11-08", until: undefined };
        expect(addCost(LIST, again).ok).toBe(true);
    });

    it("rejects a second row with the same name and start day", () => {
        expect(addCost(LIST, { ...PRO, amount: 25 })).toEqual({ ok: false, error: "duplicate" });
    });

    it("rejects an end day that is not after the start day", () => {
        expect(addCost(LIST, { ...PRO, since: "2026-11-01", until: "2026-11-01" })).toEqual({
            ok: false,
            error: "ends-before-start",
        });
    });

    it("keeps only the fields the page reads", () => {
        const extra = { ...PRO, since: "2026-11-01", note: "x" } as Cost;
        const result = addCost(LIST, extra);
        expect(result.ok && result.costs.items[2]).toEqual({ ...PRO, since: "2026-11-01" });
    });
});

describe("editCost", () => {
    it("changes the named row", () => {
        const result = editCost(LIST, { name: "Claude Pro", since: "2026-09-08" }, { amount: 25, purpose: "Agents" });
        expect(result.ok && result.costs.items[1]).toEqual({ ...PRO, amount: 25, purpose: "Agents" });
    });

    it("renames a row", () => {
        const result = editCost(LIST, { name: "Claude Pro", since: "2026-09-08" }, { name: "Claude" });
        expect(result.ok && result.costs.items.map((cost) => cost.name)).toEqual(["Claude Max", "Claude"]);
    });

    it("clears the end day with null", () => {
        const result = editCost(LIST, { name: "Claude Max", since: "2026-08-08" }, { until: null });
        const { until: _, ...running } = MAX;
        expect(result.ok && result.costs.items[0]).toStrictEqual(running);
    });

    it("reports a row that is not there", () => {
        expect(editCost(LIST, { name: "Claude Pro", since: "2026-01-01" }, { amount: 1 })).toEqual({
            ok: false,
            error: "not-found",
        });
    });

    it("rejects an edit that makes the row invalid", () => {
        expect(editCost(LIST, { name: "Claude Pro", since: "2026-09-08" }, { since: "soon" })).toEqual({
            ok: false,
            error: "invalid",
        });
    });

    it("rejects an edit that makes the row match another one", () => {
        expect(
            editCost(LIST, { name: "Claude Pro", since: "2026-09-08" }, { name: "Claude Max", since: "2026-08-08" }),
        ).toEqual({ ok: false, error: "duplicate" });
    });

    it("rejects an end day that is not after the start day", () => {
        expect(editCost(LIST, { name: "Claude Max", since: "2026-08-08" }, { until: "2026-08-01" })).toEqual({
            ok: false,
            error: "ends-before-start",
        });
    });
});

describe("endCost", () => {
    it("sets the end day of a running row", () => {
        const result = endCost(LIST, { name: "Claude Pro", since: "2026-09-08" }, "2026-10-08");
        expect(result.ok && result.costs.items[1]).toEqual({ ...PRO, until: "2026-10-08" });
    });

    it("refuses a row that has already ended, so its end day is not moved by mistake", () => {
        expect(endCost(LIST, { name: "Claude Max", since: "2026-08-08" }, "2026-10-08")).toEqual({
            ok: false,
            error: "already-ended",
        });
    });

    it("rejects an end day that is not after the start day", () => {
        expect(endCost(LIST, { name: "Claude Pro", since: "2026-09-08" }, "2026-09-08")).toEqual({
            ok: false,
            error: "ends-before-start",
        });
    });

    it("rejects an end day that is not a day", () => {
        expect(endCost(LIST, { name: "Claude Pro", since: "2026-09-08" }, "next week")).toEqual({
            ok: false,
            error: "invalid",
        });
    });

    it("reports a row that is not there", () => {
        expect(endCost(LIST, { name: "Domain", since: "2026-10-14" }, "2026-11-01")).toEqual({
            ok: false,
            error: "not-found",
        });
    });
});

describe("serializeCosts", () => {
    it("writes text the page reads back unchanged", () => {
        expect(parseCosts(serializeCosts(LIST))).toEqual(LIST);
    });

    it("indents, so the key stays readable in the Cloudflare dashboard", () => {
        expect(serializeCosts(LIST)).toContain('\n    "currency": "USD"');
    });
});
