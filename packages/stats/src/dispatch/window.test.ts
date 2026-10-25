import { describe, expect, it } from "vitest";
import type { DispatchIndex, IssuedEntry } from "./types";
import { closedWindowBefore, dueWindow, pastWindows, soFarWindow, windowFor } from "./window";

const HOUR = 3600;
const DAY = 24 * HOUR;
const utc = (y: number, m: number, d: number, h = 0, mi = 0, s = 0) => Date.UTC(y, m - 1, d, h, mi, s) / 1000;

const emptyIndex = (): DispatchIndex => ({ schema: 1, issued: [], skipped: [], seenThrough: null });
const issued = (id: string): IssuedEntry => ({
    id,
    kind: id.startsWith("weekly") ? "weekly" : "monthly",
    number: 1,
    issuedAt: 0,
    startS: 0,
    endS: 0,
    matches: 5,
    onRequest: false,
});

describe("windowFor weekly", () => {
    it("runs Monday 00:00 to the next Monday 00:00 in UTC", () => {
        expect(windowFor("weekly", utc(2026, 10, 22, 15), "UTC")).toEqual({
            kind: "weekly",
            id: "weekly-2026-10-19",
            startS: utc(2026, 10, 19),
            endS: utc(2026, 10, 26),
            tz: "UTC",
        });
    });

    it("puts Monday 00:00 in the week it starts and Sunday 23:59:59 in the week before", () => {
        expect(windowFor("weekly", utc(2026, 10, 19), "UTC").id).toBe("weekly-2026-10-19");
        expect(windowFor("weekly", utc(2026, 10, 18, 23, 59, 59), "UTC").id).toBe("weekly-2026-10-12");
    });

    it("uses the local date, not the UTC date", () => {
        // Sunday 20:00 UTC is already Monday 05:00 in Tokyo.
        const w = windowFor("weekly", utc(2026, 10, 25, 20), "Asia/Tokyo");
        expect(w.id).toBe("weekly-2026-10-26");
        expect(w.startS).toBe(utc(2026, 10, 25, 15));
        expect(w.endS).toBe(utc(2026, 11, 1, 15));
    });

    it("is one hour longer across the Berlin DST end on 2026-10-25", () => {
        const w = windowFor("weekly", utc(2026, 10, 25, 12), "Europe/Berlin");
        expect(w.id).toBe("weekly-2026-10-19");
        expect(w.startS).toBe(utc(2026, 10, 18, 22));
        expect(w.endS).toBe(utc(2026, 10, 25, 23));
        expect(w.endS - w.startS).toBe(7 * DAY + HOUR);
    });

    it("is one hour shorter across the Berlin DST start on 2026-03-29", () => {
        const w = windowFor("weekly", utc(2026, 3, 29, 12), "Europe/Berlin");
        expect(w.id).toBe("weekly-2026-03-23");
        expect(w.startS).toBe(utc(2026, 3, 22, 23));
        expect(w.endS).toBe(utc(2026, 3, 29, 22));
    });

    it("is one hour longer across the New York DST end on 2026-11-01", () => {
        const w = windowFor("weekly", utc(2026, 11, 1, 12), "America/New_York");
        expect(w.id).toBe("weekly-2026-10-26");
        expect(w.startS).toBe(utc(2026, 10, 26, 4));
        expect(w.endS).toBe(utc(2026, 11, 2, 5));
    });

    it("names the Monday across a year edge", () => {
        const w = windowFor("weekly", utc(2026, 1, 1, 12), "UTC");
        expect(w.id).toBe("weekly-2025-12-29");
        expect(w.startS).toBe(utc(2025, 12, 29));
    });

    it("starts at the end of the gap when Monday 00:00 does not exist locally", () => {
        // Tehran moved from +03:30 to +04:30 at Monday 2010-03-22 00:00.
        const at = utc(2010, 3, 22, 6);
        const w = windowFor("weekly", at, "Asia/Tehran");
        expect(w.id).toBe("weekly-2010-03-22");
        expect(w.startS).toBe(utc(2010, 3, 21, 20, 30));
        expect(w.startS).toBeLessThanOrEqual(at);
        expect(w.endS).toBeGreaterThan(at);
    });
});

