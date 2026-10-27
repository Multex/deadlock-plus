import type { EditionKind, EditionWindow } from "@deadlock-plus/stats/dispatch/types";
import {
    MINI_SIZE,
    miniMonth,
    miniYear,
    shelfMini,
    soFarMini,
    type MiniCopy,
    type MiniFormat,
    type MiniKind,
} from "../kinds/minis";
import type { ShelfEntry } from "../service";

/** The scene is drawn on a 1250 x 620 table and stretched to the real one; sizes follow the tighter axis. */
export const TABLE_W = 1250;
export const TABLE_H = 620;

const WEEKLY_H = 170;
const SOFAR_H = 270;
const MONTHLY_H = 262;
/** Where each special lies, newest first: left and top in design units, tilt in degrees, drawn height. */
const SPECIAL_AT = [
    { x: 590, y: 168, rot: -2.5, h: 372 },
    { x: 762, y: 236, rot: 7, h: 330 },
    { x: 560, y: 52, rot: -7, h: 300 },
    { x: 800, y: 40, rot: 4, h: 280 },
];
const WEEKLY_AT = { x: 70, y: 44 };
const SOFAR_AT = { x: 352, y: 296, rot: 4.5 };
const MONTHLY_AT = { right: 74, y: 40 };
/** Design units kept clear under the lowest object. */
const FOOT = 40;

export const ratio = (k: MiniKind) => MINI_SIZE[k].w / MINI_SIZE[k].h;

/** A small, fixed wobble per index, so stacked sheets never line up like a chart. */
export const jitter = (i: number, amp: number) => Math.sin(i * 12.9898 + 4.1) * amp;

export interface TableCopies {
    soFar: MiniCopy | null;
    weekly: MiniCopy[];
    monthly: MiniCopy[];
    /** Year-End Specials and Collector's Copies together. */
    specials: MiniCopy[];
}

const newestFirst = (a: MiniCopy, b: MiniCopy) => b.window.endS - a.window.endS;

export function tableCopies(
    shelf: Record<EditionKind, readonly ShelfEntry[]>,
    soFar: { id: string; window: EditionWindow; matches: number } | null,
    newIds: readonly string[],
): TableCopies {
    const of = (kind: EditionKind) => shelf[kind].map((e) => shelfMini(kind, e, newIds)).sort(newestFirst);
    return {
        soFar: soFar ? soFarMini(soFar.id, soFar.window, soFar.matches) : null,
        weekly: of("weekly"),
        monthly: of("monthly"),
        specials: [...of("year_end"), ...of("collectors")].sort(newestFirst),
    };
}

/** A pile that deals out on the table: one month of weeklies, or a whole older year of weeklies or monthlies. */
export interface TableBundle {
    key: string;
    kind: "weekly" | "monthly";
    year: number;
    /** 0-11 for a month of weeklies; `null` for a year bundle. */
    month: number | null;
    copies: MiniCopy[];
}

export interface TablePiles {
    soFar: MiniCopy | null;
    topWeekly: MiniCopy | null;
    /** Newest first: this year's months, then one bundle per older year. */
    weekly: TableBundle[];
    topMonthly: MiniCopy | null;
    /** Every monthly under the cover, newest first, with the key of the year bundle it is tied into. */
    spines: { copy: MiniCopy; bundle: string | null }[];
    monthlyYears: TableBundle[];
    specials: MiniCopy[];
}

const topOf = (list: readonly MiniCopy[]) => list.find((c) => c.state === "issued") ?? list[0] ?? null;

function group(list: readonly MiniCopy[], of: (c: MiniCopy) => Omit<TableBundle, "copies">): TableBundle[] {
    const out: TableBundle[] = [];
    for (const c of list) {
        const head = of(c);
        const last = out.at(-1);
        if (last?.key === head.key) last.copies.push(c);
        else out.push({ ...head, copies: [c] });
    }
    return out;
}

export function tablePiles(c: TableCopies): TablePiles {
    const weekYear = c.weekly[0] ? miniYear(c.weekly[0].window) : 0;
    const weekly = group(c.weekly, (x) => {
        const year = miniYear(x.window);
        const month = year === weekYear ? miniMonth(x.window) : null;
        return { key: month === null ? `weekly-${year}` : `weekly-${year}-${month}`, kind: "weekly", year, month };
    });

    const topMonthly = topOf(c.monthly);
    const monthYear = topMonthly ? miniYear(topMonthly.window) : 0;
    const under = c.monthly.filter((x) => x.id !== topMonthly?.id);
    const monthlyYears = group(
        under.filter((x) => miniYear(x.window) !== monthYear),
        (x) => ({ key: `monthly-${miniYear(x.window)}`, kind: "monthly", year: miniYear(x.window), month: null }),
    );
    const spines = under.map((copy) => ({
        copy,
        bundle: miniYear(copy.window) === monthYear ? null : `monthly-${miniYear(copy.window)}`,
    }));

    return {
        soFar: c.soFar,
        topWeekly: topOf(c.weekly),
        weekly,
        topMonthly,
        spines,
        monthlyYears,
        specials: c.specials,
    };
}

