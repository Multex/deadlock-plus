import { describe, expect, it } from "vitest";
import type { EditionKind, EditionWindow } from "@deadlock-plus/stats/dispatch/types";
import type { MiniCopy, MiniFormat } from "../kinds/minis";
import type { ShelfEntry } from "../service";
import {
    bundleAria,
    bundleName,
    slipText,
    spineText,
    spreadLayout,
    tableCopies,
    tableLayout,
    tablePiles,
    type TableCopies,
} from "./table";

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

/** Mondays from `from`, newest first. */
function weeks(from: number, count: number): MiniCopy[] {
    return Array.from({ length: count }, (_, i) => copy("weekly", win("weekly", from - i * 7 * DAY, 7)));
}

function months(year: number, month: number, count: number): MiniCopy[] {
    const out: MiniCopy[] = [];
    for (let i = 0; i < count; i++) {
        const d = new Date(Date.UTC(year, month - i, 1));
        const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
        const w = { ...win("monthly", d.getTime() / 1000, 30), endS: next.getTime() / 1000 };
        out.push(copy("monthly", w));
    }
    return out;
}

function specials(count: number): MiniCopy[] {
    return Array.from({ length: count }, (_, i) =>
        copy("collectors", win("collectors", at(2026, 9, 1) - i * 90 * DAY, 90)),
    );
}

const empty: TableCopies = { soFar: null, weekly: [], monthly: [], specials: [] };

const fmt: MiniFormat = {
    t: (key, params) => (params ? `${key}${JSON.stringify(params)}` : key),
    tn: (key, count, params) => `${key}#${count}${params ? JSON.stringify(params) : ""}`,
    date: (s, tz, o) => new Intl.DateTimeFormat("en-US", { ...o, timeZone: tz }).format(s * 1000),
    range: () => "",
    upper: (s) => s.toUpperCase(),
};

const entry = (w: EditionWindow, status: ShelfEntry["status"] = "issued"): ShelfEntry => ({
    window: w,
    status,
    matches: 9,
    number: status === "issued" ? 2 : null,
    onRequest: false,
});

describe("tableCopies", () => {
    it("reads the shelf newest first, with every special in one list", () => {
        const older = win("weekly", at(2026, 8, 7), 7);
        const newer = win("weekly", at(2026, 8, 14), 7);
        const ye = win("year_end", at(2024, 11, 1), 365);
        const col = win("collectors", at(2026, 6, 30), 98);
        const c = tableCopies(
            {
                weekly: [entry(older), entry(newer, "printable")],
                monthly: [],
                collectors: [entry(col)],
                year_end: [entry(ye)],
            },
            { id: "live", window: win("weekly", at(2026, 8, 21), 7), matches: 3 },
            [col.id],
        );
        expect(c.weekly.map((x) => x.id)).toEqual([newer.id, older.id]);
        expect(c.weekly[0].state).toBe("proof");
        expect(c.specials.map((x) => x.id)).toEqual([col.id, ye.id]);
        expect(c.specials[0].isNew).toBe(true);
        expect(c.soFar?.state).toBe("so_far");
    });
});

describe("tablePiles", () => {
    it("stacks this year's weeklies by month and ties each older year into one bundle", () => {
        const p = tablePiles({ ...empty, weekly: weeks(at(2026, 1, 9), 12) });
        // Feb 9 2026 back 11 weeks: Feb (2), Jan (4), then Dec, Nov 2025.
        expect(p.weekly.map((b) => b.key)).toEqual(["weekly-2026-1", "weekly-2026-0", "weekly-2025"]);
        expect(p.weekly.map((b) => b.copies.length)).toEqual([2, 4, 6]);
        expect(p.weekly[2].month).toBeNull();
    });

    it("lays the newest issued weekly on top, skipping a proof", () => {
        const list = weeks(at(2026, 1, 9), 3);
        list[0] = { ...list[0], state: "proof" };
        expect(tablePiles({ ...empty, weekly: list }).topWeekly?.id).toBe(list[1].id);
    });

    it("bundles every older year of monthlies on its own", () => {
        const p = tablePiles({ ...empty, monthly: months(2026, 2, 20) });
        expect(p.topMonthly?.id).toBe(months(2026, 2, 1)[0].id);
        expect(p.monthlyYears.map((b) => [b.key, b.copies.length])).toEqual([
            ["monthly-2025", 12],
            ["monthly-2024", 5],
        ]);
        expect(p.spines.filter((s) => s.bundle === null)).toHaveLength(2);
    });

    it("never drops a special", () => {
        const p = tablePiles({ ...empty, specials: specials(7) });
        expect(p.specials).toHaveLength(7);
    });
});

