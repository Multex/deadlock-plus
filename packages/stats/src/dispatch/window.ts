import { KNOWN_SEASONS, seasonAt } from "./seasons";
import type { DispatchIndex, EditionKind, EditionWindow, RankedSeason } from "./types";

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

type CalendarKind = Exclude<EditionKind, "collectors">;

function yearEnd(y: number, tz: string): EditionWindow {
    return {
        kind: "year_end",
        id: `year_end-${y}`,
        startS: startOfDay(civil(y, 1, 1), tz),
        endS: startOfDay(civil(y, 12, 1), tz),
        tz,
    };
}

/** The local year whose Year-End window most recently closed at `nowS`. */
function closedYear(nowS: number, tz: string): number {
    const y = civilDate(nowS, tz).y;
    return nowS >= yearEnd(y, tz).endS ? y : y - 1;
}

function windowOf(kind: CalendarKind, at: CivilDate, tz: string): EditionWindow {
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
    if (kind === "year_end") return yearEnd(at.y, tz);
    return {
        kind,
        id: `monthly-${at.y}-${pad(at.m)}`,
        startS: startOfDay(civil(at.y, at.m, 1), tz),
        endS: startOfDay(civil(at.y, at.m + 1, 1), tz),
        tz,
    };
}

/** A Collector's Copy window: the season's own UTC span; `tz` is only for display. */
export function collectorsWindow(season: RankedSeason, tz: string): EditionWindow {
    return { kind: "collectors", id: `collectors-${season.id}`, startS: season.startS, endS: season.endS, tz };
}

/**
 * The window of `kind` that contains `atS`, in local time of `tz`. `year_end` gives the window of `atS`'s local
 * year even in December, after it closed. `collectors` gives the season running at `atS`, or null between seasons.
 */
export function windowFor(kind: CalendarKind, atS: number, tz: string): EditionWindow;
export function windowFor(
    kind: EditionKind,
    atS: number,
    tz: string,
    seasons?: readonly RankedSeason[],
): EditionWindow | null;
export function windowFor(
    kind: EditionKind,
    atS: number,
    tz: string,
    seasons: readonly RankedSeason[] = KNOWN_SEASONS,
): EditionWindow | null {
    if (kind === "collectors") {
        const season = seasonAt(seasons, atS);
        return season ? collectorsWindow(season, tz) : null;
    }
    return windowOf(kind, civilDate(atS, tz), tz);
}

/** The newest window of `kind` that has fully closed at `nowS`; for `collectors`, null until a season has ended. */
export function closedWindowBefore(kind: CalendarKind, nowS: number, tz: string): EditionWindow;
export function closedWindowBefore(
    kind: EditionKind,
    nowS: number,
    tz: string,
    seasons?: readonly RankedSeason[],
): EditionWindow | null;
export function closedWindowBefore(
    kind: EditionKind,
    nowS: number,
    tz: string,
    seasons: readonly RankedSeason[] = KNOWN_SEASONS,
): EditionWindow | null {
    if (kind === "collectors") {
        const ended = seasons.filter((s) => s.endS <= nowS).sort((a, b) => b.endS - a.endS);
        return ended.length > 0 ? collectorsWindow(ended[0], tz) : null;
    }
    if (kind === "year_end") return yearEnd(closedYear(nowS, tz), tz);
    return windowFor(kind, windowFor(kind, nowS, tz).startS - 1, tz);
}

/** "This week so far": the weekly window that contains `nowS`. */
export function soFarWindow(nowS: number, tz: string): EditionWindow {
    return windowFor("weekly", nowS, tz);
}

/** Closed windows of `kind`, newest first, back to the one that contains `earliestS`. */
export function pastWindows(
    kind: EditionKind,
    nowS: number,
    tz: string,
    earliestS: number,
    seasons: readonly RankedSeason[] = KNOWN_SEASONS,
): EditionWindow[] {
    if (kind === "collectors") {
        return seasons
            .filter((s) => s.endS <= nowS && s.endS > earliestS)
            .sort((a, b) => b.startS - a.startS)
            .map((s) => collectorsWindow(s, tz));
    }
    const out: EditionWindow[] = [];
    if (kind === "year_end") {
        for (let y = closedYear(nowS, tz); yearEnd(y, tz).endS > earliestS; y--) out.push(yearEnd(y, tz));
        return out;
    }
    let w = windowFor(kind, nowS, tz);
    while (w.startS > earliestS) {
        w = windowFor(kind, w.startS - 1, tz);
        out.push(w);
    }
    return out;
}

/**
 * The newest closed window of `kind` when it is neither issued nor skipped yet; older ones are only printed on
 * request. A Year-End Special is only due during the December it closes in, so a year never arrives months late.
 */
export function dueWindow(
    kind: EditionKind,
    nowS: number,
    tz: string,
    index: DispatchIndex,
    seasons: readonly RankedSeason[] = KNOWN_SEASONS,
): EditionWindow | null {
    const w = closedWindowBefore(kind, nowS, tz, seasons);
    if (!w) return null;
    if (kind === "year_end" && w.id !== windowFor(kind, nowS, tz).id) return null;
    if (index.issued.some((e) => e.id === w.id) || index.skipped.includes(w.id)) return null;
    return w;
}