export interface Placed {
    copy: MiniCopy;
    x: number;
    y: number;
    h: number;
    rot: number;
    z: number;
    /** Lies in the pile of older specials on the last spot. */
    pile: boolean;
}

export interface WeeklyBand {
    bundle: TableBundle;
    top: number;
    h: number;
    /** Slip on the left; year bundles always sit left, months alternate. */
    left: boolean;
    dx: number;
    sheets: { copy: MiniCopy; sx: number }[];
    slip: { top: number; h: number; font: number; tilt: number };
}

export type MonthlyRow =
    | { type: "spine"; copy: MiniCopy; top: number; h: number; font: number; dx: number; bundle: string | null }
    | { type: "block"; bundle: TableBundle; top: number; h: number; sheet: number };

export interface TableLayout {
    s: number;
    bottom: number;
    offset: number;
    weekly: {
        x: number;
        y: number;
        w: number;
        coverH: number;
        edgesH: number;
        sheet: number;
        bands: WeeklyBand[];
    } | null;
    soFar: Placed | null;
    /** Drawn oldest first, so the newest lies on top. */
    specials: Placed[];
    monthly: {
        x: number;
        y: number;
        w: number;
        coverH: number;
        rows: MonthlyRow[];
        /** Older years still shown as spines, tied with twine and tagged. */
        ties: { bundle: TableBundle; top: number; h: number }[];
        tag: { font: number; line: number };
    } | null;
}

