import type { DispatchIndex, IssuedEntry } from "@deadlock-plus/stats/dispatch/types";
import { describe, expect, it } from "vitest";
import {
    firstPaper,
    pageMode,
    pinFor,
    selectEdition,
    switchOptions,
    switchTarget,
    switchValue,
    unseenIds,
    type SelectInput,
} from "./page-state";

const input = (over: Partial<SelectInput> = {}): SelectInput => ({
    query: null,
    issued: ["weekly-2026-10-05", "monthly-2026-09", "weekly-2026-09-28"],
    unseen: [],
    latest: { weekly: "weekly-2026-10-05", monthly: "monthly-2026-09" },
    soFar: "weekly-2026-10-12",
    ...over,
});

describe("selectEdition", () => {
    it("takes the edition the query names", () => {
        expect(selectEdition(input({ query: "weekly-2026-09-28", unseen: ["monthly-2026-09"] }))).toEqual({
            kind: "edition",
            id: "weekly-2026-09-28",
        });
    });

    it("takes this week so far when the query names it", () => {
        expect(selectEdition(input({ query: "weekly-2026-10-12" }))).toEqual({
            kind: "so_far",
            id: "weekly-2026-10-12",
        });
    });

    it("falls back to the newest unseen edition when the query names nothing known", () => {
        expect(selectEdition(input({ query: "weekly-1999-01-04", unseen: ["monthly-2026-09"] }))).toEqual({
            kind: "edition",
            id: "monthly-2026-09",
        });
    });

    it("then the latest weekly", () => {
        expect(selectEdition(input())).toEqual({ kind: "edition", id: "weekly-2026-10-05" });
    });

    it("then the latest monthly", () => {
        const latest = { weekly: null, monthly: "monthly-2026-09" };
        expect(selectEdition(input({ latest }))).toEqual({ kind: "edition", id: "monthly-2026-09" });
    });

    it("then this week so far", () => {
        const latest = { weekly: null, monthly: null };
        expect(selectEdition(input({ latest, issued: [] }))).toEqual({ kind: "so_far", id: "weekly-2026-10-12" });
    });

    it("is empty with nothing to show", () => {
        const latest = { weekly: null, monthly: null };
        expect(selectEdition(input({ latest, issued: [], soFar: null }))).toEqual({ kind: "empty" });
    });

    it("waits for the unseen list before falling back, so a later list cannot move the paper", () => {
        expect(selectEdition(input({ unseen: null }))).toEqual({ kind: "pending" });
        expect(selectEdition(input({ unseen: null, query: "monthly-2026-09" }))).toEqual({
            kind: "edition",
            id: "monthly-2026-09",
        });
    });

    it("ignores an unseen id that is not issued", () => {
        expect(selectEdition(input({ unseen: ["weekly-2020-01-06"] }))).toEqual({
            kind: "edition",
            id: "weekly-2026-10-05",
        });
    });
});

describe("pinFor", () => {
    it("writes a fallback choice to the URL", () => {
        expect(pinFor(null, { kind: "edition", id: "weekly-2026-10-05" })).toBe("weekly-2026-10-05");
        expect(pinFor("nope", { kind: "so_far", id: "weekly-2026-10-12" })).toBe("weekly-2026-10-12");
    });

    it("leaves the URL alone when it already names the choice or there is none", () => {
        expect(pinFor("monthly-2026-09", { kind: "edition", id: "monthly-2026-09" })).toBeNull();
        expect(pinFor(null, { kind: "empty" })).toBeNull();
        expect(pinFor(null, { kind: "pending" })).toBeNull();
    });
});

const entry = (id: string, startS: number, onRequest = false): IssuedEntry => ({
    id,
    kind: id.startsWith("weekly") ? "weekly" : "monthly",
    number: 1,
    issuedAt: startS,
    startS,
    endS: startS + 1,
    matches: 5,
    onRequest,
});

describe("unseenIds", () => {
    it("lists automatic issues not opened yet, newest first", () => {
        const index: DispatchIndex = {
            schema: 1,
            issued: [
                entry("weekly-b", 300),
                entry("monthly-a", 200),
                entry("weekly-a", 100),
                entry("weekly-p", 50, true),
            ],
            skipped: [],
            seen: ["weekly-b"],
        };
        expect(unseenIds(index)).toEqual(["monthly-a", "weekly-a"]);
    });
});

describe("pageMode", () => {
    const base = { accountLoaded: true, accountId: 7, status: "ready" as const, selection: { kind: "empty" as const } };

    it("asks for an account first", () => {
        expect(pageMode({ ...base, accountId: null, status: "idle" })).toBe("no_account");
    });

    it("waits while the account is still unknown", () => {
        expect(pageMode({ ...base, accountLoaded: false, accountId: null, status: "idle" })).toBe("loading");
    });

    it("reports a failed load", () => {
        expect(pageMode({ ...base, status: "error" })).toBe("offline");
    });

    it("waits while the store or the unseen list loads", () => {
        expect(pageMode({ ...base, status: "loading" })).toBe("loading");
        expect(pageMode({ ...base, status: "idle" })).toBe("loading");
        expect(pageMode({ ...base, selection: { kind: "pending" } })).toBe("loading");
    });

    it("shows the paper when one is chosen", () => {
        expect(pageMode({ ...base, selection: { kind: "edition", id: "x" } })).toBe("paper");
        expect(pageMode({ ...base, selection: { kind: "so_far", id: "x" } })).toBe("paper");
    });

    it("says when the first paper comes out when there is none", () => {
        expect(pageMode(base)).toBe("first_paper");
    });
});

describe("firstPaper", () => {
    // Wednesday 2026-10-14 12:00 UTC; the next Monday is 2026-10-19.
    const NOW = Date.UTC(2026, 9, 14, 12) / 1000;

    it("comes out next Monday at 00:00 local", () => {
        expect(firstPaper(NOW, "UTC", 0).dateS).toBe(Date.UTC(2026, 9, 19) / 1000);
    });

    it("counts the matches still needed this week", () => {
        expect(firstPaper(NOW, "UTC", 0).needed).toBe(3);
        expect(firstPaper(NOW, "UTC", 2).needed).toBe(1);
        expect(firstPaper(NOW, "UTC", 5).needed).toBe(0);
    });
});

describe("switch", () => {
    const latest = { weekly: "weekly-2026-10-05", monthly: "monthly-2026-09" };

    it("offers only the papers that exist", () => {
        expect(switchOptions(latest, "weekly-2026-10-12")).toEqual(["weekly", "monthly", "so_far"]);
        expect(switchOptions({ weekly: null, monthly: "monthly-2026-09" }, null)).toEqual(["monthly"]);
    });

    it("goes to the latest of a kind", () => {
        expect(switchTarget("weekly", latest, "weekly-2026-10-12")).toBe("weekly-2026-10-05");
        expect(switchTarget("monthly", latest, "weekly-2026-10-12")).toBe("monthly-2026-09");
        expect(switchTarget("so_far", latest, "weekly-2026-10-12")).toBe("weekly-2026-10-12");
        expect(switchTarget("monthly", { weekly: null, monthly: null }, null)).toBeNull();
    });

    it("lights the kind of the paper shown", () => {
        expect(switchValue({ kind: "so_far", id: "weekly-2026-10-12" })).toBe("so_far");
        expect(switchValue({ kind: "edition", id: "weekly-2026-09-28" })).toBe("weekly");
        expect(switchValue({ kind: "edition", id: "monthly-2026-08" })).toBe("monthly");
        expect(switchValue({ kind: "empty" })).toBeNull();
    });
});
