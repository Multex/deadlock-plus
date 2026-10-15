import { COSTS_KEY, parseCosts, type Costs } from "@deadlock-plus/costs";
import { describe, expect, it } from "vitest";
import { costChoices, runCost } from "../src/cost";

const NOW = new Date("2026-10-15T12:00:00.000Z");

const LIST: Costs = {
    currency: "USD",
    items: [
        {
            name: "Claude Max",
            purpose: "Coding help",
            amount: 100,
            period: "month",
            since: "2026-08-08",
            until: "2026-09-08",
        },
        { name: "Claude Pro", purpose: "Coding help", amount: 20, period: "month", since: "2026-09-08" },
        { name: "Domain", purpose: "deadlockplus.app", amount: 15, period: "year", since: "2026-10-14" },
    ],
};

function memory(raw: string | null = JSON.stringify(LIST)) {
    const data = new Map<string, string>();
    if (raw !== null) data.set(COSTS_KEY, raw);
    return {
        data,
        get: async (key: string) => data.get(key) ?? null,
        put: async (key: string, value: string) => void data.set(key, value),
    };
}

function stored(store: ReturnType<typeof memory>): Costs | null {
    return parseCosts(store.data.get(COSTS_KEY) ?? null);
}

const ADD = { name: "Hosting", purpose: "Website", amount: 5, period: "month", since: "2026-10-01" };

describe("/cost list", () => {
    it("shows running costs, ended costs and both totals", async () => {
        const text = await runCost("list", {}, memory(), NOW);
        expect(text).toContain("Claude Pro: $20.00 every month, since 2026-09-08 (Coding help)");
        expect(text).toContain("Domain: $15.00 every year, since 2026-10-14 (deadlockplus.app)");
        expect(text).toContain("Claude Max: $100.00 every month, 2026-08-08 to 2026-09-08 (Coding help)");
        expect(text.indexOf("Claude Pro")).toBeLessThan(text.indexOf("Claude Max"));
        expect(text).toContain("$21.25 a month");
        expect(text).toContain("$155.00 spent so far");
    });

    it("says so when nothing is stored", async () => {
        expect(await runCost("list", {}, memory(null), NOW)).toMatch(/no cost list/i);
    });

    it("says so when the stored list is broken", async () => {
        expect(await runCost("list", {}, memory("{ broken"), NOW)).toMatch(/broken/i);
    });
});

describe("/cost add", () => {
    it("stores the new cost", async () => {
        const store = memory();
        const text = await runCost("add", ADD, store, NOW);
        expect(stored(store)?.items.at(-1)).toEqual(ADD);
        expect(text).toContain("Added **Hosting**");
    });

    it("starts a list in US dollars when none is stored", async () => {
        const store = memory(null);
        await runCost("add", ADD, store, NOW);
        expect(stored(store)).toEqual({ currency: "USD", items: [ADD] });
    });

    it("refuses to write over a broken list, which would lose what was in it", async () => {
        const store = memory("{ broken");
        expect(await runCost("add", ADD, store, NOW)).toMatch(/broken/i);
        expect(store.data.get(COSTS_KEY)).toBe("{ broken");
    });

    it("explains a rejected cost and stores nothing", async () => {
        const store = memory();
        const text = await runCost("add", { ...ADD, since: "2026-02-30" }, store, NOW);
        expect(text).toMatch(/YYYY-MM-DD/);
        expect(stored(store)).toEqual(LIST);
    });

    it("explains a duplicate", async () => {
        const text = await runCost("add", { ...LIST.items[1] }, memory(), NOW);
        expect(text).toMatch(/already starts on that day/i);
    });
});

describe("/cost edit", () => {
    it("changes the picked cost", async () => {
        const store = memory();
        const text = await runCost("edit", { cost: "2026-09-08 Claude Pro", amount: 25 }, store, NOW);
        expect(stored(store)?.items[1]?.amount).toBe(25);
        expect(text).toContain("Updated **Claude Pro**");
    });

    it("accepts a typed name when only one cost has it", async () => {
        const store = memory();
        await runCost("edit", { cost: "Domain", amount: 16 }, store, NOW);
        expect(stored(store)?.items[2]?.amount).toBe(16);
    });

    it("removes the end day when asked to run again", async () => {
        const store = memory();
        await runCost("edit", { cost: "2026-08-08 Claude Max", running: true }, store, NOW);
        expect(stored(store)?.items[0]?.until).toBeUndefined();
    });

    it("refuses an end day and running together", async () => {
        const store = memory();
        const text = await runCost(
            "edit",
            { cost: "2026-08-08 Claude Max", running: true, until: "2026-10-01" },
            store,
            NOW,
        );
        expect(text).toMatch(/either/i);
        expect(stored(store)).toEqual(LIST);
    });

    it("says when nothing would change", async () => {
        expect(await runCost("edit", { cost: "Domain" }, memory(), NOW)).toMatch(/nothing to change/i);
    });

    it("says when the cost is not there", async () => {
        expect(await runCost("edit", { cost: "Hosting", amount: 1 }, memory(), NOW)).toMatch(/no cost matches/i);
    });
});

describe("/cost end", () => {
    it("ends the cost on the given day", async () => {
        const store = memory();
        const text = await runCost("end", { cost: "2026-09-08 Claude Pro", until: "2026-10-08" }, store, NOW);
        expect(stored(store)?.items[1]?.until).toBe("2026-10-08");
        expect(text).toContain("Ended **Claude Pro**");
    });

    it("ends the cost today when no day is given", async () => {
        const store = memory();
        await runCost("end", { cost: "2026-09-08 Claude Pro" }, store, NOW);
        expect(stored(store)?.items[1]?.until).toBe("2026-10-15");
    });

    it("explains a cost that has already ended", async () => {
        const text = await runCost("end", { cost: "2026-08-08 Claude Max" }, memory(), NOW);
        expect(text).toMatch(/already ended/i);
    });
});

describe("costChoices", () => {
    it("offers every cost for edit, matching the typed text", async () => {
        const choices = await costChoices("edit", "claude", memory());
        expect(choices.map((choice) => choice.value)).toEqual(["2026-08-08 Claude Max", "2026-09-08 Claude Pro"]);
    });

    it("offers only running costs for end", async () => {
        const choices = await costChoices("end", "", memory());
        expect(choices.map((choice) => choice.value)).toEqual(["2026-09-08 Claude Pro", "2026-10-14 Domain"]);
    });

    it("labels each choice so two rows with one name can be told apart", async () => {
        const [choice] = await costChoices("edit", "max", memory());
        expect(choice?.name).toBe("Claude Max · $100.00 every month · 2026-08-08 to 2026-09-08");
    });

    it("offers nothing when the stored list is broken", async () => {
        expect(await costChoices("edit", "", memory("{ broken"))).toEqual([]);
    });
});
