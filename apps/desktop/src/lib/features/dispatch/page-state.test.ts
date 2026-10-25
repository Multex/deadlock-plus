import type { DispatchIndex, IssuedEntry } from "@deadlock-plus/stats/dispatch/types";
import { describe, expect, it } from "vitest";
import { firstPaper, pageMode, pinFor, selectEdition, standGroups, unseenIds, type SelectInput } from "./page-state";
import type { ShelfEntry } from "./service";

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

describe("standGroups", () => {
    const DAY = 86400;
    const entry = (id: string, startS: number, endS: number, status: ShelfEntry["status"] = "issued"): ShelfEntry => ({
        // The paper's look comes from the list an entry sits in, not from `window.kind`.
        window: { kind: "weekly", id, startS, endS, tz: "UTC" },
        status,
        matches: 5,
        number: status === "issued" ? 1 : null,
        onRequest: false,
    });
    // Mondays 2026-09-28 and 2026-10-05; 2026-09-01; 2026-01-01.
    const SEP28 = 1790553600;
    const OCT5 = SEP28 + 7 * DAY;
    const SEP1 = 1788220800;
    const JAN1 = 1767225600;
    const weekly = [
        entry("weekly-2026-10-05", OCT5, OCT5 + 7 * DAY),
        entry("weekly-2026-09-28", SEP28, OCT5, "too_few"),
    ];
    const monthly = [entry("monthly-2026-09", SEP1, SEP1 + 30 * DAY, "printable")];
    const collectors = [entry("collectors-2026-03", JAN1 + 60 * DAY, JAN1 + 90 * DAY)];
    const yearEnd = [entry("year_end-2025", JAN1 - 365 * DAY, JAN1)];
    const soFar = { window: entry("weekly-2026-10-12", OCT5 + 7 * DAY, OCT5 + 14 * DAY).window, matches: 3 };

    const ids = (groups: ReturnType<typeof standGroups>) => groups.map((g) => [g.id, g.items.map((i) => i.id)]);

    it("orders the groups so far, specials, monthly, weekly, each newest first", () => {
        const groups = standGroups({ weekly, monthly, collectors, year_end: yearEnd }, soFar);
        expect(ids(groups)).toEqual([
            ["so_far", ["weekly-2026-10-12"]],
            ["specials", ["collectors-2026-03", "year_end-2025"]],
            ["monthly", ["monthly-2026-09"]],
            ["weekly", ["weekly-2026-10-05", "weekly-2026-09-28"]],
        ]);
    });

    it("gives each paper the look of the list it came from", () => {
        const groups = standGroups({ weekly, monthly, collectors, year_end: yearEnd }, soFar);
        expect(groups.flatMap((g) => g.items.map((i) => i.paper))).toEqual([
            "so_far",
            "collectors",
            "year_end",
            "monthly",
            "weekly",
            "weekly",
        ]);
        expect(groups[0].items[0]).toMatchObject({ kind: "so_far", matches: 3 });
        expect(groups[3].items[1]).toMatchObject({ kind: "entry", entry: { status: "too_few" } });
    });

    it("hides empty groups, and takes a shelf without special lists", () => {
        expect(ids(standGroups({ weekly, monthly: [] }, null))).toEqual([
            ["weekly", ["weekly-2026-10-05", "weekly-2026-09-28"]],
        ]);
    });

    it("puts the year-end special first when it closes with a collector's copy", () => {
        const sameEnd = [entry("collectors-2025-12", JAN1 - 31 * DAY, JAN1)];
        expect(ids(standGroups({ weekly: [], monthly: [], collectors: sameEnd, year_end: yearEnd }, null))).toEqual([
            ["specials", ["year_end-2025", "collectors-2025-12"]],
        ]);
    });
});
