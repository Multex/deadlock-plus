export type SegmentId = "sealed" | "tear" | "cover" | "peak" | "climb" | "record" | "heroes" | "certificate" | "end";

export interface Segment {
    id: SegmentId;
    /** In bars from the start of the video. */
    start: number;
    bars: number;
}

/** Story order with each segment's bars at the postgame track's 17 bars, and the fewest it can play in. */
const STORY: { id: SegmentId; bars: number; min: number }[] = [
    { id: "sealed", bars: 2, min: 1 },
    { id: "tear", bars: 1, min: 1 },
    { id: "cover", bars: 2, min: 1 },
    { id: "peak", bars: 2, min: 1 },
    { id: "climb", bars: 4, min: 3 },
    { id: "record", bars: 2, min: 1 },
    { id: "heroes", bars: 2, min: 1 },
    { id: "certificate", bars: 1, min: 1 },
    { id: "end", bars: 1, min: 1 },
];

export const BASE_BARS = STORY.reduce((n, s) => n + s.bars, 0);

/** A longer track's spare bars go round this list; a short one takes bars back in the other. */
const GROW: SegmentId[] = ["climb", "end", "heroes", "peak", "cover", "record", "certificate", "sealed"];
const SHRINK: SegmentId[] = ["sealed", "cover", "record", "heroes", "peak", "end", "climb"];

export function collectorsPlan(bars: number, has: { chart: boolean; heroes: boolean }): Segment[] {
    const kept = STORY.filter((s) => (s.id !== "climb" || has.chart) && (s.id !== "heroes" || has.heroes));
    const size = new Map(kept.map((s) => [s.id, s.bars]));
    let total = kept.reduce((n, s) => n + s.bars, 0);
    const grow = GROW.filter((id) => size.has(id));
    for (let i = 0; total < bars; i++, total++) {
        const id = grow[i % grow.length];
        size.set(id, size.get(id)! + 1);
    }
    for (let pass = true; total > bars && pass;) {
        pass = false;
        for (const id of SHRINK) {
            const s = kept.find((x) => x.id === id);
            if (!s || total <= bars || size.get(id)! <= s.min) continue;
            size.set(id, size.get(id)! - 1);
            total--;
            pass = true;
        }
    }
    let start = 0;
    return kept.map((s) => {
        const segment = { id: s.id, start, bars: size.get(s.id)! };
        start += segment.bars;
        return segment;
    });
}

/** The segment playing at `bar`, and how many bars into it; past either end it holds the first or last. */
export function segmentAt(plan: Segment[], bar: number): { segment: Segment; local: number } {
    const segment = plan.find((s) => bar < s.start + s.bars) ?? plan[plan.length - 1];
    return { segment, local: Math.max(0, bar - segment.start) };
}

/** Bars into the climb segment: the line draws from `from` to `to` and reaches the peak on the bar line `peak`. */
export interface ClimbTiming {
    from: number;
    peak: number;
    to: number;
}

/** The headline gets the first half bar and the finished chart the last. */
export function climbTiming(bars: number, peakIndex: number, total: number): ClimbTiming {
    const from = 0.5;
    const to = bars - 0.5;
    const share = total > 0 ? (peakIndex + 1) / total : 1;
    const peak = Math.min(Math.floor(to), Math.max(Math.ceil(from), Math.round(from + (to - from) * share)));
    return { from, peak, to };
}

/** Matches drawn so far, as a fraction: whole at the peak's bar line, so the star lands on it. */
export function drawnMatches(bar: number, c: ClimbTiming, peakIndex: number, total: number): number {
    const atPeak = peakIndex + 1;
    if (bar <= c.from) return 0;
    if (bar < c.peak) return (atPeak * (bar - c.from)) / (c.peak - c.from);
    if (bar >= c.to || c.to <= c.peak) return total;
    return atPeak + ((total - atPeak) * (bar - c.peak)) / (c.to - c.peak);
}