export function tableLayout(p: TablePiles, w: number, h: number): TableLayout {
    const s = Math.min(w / TABLE_W, h / TABLE_H);
    const fx = w / TABLE_W;
    const fy = h / TABLE_H;
    /** Height the table has beyond what the width allows the objects: the stacks grow thicker into it. */
    const slack = Math.min(1.35, Math.max(1, fy / s));
    const foot = FOOT * fy;

    let weeklyPart: Omit<NonNullable<TableLayout["weekly"]>, "y"> | null = null;
    let weeklyLow = 0;
    if (p.topWeekly) {
        const coverH = WEEKLY_H * s;
        const sheets = p.weekly.reduce((n, b) => n + b.copies.length, 0) + Math.max(0, p.weekly.length - 1);
        const room = h - foot - WEEKLY_AT.y * fy - coverH;
        const sheet = Math.max(0.6, Math.min(Math.max(2.4, 3 * s * slack), sheets ? room / sheets : Infinity));
        const slipH = Math.max(17, 19 * s);
        let y = 0;
        const bands = p.weekly.map((bundle, i): WeeklyBand => {
            const top = y;
            const bh = bundle.copies.length * sheet;
            y += bh + sheet;
            return {
                bundle,
                top,
                h: bh,
                left: i % 2 === 0 || bundle.month === null,
                dx: jitter(i, 3),
                sheets: bundle.copies.map((copy, j) => ({ copy, sx: jitter(i * 7 + j, 2.2) })),
                slip: { top: bh / 2 - slipH / 2, h: slipH, font: Math.max(10.5, slipH * 0.55), tilt: jitter(i + 3, 2) },
            };
        });
        const edgesH = bands.length ? bands.at(-1)!.top + bands.at(-1)!.h : 0;
        weeklyPart = { x: WEEKLY_AT.x * fx, w: coverH * ratio("weekly"), coverH, edgesH, sheet, bands };
        weeklyLow = WEEKLY_AT.y * fy + coverH + edgesH;
    }

    let monthlyPart: Omit<NonNullable<TableLayout["monthly"]>, "y"> | null = null;
    let monthlyLow = 0;
    if (p.topMonthly) {
        const coverH = MONTHLY_H * s;
        const mw = coverH * ratio("monthly");
        const room = h - foot - MONTHLY_AT.y * fy - coverH;
        const sheet = Math.max(1.5, 3 * s * slack);
        let spineH = Math.max(14, 14 * s * slack);
        // Oldest years fold into tied blocks first, so the latest years keep readable spines.
        const folded = new Set<string>();
        const height = () =>
            p.spines.filter((x) => x.bundle === null || !folded.has(x.bundle)).length * spineH +
            p.monthlyYears.filter((b) => folded.has(b.key)).reduce((n, b) => n + b.copies.length * sheet, 0);
        for (let i = p.monthlyYears.length - 1; i >= 0 && height() > room; i--) folded.add(p.monthlyYears[i].key);
        const loose = p.spines.filter((x) => x.bundle === null || !folded.has(x.bundle)).length;
        if (height() > room && loose > 0) {
            const blocks = height() - loose * spineH;
            spineH = Math.max(6, (room - blocks) / loose);
        }

        const rows: MonthlyRow[] = [];
        const ties: { bundle: TableBundle; top: number; h: number }[] = [];
        let y = 0;
        p.spines.forEach(({ copy, bundle }, i) => {
            if (bundle !== null && folded.has(bundle)) {
                if (rows.at(-1)?.type === "block" && (rows.at(-1) as { bundle: TableBundle }).bundle.key === bundle)
                    return;
                const b = p.monthlyYears.find((x) => x.key === bundle)!;
                rows.push({ type: "block", bundle: b, top: y, h: b.copies.length * sheet, sheet });
                y += b.copies.length * sheet;
                return;
            }
            rows.push({
                type: "spine",
                copy,
                top: y,
                h: spineH,
                font: Math.max(10, spineH * 0.6),
                dx: jitter(i + 20, 3),
                bundle,
            });
            if (bundle !== null) {
                const tie = ties.find((t) => t.bundle.key === bundle);
                if (tie) tie.h += spineH;
                else ties.push({ bundle: p.monthlyYears.find((x) => x.key === bundle)!, top: y, h: spineH });
            }
            y += spineH;
        });
        monthlyPart = {
            x: w - MONTHLY_AT.right * fx - mw,
            w: mw,
            coverH,
            rows,
            ties,
            tag: { font: Math.max(11, spineH * 0.68), line: Math.max(24, spineH * 1.7) },
        };
        monthlyLow = MONTHLY_AT.y * fy + coverH + y;
    }

    // Past the fourth spot, older specials lie in one pile there, each nudged so its edge still shows.
    const PILE = SPECIAL_AT.length - 1;
    const pileN = Math.max(0, p.specials.length - PILE);
    const pileStep = pileN > 1 ? Math.min(9 * s, (48 * s) / (pileN - 1)) : 0;
    const spots = p.specials.map((copy, i) => {
        const slot = Math.min(i, PILE);
        const depth = i - slot;
        const at = SPECIAL_AT[slot];
        return {
            copy,
            x: at.x * fx - depth * pileStep,
            y: at.y * fy + depth * pileStep * 0.8,
            h: at.h * s,
            rot: at.rot - depth * 1.5,
            z: 10 - slot,
            pile: pileN > 1 && slot === PILE,
        };
    });

    const bottom = Math.max(
        p.soFar ? SOFAR_AT.y * fy + SOFAR_H * s : 0,
        ...spots.map((x) => x.y + x.h),
        weeklyLow,
        monthlyLow,
    );
    const offset = Math.max(0, (h - bottom - foot) / 2);

    return {
        s,
        bottom,
        offset,
        weekly: weeklyPart ? { ...weeklyPart, y: WEEKLY_AT.y * fy + offset } : null,
        soFar: p.soFar
            ? {
                  copy: p.soFar,
                  x: SOFAR_AT.x * fx,
                  y: SOFAR_AT.y * fy + offset,
                  h: SOFAR_H * s,
                  rot: SOFAR_AT.rot,
                  z: 3,
                  pile: false,
              }
            : null,
        specials: spots.map((x) => ({ ...x, y: x.y + offset })).reverse(),
        monthly: monthlyPart ? { ...monthlyPart, y: MONTHLY_AT.y * fy + offset } : null,
    };
}

export interface SpreadLayout {
    /** Scale of the spread's type and chrome. */
    u: number;
    head: number;
    titleFont: number;
    ih: number;
    kind: "weekly" | "monthly";
    items: { copy: MiniCopy; x: number; y: number; z: number; rot: number }[];
    labels: { window: EditionWindow; count: number; x: number; y: number; width: number; h: number; font: number }[];
}

/** How far each sheet in a column sits below the one before, as a share of its height. */
const STEP = 0.37;
/** How much of the next copy a loose row covers, as a share of its width. */
const OVER = 0.82;

/**
 * Deals a bundle out on the table: one month, or a year of monthlies, in a loose row; a year of weeklies in one
 * column per month, every sheet sliding down just far enough to show its masthead and dates. More than six
 * months wrap into a second row of columns.
 */