describe("tableLayout", () => {
    const full = (): TableCopies => ({
        soFar: copy("so_far", win("weekly", at(2026, 9, 26), 7), "so_far"),
        weekly: weeks(at(2026, 9, 19), 30),
        monthly: months(2026, 8, 10),
        specials: specials(3),
    });

    it("measures the weekly edges before centring the scene", () => {
        const L = tableLayout(tablePiles(full()), 1250, 620);
        expect(L.weekly).not.toBeNull();
        expect(Number.isFinite(L.offset)).toBe(true);
        expect(L.weekly!.edgesH).toBeGreaterThan(0);
        const low = L.weekly!.y + L.weekly!.coverH + L.weekly!.edgesH;
        expect(low).toBeLessThanOrEqual(L.bottom + L.offset + 0.5);
        // Same margin above the scene as below it.
        expect(L.offset).toBeCloseTo(Math.max(0, (620 - L.bottom - 40) / 2));
    });

    it("lays a fifth special and every one past it in a pile on the fourth spot", () => {
        const L = tableLayout(tablePiles({ ...empty, specials: specials(6) }), 1250, 620);
        expect(L.specials).toHaveLength(6);
        const pile = L.specials.filter((x) => x.pile);
        expect(pile).toHaveLength(3);
        // Drawn oldest first; the pile spreads so every copy shows an edge.
        expect(L.specials.at(-1)!.copy.id).toBe(specials(1)[0].id);
        const xs = new Set(pile.map((x) => Math.round(x.x)));
        expect(xs.size).toBe(3);
    });

    it("thins the weekly sheets so years of them still fit on the table", () => {
        const L = tableLayout(tablePiles({ ...empty, weekly: weeks(at(2026, 9, 19), 200) }), 1250, 620);
        expect(L.weekly!.y + L.weekly!.coverH + L.weekly!.edgesH).toBeLessThanOrEqual(620);
    });

    it("ties older monthly years when they fit and folds them into blocks when they do not", () => {
        const few = tableLayout(tablePiles({ ...empty, monthly: months(2026, 1, 6) }), 1250, 620);
        expect(few.monthly!.rows.every((r) => r.type === "spine")).toBe(true);
        expect(few.monthly!.ties.map((t) => t.bundle.key)).toEqual(["monthly-2025"]);

        const many = tableLayout(tablePiles({ ...empty, monthly: months(2026, 1, 40) }), 1250, 620);
        const blocks = many.monthly!.rows.filter((r) => r.type === "block");
        // Oldest years fold first, so the latest year keeps its readable spines.
        expect(blocks.map((b) => b.type === "block" && b.bundle.key)).toEqual([
            "monthly-2024",
            "monthly-2023",
            "monthly-2022",
        ]);
        expect(many.monthly!.ties.map((t) => t.bundle.key)).toEqual(["monthly-2025"]);
        const last = many.monthly!.rows.at(-1)!;
        expect(many.monthly!.y + many.monthly!.coverH + last.top + last.h).toBeLessThanOrEqual(620);
    });
});

describe("spreadLayout", () => {
    it("deals one month out in a loose row and a year out in month columns", () => {
        const p = tablePiles({ ...empty, weekly: weeks(at(2026, 1, 9), 12) });
        const row = spreadLayout(p.weekly[1], 1250, 620);
        expect(row.labels).toHaveLength(0);
        const ys = row.items.map((i) => i.y);
        expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(row.ih * 0.2);

        const cols = spreadLayout(p.weekly[2], 1250, 620);
        expect(cols.labels.map((l) => l.count)).toEqual([5, 1]);
    });

    it("scales the title and slips with the table", () => {
        const p = tablePiles({ ...empty, weekly: weeks(at(2026, 1, 9), 12) });
        const small = spreadLayout(p.weekly[2], 1130, 600);
        const big = spreadLayout(p.weekly[2], 2190, 1110);
        expect(big.titleFont).toBeGreaterThan(small.titleFont * 1.5);
        expect(big.labels[0].h).toBeGreaterThan(small.labels[0].h * 1.5);
        expect(big.labels[0].font).toBeGreaterThan(small.labels[0].font * 1.5);
    });

    it("keeps every copy of a long year inside the table", () => {
        const p = tablePiles({ ...empty, weekly: weeks(at(2026, 0, 5), 60) });
        const year = p.weekly.find((b) => b.key === "weekly-2025")!;
        const L = spreadLayout(year, 1250, 620);
        expect(L.items).toHaveLength(year.copies.length);
        const w = (L.ih * 240) / 176;
        for (const i of L.items) {
            expect(i.x).toBeGreaterThanOrEqual(0);
            expect(i.x + w).toBeLessThanOrEqual(1250);
            expect(i.y + L.ih).toBeLessThanOrEqual(620 + 1);
        }
    });

    it("deals a year of monthlies in a row of covers", () => {
        const p = tablePiles({ ...empty, monthly: months(2026, 1, 14) });
        const L = spreadLayout(p.monthlyYears[0], 1250, 620);
        expect(L.items).toHaveLength(12);
        expect(L.labels).toHaveLength(0);
    });
});

describe("table text", () => {
    it("names month slips by short month and year bundles by year, with a count", () => {
        const p = tablePiles({ ...empty, weekly: weeks(at(2026, 1, 9), 12) });
        expect(slipText(p.weekly[0], fmt)).toBe('dispatch.mini.pair{"first":"Feb","second":2}');
        expect(slipText(p.weekly[2], fmt)).toBe('dispatch.mini.pair{"first":"2025","second":6}');
        expect(bundleName(p.weekly[0], fmt)).toBe('dispatch.table.weeklies{"label":"Feb 2026"}');
        expect(bundleAria(p.weekly[2], fmt)).toContain("dispatch.shelf.pile#6");
    });

    it("marks a spine with its number, Proof, or its match count", () => {
        const [m] = months(2026, 1, 1);
        expect(spineText(m, fmt)).toEqual({ name: "FEBRUARY 2026", no: 'DISPATCH.SHELF.NUMBER{"NUMBER":1}' });
        expect(spineText({ ...m, state: "proof" }, fmt).no).toBe("DISPATCH.MINI.PROOF");
        expect(spineText({ ...m, state: "too_few" }, fmt).no).toBe("DISPATCH.SHELF.MATCHES#9");
    });
});
