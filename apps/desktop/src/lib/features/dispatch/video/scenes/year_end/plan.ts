import type { SignalId } from "@deadlock-plus/stats/dispatch/signals";
import type { Beat } from "../../beats";
import type { SfxCue } from "../../sfx";

export type CategoryId =
    "y_performance" | "y_supporting" | "y_breakthrough" | "y_longest_run" | "y_endurance" | "y_villain";
/** Hero and Month of the Year play whenever their data exists; the categories compete for the other slots. */
export type AwardId = "y_hero" | "y_month" | CategoryId;
export type YearEndBeatId = "y_preshow" | "y_welcome" | AwardId | "y_credits" | "y_end";

export const CATEGORIES: readonly CategoryId[] = [
    "y_performance",
    "y_supporting",
    "y_breakthrough",
    "y_longest_run",
    "y_endurance",
    "y_villain",
];
export const AWARDS: readonly AwardId[] = ["y_hero", "y_month", ...CATEGORIES];
export const YEAR_END_BEATS: readonly YearEndBeatId[] = ["y_preshow", "y_welcome", ...AWARDS, "y_credits", "y_end"];
/** Categories a night hands out besides Hero and Month of the Year. */
export const CATEGORY_PICKS = 2;

/** How each beat shows its stat; no other kind presents a stat as nominees, a marquee or a credit roll. */
export const PRESENTS: Readonly<Record<YearEndBeatId, readonly string[]>> = {
    y_preshow: ["stats.matches:marquee_hook"],
    y_welcome: [],
    y_hero: ["heroes:nominees"],
    y_month: ["months:nominees"],
    y_performance: ["nominees:nominees"],
    y_supporting: ["mates:nominees"],
    y_breakthrough: ["newHeroes:nominees"],
    y_longest_run: ["longestWin:nominees"],
    y_endurance: ["longestSession:nominees"],
    y_villain: ["rivals:nominees"],
    y_credits: ["stats:credits"],
    y_end: [],
};

/** An award the year can fill. `strength` is its signal's, or a small fixed pick when no signal backs it. */
export interface AwardCandidate {
    id: AwardId;
    strength: number;
    signal?: SignalId;
}

/** The awards in show order: weakest first, the lead (strongest) last, so the night builds to it. */
export interface Lineup {
    awards: AwardCandidate[];
    lead: AwardId | null;
}

/** Breaks equal strengths: earlier ranks higher, so a plain Hero of the Year sinks to open the night. */
const TIE: readonly AwardId[] = [
    "y_performance",
    "y_longest_run",
    "y_supporting",
    "y_endurance",
    "y_breakthrough",
    "y_villain",
    "y_month",
    "y_hero",
];

const isCategory = (id: AwardId): id is CategoryId => (CATEGORIES as readonly AwardId[]).includes(id);

export function pickLineup(candidates: readonly AwardCandidate[]): Lineup {
    const ranked = [...candidates].sort((a, b) => b.strength - a.strength || TIE.indexOf(a.id) - TIE.indexOf(b.id));
    const spent = new Set<SignalId>();
    let categories = 0;
    const picked: AwardCandidate[] = [];
    for (const c of ranked) {
        if (picked.some((p) => p.id === c.id)) continue;
        if (isCategory(c.id) && categories >= CATEGORY_PICKS) continue;
        let award = c;
        if (c.signal && spent.has(c.signal)) {
            // A plain Hero or Month of the Year still plays; a category without its own signal does not.
            if (isCategory(c.id)) continue;
            award = { id: c.id, strength: 0 };
        }
        if (award.signal) spent.add(award.signal);
        if (isCategory(award.id)) categories++;
        picked.push(award);
    }
    picked.sort((a, b) => b.strength - a.strength || TIE.indexOf(a.id) - TIE.indexOf(b.id));
    const lead = picked[0]?.id ?? null;
    return { awards: picked.reverse(), lead };
}

type Part = "y_preshow" | "y_welcome" | "award" | "y_credits" | "y_end";

/**
 * Bars at the menu track's 29 with four awards: each award gets 5.6 s, and the credits five bars, room to roll at
 * a reading pace.
 */
const BARS: Record<Part, { base: number; min: number; max: number }> = {
    y_preshow: { base: 4, min: 2, max: 11 },
    y_welcome: { base: 2, min: 1, max: 3 },
    award: { base: 4, min: 3, max: 6 },
    y_credits: { base: 5, min: 4, max: 8 },
    y_end: { base: 2, min: 1, max: Infinity },
};

