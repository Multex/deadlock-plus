import { entranceCues } from "../../kit/beat";

export type SectionId = "numbers" | "heroes" | "highlights" | "people";

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

/**
 * Bars each section holds, about 4-6 s on every track. The month strip has no section of its own: it splits the
 * match count the numbers already give.
 */
const SECTION_BARS: Record<SectionId, number> = { numbers: 4, heroes: 4, highlights: 4, people: 3 };
const SECTION_ORDER: SectionId[] = ["numbers", "heroes", "highlights", "people"];
/** Who gets a missing section's bars first: the sections that hold the most to read. */
const EXTRA_ORDER: SectionId[] = ["heroes", "numbers", "highlights", "people"];
/** A section never takes more than this from a missing one; the rest goes to the end card. */
const MOST_BARS = 6;
const END_BARS = 2;
/** The unfold bar, every section at its full share, and the end card. */
const AFTER_DROP = 1 + Object.values(SECTION_BARS).reduce((a, b) => a + b, 0) + END_BARS;

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
    let spare = AFTER_DROP - 1 - END_BARS - shown.reduce((sum, id) => sum + SECTION_BARS[id], 0);
    for (let given = true; spare > 0 && given;) {
        given = false;
        for (const id of EXTRA_ORDER) {
            if (spare === 0) break;
            if (!share.has(id) || share.get(id)! >= MOST_BARS) continue;
            share.set(id, share.get(id)! + 1);
            spare--;
            given = true;
        }
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

/** A slot-machine digit: `rate` digits a second from `seed`, and how far the next one has rolled in. */
export function rollingDigit(seed: number, t: number, rate: number): { digit: number; next: number; frac: number } {
    const p = seed + t * rate;
    const whole = Math.floor(p + 1e-9);
    const digit = ((whole % 10) + 10) % 10;
    return { digit, next: (digit + 1) % 10, frac: Math.max(0, p - whole) };
}

/** A count-up runs two beats: long enough to watch the digits climb. */
export const COUNT_BEATS = 2;
/** Entrances and their count-ups finish within 75% of a section, at most two beats apart; the rest holds the page. */
const PACE = { share: 0.75, countBeats: COUNT_BEATS, apartBeats: 2 };

/** When each of `n` entrances lands, in seconds: the first on the section's downbeat at `start`. */
export function entrances(n: number, start: number, span: number, beat: number): number[] {
    return entranceCues(n, start, span, beat, PACE);
}
