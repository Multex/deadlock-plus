import type { DispatchIndex, EditionKind, EditionWindow } from "./types";

interface CivilDate {
    y: number;
    m: number;
    d: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
    let f = formatters.get(tz);
    if (!f) {
        f = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
            hourCycle: "h23",
        });
        formatters.set(tz, f);
    }
    return f;
}

/** The wall clock in `tz` at `atS`, read as if it were UTC. */
function wallClockS(atS: number, tz: string): number {
    const p: Record<string, string> = {};
    for (const part of formatter(tz).formatToParts(new Date(atS * 1000))) p[part.type] = part.value;
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) / 1000;
}

function offsetS(atS: number, tz: string): number {
    return wallClockS(Math.floor(atS), tz) - Math.floor(atS);
}

function civilDate(atS: number, tz: string): CivilDate {
    const d = new Date(wallClockS(atS, tz) * 1000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

/** Normalises overflowing months and days (`d: 32`, `m: 13`) through `Date.UTC`. */
function civil(y: number, m: number, d: number): CivilDate {
    const t = new Date(Date.UTC(y, m - 1, d));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** First instant of local day `c` in `tz`. */
function startOfDay(c: CivilDate, tz: string): number {
    const wall = Date.UTC(c.y, c.m - 1, c.d) / 1000;
    const before = wall - offsetS(wall - 2 * 86_400, tz);
    const after = wall - offsetS(wall + 2 * 86_400, tz);
    if (before === after) return before;
    const a = wall - offsetS(before, tz) === before ? before : null;
    const b = wall - offsetS(after, tz) === after ? after : null;
    if (a !== null && b !== null) return Math.min(a, b);
    if (a !== null) return a;
    if (b !== null) return b;
    // Midnight falls in a DST gap: the day starts when the clocks jump, which is the later reading.
    return Math.max(before, after);
}

const pad = (n: number) => String(n).padStart(2, "0");

function windowOf(kind: EditionKind, at: CivilDate, tz: string): EditionWindow {
    if (kind === "weekly") {
        const sinceMonday = (new Date(Date.UTC(at.y, at.m - 1, at.d)).getUTCDay() + 6) % 7;
        const monday = civil(at.y, at.m, at.d - sinceMonday);
        return {
            kind,
            id: `weekly-${monday.y}-${pad(monday.m)}-${pad(monday.d)}`,
            startS: startOfDay(monday, tz),
            endS: startOfDay(civil(monday.y, monday.m, monday.d + 7), tz),
            tz,
        };
    }
    return {
        kind,
        id: `monthly-${at.y}-${pad(at.m)}`,
        startS: startOfDay(civil(at.y, at.m, 1), tz),
        endS: startOfDay(civil(at.y, at.m + 1, 1), tz),
        tz,
    };
}

/** The window of `kind` that contains `atS`, in local time of `tz`. */
export function windowFor(kind: EditionKind, atS: number, tz: string): EditionWindow {
    return windowOf(kind, civilDate(atS, tz), tz);
}

/** The newest window of `kind` that has fully closed at `nowS`. */
export function closedWindowBefore(kind: EditionKind, nowS: number, tz: string): EditionWindow {
    return windowFor(kind, windowFor(kind, nowS, tz).startS - 1, tz);
}

/** "This week so far": the weekly window that contains `nowS`. */
export function soFarWindow(nowS: number, tz: string): EditionWindow {
    return windowFor("weekly", nowS, tz);
}

/** Closed windows of `kind`, newest first, back to the one that contains `earliestS`. */
export function pastWindows(kind: EditionKind, nowS: number, tz: string, earliestS: number): EditionWindow[] {
    const out: EditionWindow[] = [];
    let w = windowFor(kind, nowS, tz);
    while (w.startS > earliestS) {
        w = windowFor(kind, w.startS - 1, tz);
        out.push(w);
    }
    return out;
}

/** The newest closed window of `kind` when it is neither issued nor skipped yet; older ones are only printed on request. */
export function dueWindow(kind: EditionKind, nowS: number, tz: string, index: DispatchIndex): EditionWindow | null {
    const w = closedWindowBefore(kind, nowS, tz);
    if (index.issued.some((e) => e.id === w.id) || index.skipped.includes(w.id)) return null;
    return w;
}
