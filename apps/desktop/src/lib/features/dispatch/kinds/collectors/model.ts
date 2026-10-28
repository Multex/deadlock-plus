import { badgeParts } from "@deadlock-plus/stats/rank";
import type { EditionHero, EditionRank, RankPoint } from "@deadlock-plus/stats/dispatch/types";

const SUBRANKS = 6;

/** A stable copy number per account and season: FNV-1a, so it never changes between opens. */
export function serialOf(accountId: number, season: string): string {
    let h = 2166136261;
    for (const ch of `${accountId}:${season}`) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return String((h % 999_000) + 1000).padStart(6, "0");
}

/** Decorative bar widths drawn from the serial's digits; not a real barcode symbology. */
export function barsOf(serial: string): number[] {
    const out = [3, 1, 1, 1];
    for (const ch of serial + [...serial].reverse().join("")) {
        const n = Number(ch);
        out.push(1 + (n % 3), 1 + ((n * 7) % 2), 1 + ((n + 1) % 4), 1);
    }
    out.push(1, 1, 3);
    return out;
}

/** A badge as one continuous index, six subranks a tier. */
export function rankStep(badge: number): number {
    const p = badgeParts(badge);
    return p ? p.tier * SUBRANKS + (p.sub - 1) : 0;
}

/** Subranks gained (or lost) from the season's first ranked match to its last. */
export function climbSteps(rank: EditionRank | null): number | null {
    return rank ? rankStep(rank.endBadge) - rankStep(rank.startBadge) : null;
}

/** `season_1` → `S1`, for the barcode line. */
export function seasonCode(id: string | undefined): string | null {
    const n = id?.match(/(\d+)\s*$/)?.[1];
    return n ? `S${Number(n)}` : null;
}

export function peakOf(series: RankPoint[] | undefined): { index: number; startS: number; badge: number } | null {
    if (!series?.length) return null;
    let index = 0;
    for (let i = 1; i < series.length; i++) if (series[i].badge > series[index].badge) index = i;
    return { index, startS: series[index].startS, badge: series[index].badge };
}

export interface ChartRow {
    y: number;
    label: string;
    tier: number;
    /** The first subrank of a tier: drawn as a gold rule with the tier's badge. */
    major: boolean;
    labelled: boolean;
}

export interface ChartMonth {
    x: number;
    textX: number;
    anchor: "start" | "end";
    label: string;
}

export interface ChartDot {
    x: number;
    y: number;
}

export interface ClimbChart {
    width: number;
    height: number;
    pad: { l: number; r: number; t: number; b: number };
    line: string;
    area: string;
    /** Lowest subrank first. */
    rows: ChartRow[];
    months: ChartMonth[];
    start: ChartDot;
    end: ChartDot;
    peak: ChartDot & { index: number };
    ups: number;
    downs: number;
}

export interface ChartOptions {
    width: number;
    height: number;
    month: (unixS: number) => string;
    /** `null` for a tier the API does not name. */
    tierName: (tier: number) => string | null;
}

const PAD = { l: 118, r: 22, t: 26, b: 34 };
/** Closest two row labels may sit before only the tier rules keep theirs. */
const ROW_MIN_PX = 15;
const MONTH_CHAR_PX = 11;

/** The season's ranked matches as a stepped line, one row a subrank. */
export function climbChart(
    series: RankPoint[] | undefined,
    startS: number,
    endS: number,
    o: ChartOptions,
): ClimbChart | null {
    if (!series || series.length < 2 || endS <= startS) return null;
    const { width: w, height: h } = o;
    const steps = series.map((p) => rankStep(p.badge));
    const named = (s: number) => o.tierName(Math.floor(s / SUBRANKS)) !== null;
    const top = Math.max(...steps);
    const lo = named(Math.min(...steps) - 1) ? Math.min(...steps) - 1 : Math.min(...steps);
    const hi = named(top + 1) ? top + 1 : top;
    const span = Math.max(1, hi - lo);
    const x = (t: number) => PAD.l + ((t - startS) / (endS - startS)) * (w - PAD.l - PAD.r);
    const y = (s: number) => PAD.t + (1 - (s - lo) / span) * (h - PAD.t - PAD.b);
    const f = (n: number) => n.toFixed(1);

    let line = `M${f(x(startS))} ${f(y(steps[0]))}`;
    let ups = 0;
    let downs = 0;
    series.forEach((p, i) => {
        line += ` H${f(x(p.startS))}`;
        const prev = i === 0 ? steps[0] : steps[i - 1];
        if (steps[i] !== prev) line += ` V${f(y(steps[i]))}`;
        if (steps[i] > prev) ups++;
        else if (steps[i] < prev) downs++;
    });
    const area = `${line} V${f(h - PAD.b)} H${f(x(startS))} Z`;

    const crowded = (h - PAD.t - PAD.b) / span < ROW_MIN_PX;
    const rows: ChartRow[] = [];
    for (let s = lo; s <= hi; s++) {
        const tier = Math.floor(s / SUBRANKS);
        const sub = (s % SUBRANKS) + 1;
        const major = sub === 1;
        rows.push({ y: y(s), label: `${o.tierName(tier) ?? tier} ${sub}`, tier, major, labelled: major || !crowded });
    }

    const months: ChartMonth[] = [];
    const first = new Date(startS * 1000);
    for (let m = 1; ; m++) {
        const s = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + m, 1) / 1000;
        if (s >= endS) break;
        const mx = x(s);
        const label = o.month(s);
        const flip = mx + 6 + label.length * MONTH_CHAR_PX > w - PAD.r;
        months.push({ x: mx, textX: flip ? mx - 6 : mx + 6, anchor: flip ? "end" : "start", label });
    }

    const pi = steps.indexOf(top);
    return {
        width: w,
        height: h,
        pad: PAD,
        line,
        area,
        rows,
        months,
        start: { x: x(startS), y: y(steps[0]) },
        end: { x: x(series.at(-1)!.startS), y: y(steps.at(-1)!) },
        peak: { x: x(series[pi].startS), y: y(top), index: pi },
        ups,
        downs,
    };
}

const CALLOUT_MIN_W = 150;
const CALLOUT_CHAR_PX = 9;
const CALLOUT_H = 36;

/** The "Peak" label: above and left of the star, inside the plot, and below the star when the star is at the top. */
export function calloutBox(
    peak: ChartDot,
    label: string,
    bounds: { left: number; right: number; top: number },
): { x: number; y: number; width: number } {
    const width = Math.max(CALLOUT_MIN_W, label.length * CALLOUT_CHAR_PX + 20);
    const x = Math.max(bounds.left, Math.min(peak.x - 70, bounds.right - width));
    const above = peak.y - 62;
    const y = above < bounds.top - 20 ? peak.y + CALLOUT_H - 10 : above;
    return { x, y, width };
}

/** Circumference of the medal's text ring (r 196) over the width one character takes at its type size. */
const ARC_LENGTH = 2 * Math.PI * 196;
const ARC_CHAR_PX = 12.5;

/** How many times the ring's line fits round the medal; the text is then spaced to close the circle. */
export function arcRepeats(chars: number): number {
    return Math.max(1, Math.floor(ARC_LENGTH / (Math.max(1, chars) * ARC_CHAR_PX)));
}

export const ARC_TEXT_LENGTH = ARC_LENGTH;

export function topHeroes(heroes: readonly EditionHero[], n = 3): EditionHero[] {
    return [...heroes]
        .sort((a, b) => b.games - a.games || b.playtimeS - a.playtimeS || a.heroId - b.heroId)
        .slice(0, n);
}