describe("windowFor monthly", () => {
    it("runs from the 1st to the next 1st", () => {
        expect(windowFor("monthly", utc(2026, 10, 15), "UTC")).toEqual({
            kind: "monthly",
            id: "monthly-2026-10",
            startS: utc(2026, 10, 1),
            endS: utc(2026, 11, 1),
            tz: "UTC",
        });
    });

    it("crosses the year edge", () => {
        const w = windowFor("monthly", utc(2026, 12, 31, 23, 59, 59), "UTC");
        expect(w.id).toBe("monthly-2026-12");
        expect(w.endS).toBe(utc(2027, 1, 1));
        expect(windowFor("monthly", utc(2027, 1, 1), "UTC").id).toBe("monthly-2027-01");
    });

    it("uses local midnights on both sides of a DST change", () => {
        const w = windowFor("monthly", utc(2026, 10, 10), "Europe/Berlin");
        expect(w.startS).toBe(utc(2026, 9, 30, 22));
        expect(w.endS).toBe(utc(2026, 10, 31, 23));
    });

    it("handles February in a leap year", () => {
        const w = windowFor("monthly", utc(2028, 2, 29, 12), "UTC");
        expect(w.id).toBe("monthly-2028-02");
        expect(w.endS - w.startS).toBe(29 * DAY);
    });

    it("starts at the end of the gap when the 1st 00:00 does not exist locally", () => {
        // Asuncion moved from -04 to -03 at 2023-10-01 00:00.
        const w = windowFor("monthly", utc(2023, 10, 15), "America/Asuncion");
        expect(w.id).toBe("monthly-2023-10");
        expect(w.startS).toBe(utc(2023, 10, 1, 4));
    });
});

describe("windows tile", () => {
    it("each window starts where the one before it ends", () => {
        for (const tz of ["UTC", "Europe/Berlin", "America/New_York", "Australia/Lord_Howe", "Asia/Tehran"]) {
            for (const kind of ["weekly", "monthly"] as const) {
                let w = windowFor(kind, utc(2025, 1, 3), tz);
                for (let i = 0; i < 60; i++) {
                    const next = windowFor(kind, w.endS, tz);
                    expect(next.startS).toBe(w.endS);
                    expect(next.id > w.id).toBe(true);
                    w = next;
                }
            }
        }
    });
});

describe("closedWindowBefore", () => {
    it("is the window before the one holding now", () => {
        expect(closedWindowBefore("weekly", utc(2026, 10, 26, 9), "UTC").id).toBe("weekly-2026-10-19");
        expect(closedWindowBefore("monthly", utc(2026, 10, 26, 9), "UTC").id).toBe("monthly-2026-09");
    });

    it("counts a window as closed at the instant it ends", () => {
        expect(closedWindowBefore("weekly", utc(2026, 10, 26), "UTC").id).toBe("weekly-2026-10-19");
        expect(closedWindowBefore("weekly", utc(2026, 10, 26) - 1, "UTC").id).toBe("weekly-2026-10-12");
    });
});

describe("soFarWindow", () => {
    it("is the open weekly window", () => {
        const w = soFarWindow(utc(2026, 10, 22, 15), "UTC");
        expect(w.kind).toBe("weekly");
        expect(w.id).toBe("weekly-2026-10-19");
    });
});

describe("pastWindows", () => {
    const now = utc(2026, 10, 22, 15);

    it("lists closed windows newest first back to the one holding earliestS", () => {
        expect(pastWindows("weekly", now, "UTC", utc(2026, 9, 30)).map((w) => w.id)).toEqual([
            "weekly-2026-10-12",
            "weekly-2026-10-05",
            "weekly-2026-09-28",
        ]);
    });

    it("includes the window that starts exactly at earliestS and nothing older", () => {
        expect(pastWindows("weekly", now, "UTC", utc(2026, 10, 5)).map((w) => w.id)).toEqual([
            "weekly-2026-10-12",
            "weekly-2026-10-05",
        ]);
    });

    it("works for months", () => {
        expect(pastWindows("monthly", now, "UTC", utc(2026, 7, 31, 23)).map((w) => w.id)).toEqual([
            "monthly-2026-09",
            "monthly-2026-08",
            "monthly-2026-07",
        ]);
    });

    it("is empty when earliestS is in the open window or the future", () => {
        expect(pastWindows("weekly", now, "UTC", utc(2026, 10, 19))).toEqual([]);
        expect(pastWindows("weekly", now, "UTC", now + DAY * 30)).toEqual([]);
    });
});

describe("dueWindow", () => {
    const now = utc(2026, 10, 26, 9);

    it("is the newest closed window when the index has not seen it", () => {
        expect(dueWindow("weekly", now, "UTC", emptyIndex())?.id).toBe("weekly-2026-10-19");
    });

    it("is null once that window is issued or skipped", () => {
        const done = { ...emptyIndex(), issued: [issued("weekly-2026-10-19")] };
        expect(dueWindow("weekly", now, "UTC", done)).toBeNull();
        const skipped = { ...emptyIndex(), skipped: ["weekly-2026-10-19"] };
        expect(dueWindow("weekly", now, "UTC", skipped)).toBeNull();
    });

    it("never offers an older window even when it was never issued", () => {
        const index = { ...emptyIndex(), issued: [issued("monthly-2026-09")] };
        expect(dueWindow("monthly", now, "UTC", index)).toBeNull();
        expect(dueWindow("weekly", now, "UTC", index)?.id).toBe("weekly-2026-10-19");
    });
});