export function spreadLayout(b: TableBundle, w: number, h: number): SpreadLayout {
    const u = Math.max(1, Math.min(w / TABLE_W, h / TABLE_H));
    const head = 60 * u;
    const gap = 26 * u;
    const labelH = 22 * u;
    const labelBox = 30 * u;
    const side = 40 * u;
    const r = ratio(b.kind);
    const availW = w - 2 * side;
    const availH = h - head - 28 * u;
    const items: SpreadLayout["items"] = [];
    const labels: SpreadLayout["labels"] = [];
    const base = { u, head, titleFont: 22 * u, kind: b.kind, items, labels };

    if (b.kind === "monthly" || b.month !== null) {
        const n = b.copies.length;
        const ih = Math.min(availW / (1 + (n - 1) * OVER) / r, availH * 0.8, 260 * u);
        const iw = ih * r;
        const rowW = iw * (1 + (n - 1) * OVER);
        const y0 = head + (availH - ih) / 2;
        b.copies.forEach((copy, j) => {
            items.push({
                copy,
                x: (w - rowW) / 2 + j * iw * OVER,
                y: y0 + jitter(j + 9, 10 * u),
                z: j,
                rot: jitter(j + 40, 2.4),
            });
        });
        return { ...base, ih };
    }

    const months = group(b.copies, (c) => ({
        key: `${miniMonth(c.window)}`,
        kind: "weekly",
        year: b.year,
        month: miniMonth(c.window),
    }));
    const rows = months.length > 6 ? 2 : 1;
    const cols = Math.ceil(months.length / rows);
    const most = Math.max(...months.map((m) => m.copies.length));
    const rowH = (availH - (rows - 1) * gap) / rows;
    const wob = 5 * u;
    const ih = Math.min(
        (availW - (cols - 1) * gap - 2 * wob) / cols / r,
        (rowH - labelBox) / (1 + (most - 1) * STEP),
        230 * u,
    );
    const iw = ih * r;
    const gridW = cols * iw + (cols - 1) * gap;
    const colH = labelBox + ih * (1 + (most - 1) * STEP);
    const gridH = rows * colH + (rows - 1) * gap;
    const top = head + (availH - gridH) / 2;
    months.forEach((m, k) => {
        const x = (w - gridW) / 2 + (k % cols) * (iw + gap);
        const y0 = top + Math.floor(k / cols) * (colH + gap);
        labels.push({
            window: m.copies[0].window,
            count: m.copies.length,
            x,
            y: y0,
            width: iw,
            h: labelH,
            font: 12 * u,
        });
        m.copies.forEach((copy, j) => {
            items.push({
                copy,
                x: x + jitter(k * 5 + j, wob),
                y: y0 + labelBox + j * ih * STEP,
                z: j,
                rot: jitter(k * 5 + j + 40, 1.8),
            });
        });
    });
    return { ...base, ih };
}

const SHORT_MONTH: Intl.DateTimeFormatOptions = { month: "short" };
const MONTH_YEAR: Intl.DateTimeFormatOptions = { month: "short", year: "numeric" };

/** The slip between bundles in the weekly stack, or the tag on a tied year. */
export function slipText(b: TableBundle, fmt: MiniFormat): string {
    const w = b.copies[0].window;
    const count = b.copies.length;
    if (b.month === null) return fmt.t("dispatch.mini.pair", { first: String(b.year), second: count });
    const month = fmt.date(w.startS, w.tz, SHORT_MONTH);
    return count > 1 ? fmt.t("dispatch.mini.pair", { first: month, second: count }) : month;
}

/** The spread's title: "Weeklies, Nov 2026", "Monthlies, 2025". */
export function bundleName(b: TableBundle, fmt: MiniFormat): string {
    const w = b.copies[0].window;
    const label = b.month === null ? String(b.year) : fmt.date(w.startS, w.tz, MONTH_YEAR);
    return fmt.t(b.kind === "weekly" ? "dispatch.table.weeklies" : "dispatch.table.monthlies", { label });
}

export function bundleAria(b: TableBundle, fmt: MiniFormat): string {
    return fmt.tn("dispatch.shelf.pile", b.copies.length, { label: bundleName(b, fmt) });
}

/** A weekly band's name leads with its slip, so the words on the slip are the words that name it. */
export function bandAria(b: TableBundle, fmt: MiniFormat): string {
    return fmt.t("dispatch.shelf.band", { slip: slipText(b, fmt), label: bundleName(b, fmt) });
}

/** A column slip in the spread: "Dec 2025 · 5". */
export function columnText(window: EditionWindow, count: number, fmt: MiniFormat): string {
    return fmt.t("dispatch.mini.pair", { first: fmt.date(window.startS, window.tz, MONTH_YEAR), second: count });
}

export function spineText(c: MiniCopy, fmt: MiniFormat): { name: string; no: string } {
    const name = fmt.upper(fmt.date(c.window.startS, c.window.tz, { month: "long", year: "numeric" }));
    const no =
        c.state === "issued" && c.number !== null
            ? fmt.t("dispatch.shelf.number", { number: c.number })
            : c.state === "too_few"
              ? fmt.tn("dispatch.shelf.matches", c.matches)
              : fmt.t("dispatch.mini.proof");
    return { name, no: fmt.upper(no) };
}