const partOf = (id: YearEndBeatId): Part =>
    id === "y_preshow" || id === "y_welcome" || id === "y_credits" || id === "y_end" ? id : "award";

/**
 * Lays the night on the bar grid. Spare bars (a longer track, a missing award) go round the lead award, the
 * other awards strongest first, the credits, the pre-show and the welcome; a shorter track takes them back from
 * the pre-show, welcome, credits and end card before any award.
 */
export function awardsPlan(bars: number, lineup: Lineup): Beat<YearEndBeatId>[] {
    const awards = lineup.awards.map((a) => a.id);
    const order: YearEndBeatId[] = ["y_preshow", "y_welcome", ...awards, "y_credits", "y_end"];
    const size = new Map(order.map((id) => [id, BARS[partOf(id)].base]));
    let total = order.reduce((n, id) => n + size.get(id)!, 0);

    const grow: YearEndBeatId[] = [...[...awards].reverse(), "y_credits", "y_preshow", "y_welcome"];
    const shrink: YearEndBeatId[] = ["y_preshow", "y_welcome", "y_credits", "y_end", ...awards];
    while (total < bars) {
        const room = grow.filter((id) => size.get(id)! < BARS[partOf(id)].max);
        for (const id of room.length ? room : ["y_end" as const]) {
            if (total === bars) break;
            size.set(id, size.get(id)! + 1);
            total++;
        }
    }
    while (total > bars) {
        const room = shrink.filter((id) => size.get(id)! > BARS[partOf(id)].min);
        if (!room.length) break;
        for (const id of room) {
            if (total === bars) break;
            size.set(id, size.get(id)! - 1);
            total--;
        }
    }

    const signals = new Map(lineup.awards.map((a) => [a.id, a.signal]));
    let bar = 0;
    return order.map((id) => {
        const beat: Beat<YearEndBeatId> = { id, kind: "year_end", bar, bars: size.get(id)!, presents: PRESENTS[id] };
        const signal = signals.get(id as AwardId);
        if (signal) beat.signal = signal;
        bar += beat.bars;
        return beat;
    });
}

/** The bar the envelope tears on: halfway through an award, after the nominees. Null for any other beat. */
export function revealBar(beat: Pick<Beat<YearEndBeatId>, "id" | "bar" | "bars">): number | null {
    return partOf(beat.id) === "award" ? beat.bar + Math.floor(beat.bars / 2) : null;
}

const MARQUEE_BULBS = 4;

/** Bar cues the pre-show's marquee lights on: one a bar, up to four, the last bar kept for the drop. */
export function marqueeCues(bars: number): number {
    return Math.max(1, Math.min(MARQUEE_BULBS, bars - 1));
}

/** Every cue sits on a beat: bulbs per pre-show bar, confetti on the welcome, an envelope, spotlight and crowd per winner. */
export function awardsSfx(plan: readonly Beat<YearEndBeatId>[], barSeconds: number): SfxCue[] {
    const beat = barSeconds / 4;
    const lead = plan.filter((b) => partOf(b.id) === "award").at(-1)?.id;
    return plan.flatMap((b): SfxCue[] => {
        const start = b.bar * barSeconds;
        if (b.id === "y_preshow")
            return Array.from({ length: marqueeCues(b.bars) }, (_, i) => ({
                cue: "marquee_bulb",
                atSeconds: start + i * barSeconds,
            }));
        if (b.id === "y_welcome")
            return [
                { cue: "confetti", atSeconds: start },
                { cue: "crowd", atSeconds: start, gain: 0.7 },
            ];
        const reveal = revealBar(b);
        if (reveal === null) return [];
        const at = reveal * barSeconds;
        if (b.id === lead)
            return [
                { cue: "envelope_tear", atSeconds: at },
                { cue: "spotlight", atSeconds: at + beat },
                { cue: "winner_sting", atSeconds: at + beat },
                { cue: "crowd", atSeconds: at + 2 * beat },
            ];
        return [
            { cue: "envelope_tear", atSeconds: at },
            { cue: "spotlight", atSeconds: at + beat },
            { cue: "crowd", atSeconds: at + beat, gain: 0.6 },
        ];
    });
}