export const clamp01 = (p: number) => Math.min(1, Math.max(0, p));
export const outCubic = (p: number) => 1 - (1 - clamp01(p)) ** 3;
export const inOutCubic = (p: number) => {
    const x = clamp01(p);
    return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
};

export function outBack(p: number): number {
    const x = clamp01(p);
    const c = 1.9;
    return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
}

/** A count-up's shown value at progress `p`: fast at first, easing onto the exact value. */
export function countUp(value: number, p: number): number {
    return Math.round(value * outCubic(p));
}

/** How long, in beats, a stamp falls before it hits. */
const STAMP_LEAD = 0.25;
const STAMP_FROM = 2.4;
const STAMP_SQUASH = 0.06;

/** A stamp `beats` from its hit: it falls from big to its own size and lands on the hit, then squashes once. */
export function stamp(beats: number): { scale: number; alpha: number } {
    if (beats < -STAMP_LEAD) return { scale: 0, alpha: 0 };
    if (beats < 0) {
        const p = (beats + STAMP_LEAD) / STAMP_LEAD;
        return { scale: STAMP_FROM - (STAMP_FROM - 1) * p * p, alpha: Math.min(1, p * 1.6) };
    }
    if (beats < 0.5) return { scale: 1 - STAMP_SQUASH * Math.sin((Math.PI * beats) / 0.5), alpha: 1 };
    return { scale: 1, alpha: 1 };
}

const PUNCH_FROM = 1.3;
const PUNCH_BEATS = 0.4;

/** A punch `beats` after its hit: already there and big on the hit frame, settling within the beat. */
export function punch(beats: number): { scale: number; alpha: number } {
    if (beats < 0) return { scale: 0, alpha: 0 };
    return { scale: 1 + (PUNCH_FROM - 1) * (1 - outCubic(beats / PUNCH_BEATS)), alpha: 1 };
}

const SLIDE_BEATS = 0.5;

/** How far off its place a slide is, 1 to 0, `beats` from the beat it lands on. */
export function slideIn(beats: number): number {
    return 1 - outCubic((beats + SLIDE_BEATS) / SLIDE_BEATS);
}

/** How long a fleck flies, at most. */
export const BURST_LIFE_MS = 1100;
/** The rip crosses the bag in this long (`tear.ts`: 64% of its 900 ms track). */
const RIP_MS = 576;
const BAG_W = 780;
const TEAR_Y = 72;
const GRAVITY = 700;
const FLECKS = 72;

export interface BurstFleck {
    x0: number;
    x: number;
    y: number;
    rotate: number;
    w: number;
    h: number;
    alpha: number;
    /** 0 is clear film; above 0.6 the fleck catches the foil's rainbow at that hue. */
    tint: number;
}

const BURST = (() => {
    let a = 0x9e3779b9;
    const rnd = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), a | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return Array.from({ length: FLECKS }, () => {
        const x0 = rnd() * BAG_W;
        return {
            x0,
            delay: (x0 / BAG_W) * RIP_MS,
            life: BURST_LIFE_MS * (0.65 + 0.35 * rnd()),
            vx: -40 + rnd() * 220,
            vy: -(150 + rnd() * 380),
            spin: (rnd() - 0.5) * 900,
            w: 4 + rnd() * 8,
            h: 2 + rnd() * 3,
            tint: rnd(),
        };
    });
})();

/** Plastic chips thrown off the tear line, `ms` after the rip starts at the bag's left edge. */
export function burstAt(ms: number): BurstFleck[] {
    return BURST.map((f) => {
        const s = (ms - f.delay) / 1000;
        const alive = s >= 0 && s * 1000 < f.life;
        const life = alive ? (s * 1000) / f.life : 1;
        return {
            x0: f.x0,
            x: f.x0 + f.vx * Math.max(0, s),
            y: TEAR_Y + f.vy * Math.max(0, s) + 0.5 * GRAVITY * Math.max(0, s) ** 2,
            rotate: f.spin * Math.max(0, s),
            w: f.w,
            h: f.h,
            alpha: alive ? 1 - life * life : 0,
            tint: f.tint,
        };
    });
}
