import { entranceCues } from "../../../kit/beat";

export type SectionId = "numbers" | "calendar" | "heroes" | "best" | "people" | "rank";
export type PageId = "cover" | SectionId | "end";

export interface Span {
    bar: number;
    bars: number;
}

export interface MonthlyPlan {
    cover: Span;
    sections: (Span & { id: SectionId })[];
    end: Span;
}

/** The magazine's own page order: the numbers and calendar, the cover story, the best game, the people and rank. */
const SECTION_ORDER: SectionId[] = ["numbers", "calendar", "heroes", "best", "people", "rank"];
/** Who gets spare bars first: the cover, then the pages that hold the most to read. */
const EXTRA_ORDER: ("cover" | SectionId)[] = ["cover", "numbers", "heroes", "people", "best", "calendar", "rank"];
const BASE_BARS = 3;
const END_BARS = 2;
/** Bars a page grows to while every page is in; past that only a thin edition's pages grow, to the second cap. */
const FULL_BARS = 4;
const THIN_BARS = 6;

/** Lays the magazine out on the bar grid: the cover, one page per section, then the back cover. */
export function monthlyPlan(bars: number, present: readonly SectionId[]): MonthlyPlan {
    const shown = SECTION_ORDER.filter((id) => present.includes(id));
    const share = new Map<"cover" | SectionId, number>([
        ["cover", BASE_BARS],
        ...shown.map((id) => [id, BASE_BARS] as const),
    ]);
    let spare = bars - END_BARS - BASE_BARS * share.size;
    const grow = (ids: readonly ("cover" | SectionId)[], cap: number) => {
        for (let given = true; spare > 0 && given;) {
            given = false;
            for (const id of ids) {
                if (spare === 0) break;
                const n = share.get(id);
                if (n === undefined || n >= cap) continue;
                share.set(id, n + 1);
                spare--;
                given = true;
            }
        }
    };
    grow(EXTRA_ORDER, FULL_BARS);
    grow(
        EXTRA_ORDER.filter((id) => id !== "cover"),
        THIN_BARS,
    );

    let bar = 0;
    const span = (n: number): Span => {
        const s = { bar, bars: n };
        bar += n;
        return s;
    };
    const cover = span(share.get("cover")!);
    const sections = shown.map((id) => ({ id, ...span(share.get(id)!) }));
    return { cover, sections, end: span(bars - bar) };
}

/** A page turn runs over the last two beats before a bar line, so the next page lands on the downbeat. */
export const TURN_BEATS = 2;

export interface PageMoment {
    page: PageId;
    /** Seconds the page starts and lasts. */
    start: number;
    span: number;
    /** The turn to the next page, `k` from 0 to 1, while it runs. */
    turn: { to: PageId; k: number } | null;
}

export function pageAt(plan: MonthlyPlan, t: number, barSeconds: number): PageMoment {
    const pages: (Span & { id: PageId })[] = [
        { id: "cover", ...plan.cover },
        ...plan.sections,
        { id: "end", ...plan.end },
    ];
    const bar = t / barSeconds;
    const found = pages.findIndex((p) => bar >= p.bar && bar < p.bar + p.bars);
    const index = found === -1 ? pages.length - 1 : found;
    const page = pages[index]!;
    const start = page.bar * barSeconds;
    const end = (page.bar + page.bars) * barSeconds;
    const turnTime = (TURN_BEATS * barSeconds) / 4;
    const next = pages[index + 1];
    const turn = next && t >= end - turnTime ? { to: next.id, k: (t - (end - turnTime)) / turnTime } : null;
    return { page: page.id, start, span: page.bars * barSeconds, turn };
}

/** A count-up runs a whole bar: slow enough to watch the number climb. */
export const COUNT_BEATS = 4;
/** Entrances and their count-ups finish within 70% of a page, at most two beats apart; the rest holds the page. */
const PACE = { share: 0.7, countBeats: COUNT_BEATS, apartBeats: 2 };

/** When each of `n` entrances lands, in seconds: the first on the page's downbeat at `start`. */
export function staggers(n: number, start: number, span: number, beat: number): number[] {
    return entranceCues(n, start, span, beat, PACE);
}
