export type SectionId = "numbers" | "heroes" | "months" | "highlights" | "people";

export interface Span {
    bar: number;
    bars: number;
}

export interface YearEndPlan {
    intro: { mast: Span; digits: Span; title: Span; name: Span; riser: Span };
    /** The bar the flash, the burst and the unfold land on. */
    drop: number;
    sections: (Span & { id: SectionId })[];
    end: Span;
}

const SECTION_BARS: Record<SectionId, number> = { numbers: 2, heroes: 2, months: 1, highlights: 1, people: 1 };
const SECTION_ORDER: SectionId[] = ["numbers", "heroes", "months", "highlights", "people"];
/** Who gets a missing section's bars first: the sections that hold the most to read. */
const EXTRA_ORDER: SectionId[] = ["heroes", "numbers", "highlights", "people", "months"];
/** The unfold bar, every section at its full share, and the end card. */
const AFTER_DROP = 1 + Object.values(SECTION_BARS).reduce((a, b) => a + b, 0) + 1;

/**
 * Bars before the drop. The menu track builds for 11 bars, which this fills exactly; shorter intros (tracks that
 * open on a hit) give the year two digits a bar and fold the title into the name's bar first.
 */
export function introBars(n: number): Record<keyof YearEndPlan["intro"], number> {
    const riser = n >= 6 ? 1 : 0;
    const digits = n >= 10 ? 4 : n >= 6 ? 2 : 1;
    const name = n >= 7 ? 2 : 1;
    const title = n >= 8 ? 2 : n >= 5 ? 1 : 0;
    return { mast: Math.max(0, n - riser - digits - name - title), digits, title, name, riser };
}

/** Lays the edition out on the bar grid: the build, the drop on its own bar, the sections, then the end card. */
export function yearEndPlan(bars: number, present: readonly SectionId[]): YearEndPlan {
    const drop = Math.max(0, bars - AFTER_DROP);
    const counts = introBars(drop);
    let bar = 0;
    const span = (n: number): Span => {
        const s = { bar, bars: n };
        bar += n;
        return s;
    };
    const intro = {
        mast: span(counts.mast),
        digits: span(counts.digits),
        title: span(counts.title),
        name: span(counts.name),
        riser: span(counts.riser),
    };

    const shown = SECTION_ORDER.filter((id) => present.includes(id));
    const share = new Map(shown.map((id) => [id, SECTION_BARS[id]]));
    let spare = AFTER_DROP - 2 - shown.reduce((sum, id) => sum + SECTION_BARS[id], 0);
    for (const id of EXTRA_ORDER) {
        if (spare === 0) break;
        if (!share.has(id)) continue;
        share.set(id, share.get(id)! + 1);
        spare--;
    }

    bar = drop + 1;
    const sections = shown.map((id) => ({ id, ...span(share.get(id)!) }));
    return { intro, drop, sections, end: span(bars - bar) };
}

export function sectionAt(plan: YearEndPlan, t: number, barSeconds: number): { id: SectionId; local: number } | null {
    const bar = t / barSeconds;
    const s = plan.sections.find((s) => bar >= s.bar && bar < s.bar + s.bars);
    return s ? { id: s.id, local: bar - s.bar } : null;
}

/** When each digit of the year locks, in seconds: spread evenly over the digits' bars, the first on its downbeat. */
export function digitLocks(plan: YearEndPlan, digits: number, barSeconds: number): number[] {
    const { bar, bars } = plan.intro.digits;
    return Array.from({ length: digits }, (_, i) => (bar + (bars * i) / digits) * barSeconds);
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeOutCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3;
export const easeInOut = (x: number) => {
    const k = clamp01(x);
    return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
};
/** Overshoots by about 10% before it settles: the "slam". */
export const easeOutBack = (x: number) => {
    const k = clamp01(x) - 1;
    const c = 1.70158;
    return 1 + (c + 1) * k ** 3 + c * k ** 2;
};

/**
 * A number counting up from zero between `start` and `end` seconds, racing first and settling last. Whole steps of
 * `1 / steps`, so a share counts in whole percent with `steps = 100`.
 */
export function countUp(value: number, t: number, start: number, end: number, steps = 1): number {
    if (t >= end) return value;
    if (t <= start) return 0;
    return Math.round(value * easeOutCubic((t - start) / (end - start)) * steps) / steps;
}

/** A slot-machine digit: `rate` digits a second from `seed`, and how far the next one has rolled in. */
export function rollingDigit(seed: number, t: number, rate: number): { digit: number; next: number; frac: number } {
    const p = seed + t * rate;
    const whole = Math.floor(p + 1e-9);
    const digit = ((whole % 10) + 10) % 10;
    return { digit, next: (digit + 1) % 10, frac: Math.max(0, p - whole) };
}

const STEPS = 3;
const STEP_RISE = 0.6;

/** A bar's height, 0 to 1: a third more on each of three beats from `start`, each step slamming a little past. */
export function growth(t: number, start: number, beat: number): number {
    if (t < start) return 0;
    const beats = (t - start) / beat;
    if (beats >= STEPS) return 1;
    const step = Math.floor(beats);
    return (step + easeOutBack((beats - step) / STEP_RISE)) / STEPS;
}

const FLASH_RAMP = 0.06;
const FLASH_DECAY = 0.17;

/** A flashbulb: a short ramp up to white on the hit, then an exponential fade. */
export function flashAt(t: number, at: number): number {
    const since = t - at;
    if (since < -FLASH_RAMP) return 0;
    if (since < 0) return (since + FLASH_RAMP) / FLASH_RAMP;
    const v = Math.exp(-since / FLASH_DECAY);
    return v < 0.04 ? 0 : v;
}

/** Seconds since the last of `every`-second ticks from `from`; Infinity before the first. */
export function sinceTick(t: number, from: number, every: number): number {
    if (t < from) return Infinity;
    return (t - from) % every;
}

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * The content square, sized from the shorter side so every aspect is designed rather than cropped. In 9:16 it sits
 * above centre, and `safe` is the band key text keeps to: short-video apps lay their captions and buttons over the
 * lower part and their tabs over the top.
 */
export function sceneFrame(w: number, h: number): { u: number; box: Rect; safe: { top: number; bottom: number } } {
    const s = Math.min(w, h);
    const tall = h > w;
    const cy = tall ? h * 0.42 : h / 2;
    const y = Math.round(Math.min(h - s, Math.max(0, cy - s / 2)));
    return {
        u: s / 1080,
        box: { x: Math.round((w - s) / 2), y, w: s, h: s },
        safe: tall ? { top: Math.round(h * 0.125), bottom: Math.round(h * 0.7084) } : { top: 0, bottom: h },
    };
}
