import { describe, expect, it } from "vitest";
import type { EditionKind, EditionWindow } from "@deadlock-plus/stats/dispatch/types";
import type { MiniCopy } from "./kinds/minis";
import { tablePiles, type TableCopies } from "./components/table";
import { escapeLeavesRoom, focusLost, roomCopy, tableFocus, tableMode } from "./room";

const DAY = 86400;
const at = (y: number, m: number, d: number) => Date.UTC(y, m, d) / 1000;
const win = (kind: EditionKind, startS: number, days: number): EditionWindow => ({
    kind,
    id: `${kind}-${startS}`,
    startS,
    endS: startS + days * DAY,
    tz: "UTC",
});
const copy = (kind: MiniCopy["kind"], w: EditionWindow, state: MiniCopy["state"] = "issued"): MiniCopy => ({
    id: w.id,
    kind,
    state,
    window: w,
    number: state === "issued" ? 1 : null,
    matches: 9,
    isNew: false,
});

describe("roomCopy", () => {
    const issued = ["weekly-a", "monthly-b"];

    it("opens the issued copy the query names", () => {
        expect(roomCopy({ query: "monthly-b", issued, soFar: "weekly-c" })).toEqual({
            kind: "edition",
            id: "monthly-b",
        });
    });

    it("opens this week so far when the query names it", () => {
        expect(roomCopy({ query: "weekly-c", issued, soFar: "weekly-c" })).toEqual({ kind: "so_far", id: "weekly-c" });
    });

    it("stays on the table with no query, or one that names no issued copy", () => {
        expect(roomCopy({ query: null, issued, soFar: "weekly-c" })).toBeNull();
        expect(roomCopy({ query: "weekly-1999", issued, soFar: null })).toBeNull();
    });
});

describe("tableMode", () => {
    const base = { accountLoaded: true, accountId: 7, status: "ready" as const, copies: 3 };

    it("lays the table once the shelf is read and holds a copy", () => {
        expect(tableMode(base)).toBe("table");
    });

    it("waits for the account, then the shelf", () => {
        expect(tableMode({ ...base, accountLoaded: false, accountId: null })).toBe("loading");
        expect(tableMode({ ...base, status: "loading" })).toBe("loading");
    });

    it("tells apart no account, offline and a shelf with nothing on it", () => {
        expect(tableMode({ ...base, accountId: null })).toBe("no_account");
        expect(tableMode({ ...base, status: "error" })).toBe("offline");
        expect(tableMode({ ...base, copies: 0 })).toBe("first_paper");
    });
});

describe("tableFocus", () => {
    const weekly = Array.from({ length: 9 }, (_, i) => copy("weekly", win("weekly", at(2026, 2, 30) - i * 7 * DAY, 7)));
    const monthly = [0, 1, 2, 3, 4].map((i) => copy("monthly", win("monthly", at(2026, 2 - i, 1), 28)));
    const special = copy("year_end", win("year_end", at(2025, 11, 1), 365));
    const soFar = copy("so_far", win("weekly", at(2026, 3, 6), 7), "so_far");
    const piles = tablePiles({ soFar, weekly, monthly, specials: [special] } satisfies TableCopies);

    it("goes back to the copy itself when it lies on the table", () => {
        for (const c of [soFar, special, weekly[0], monthly[0], monthly[1]]) {
            expect(tableFocus(piles, c.id)[0]).toBe(`[data-copy="${c.id}"]`);
        }
    });

    it("falls back to the bundle a weekly lies in", () => {
        const old = weekly.at(-1)!;
        const bundle = piles.weekly.find((b) => b.copies.some((c) => c.id === old.id))!;
        expect(tableFocus(piles, old.id)).toEqual([`[data-copy="${old.id}"]`, `[data-bundle="${bundle.key}"]`]);
    });

    it("falls back to the year bundle an older monthly is tied into", () => {
        const old = monthly.at(-1)!;
        expect(tableFocus(piles, old.id)).toEqual([`[data-copy="${old.id}"]`, `[data-bundle="monthly-2025"]`]);
    });

    it("knows nothing of a copy that is not on the table", () => {
        expect(tableFocus(piles, "weekly-1999")).toEqual([]);
    });
});

describe("focusLost", () => {
    const body = { isConnected: true };

    it("is lost when nothing, the body, or a removed control holds focus", () => {
        expect(focusLost(null, body)).toBe(true);
        expect(focusLost(body, body)).toBe(true);
        expect(focusLost({ isConnected: false }, body)).toBe(true);
    });

    it("is kept by any control still on the page", () => {
        expect(focusLost({ isConnected: true }, body)).toBe(false);
    });
});

describe("escapeLeavesRoom", () => {
    const esc = { key: "Escape", defaultPrevented: false };
    const open = { room: true, dialog: false };

    it("leaves the room on an Escape nothing else took", () => {
        expect(escapeLeavesRoom(esc, open)).toBe(true);
    });

    it("leaves it be when the object, a dialog or another key had it, or no room is open", () => {
        expect(escapeLeavesRoom({ ...esc, defaultPrevented: true }, open)).toBe(false);
        expect(escapeLeavesRoom(esc, { ...open, dialog: true })).toBe(false);
        expect(escapeLeavesRoom({ ...esc, key: "Enter" }, open)).toBe(false);
        expect(escapeLeavesRoom(esc, { ...open, room: false })).toBe(false);
    });
});
