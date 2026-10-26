import type { SceneSize } from "../../../scene";
import { sceneFrame } from "../../../kit/frame";
import type { Rect } from "../../../kit/types";

/** Seconds into an award beat that each of its moments lands. */
export interface AwardTimes {
    /** The category's title card hands over to the nominees. */
    title: number;
    /** One per nominee card, in seat order. */
    nominees: number[];
    /** "The envelope, please." */
    envelope: number;
    /** The envelope tears: the plan's reveal bar, where the tear sound lands. */
    reveal: number;
    /** The spotlight finds the winner, a beat after the tear. */
    spot: number;
    /** The acceptance line. */
    accept: number;
}

export function awardTimes(bars: number, barSeconds: number, nominees: number): AwardTimes {
    const beat = barSeconds / 4;
    const reveal = Math.floor(bars / 2) * barSeconds;
    const onBeats = (s: number) => beat * Math.max(1, Math.floor(s / beat + 1e-9));
    const title = onBeats(Math.min(barSeconds, reveal * 0.3));
    const envelope = reveal - onBeats(Math.min(2 * beat, reveal * 0.3));
    const step = nominees > 0 ? Math.min(beat, (envelope - title) / nominees) : 0;
    return {
        title,
        nominees: Array.from({ length: nominees }, (_, i) => title + i * step),
        envelope,
        reveal,
        spot: reveal + beat,
        accept: reveal + 2 * beat,
    };
}

function hash(s: string): number {
    let h = 2166136261;
    for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
}

/**
 * Which nominee sits in each seat, left to right. The winner comes first in the data; seating it by a hash of the
 * award keeps the reveal a surprise while one edition always renders the same.
 */
export function seatOrder(n: number, seed: string): number[] {
    const seats = Array.from({ length: n }, (_, i) => i);
    let h = hash(seed);
    for (let i = n - 1; i > 0; i--) {
        h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
        const j = h % (i + 1);
        [seats[i], seats[j]] = [seats[j]!, seats[i]!];
    }
    return seats;
}

/** Card art is the game's 280x380 hero card. */
export const CARD_RATIO = 380 / 280;
/** Where the nominee row starts, in the content square's units (1080 a side). */
export const ROW_TOP = 262;

/**
 * The nominee cards' boxes, in seats left to right: a row across the frame, wider apart in 16:9, lowered by `drop`
 * content units under a long header.
 */
export function nomineeSlots(n: number, size: SceneSize, drop = 0): Rect[] {
    const { u, box } = sceneFrame(size.w, size.h);
    const wide = size.w > size.h * 1.2;
    const margin = (wide ? 220 : 40) * u;
    const gap = (wide ? 110 : 36) * u;
    const avail = size.w - 2 * margin;
    const w = Math.min(300 * u, (avail - gap * (n - 1)) / n);
    const h = w * CARD_RATIO;
    const total = n * w + (n - 1) * gap;
    const x0 = (size.w - total) / 2;
    const y = box.y + (ROW_TOP + drop) * u;
    return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), y, w, h }));
}

/**
 * A line of text set no smaller than `floor`, wrapped onto at most `maxLines` when even that is too wide. Words are
 * never dropped: text that cannot fit `maxLines` at the floor runs onto more.
 */
export function fitLines(
    measure: (s: string, px: number) => number,
    str: string,
    px: number,
    floor: number,
    maxW: number,
    maxLines = 2,
): { lines: string[]; px: number } {
    const w = measure(str, px);
    if (w <= maxW) return { lines: [str], px };
    const shrunk = Math.max(floor, (px * maxW) / w);
    if (measure(str, shrunk) <= maxW + 0.5) return { lines: [str], px: shrunk };
    for (let size = px; size >= floor - 1e-9; size -= Math.max(1, (px - floor) / 8)) {
        const lines = wrapWords(measure, str, Math.max(size, floor), maxW);
        if (lines.length <= maxLines && lines.every((l) => measure(l, Math.max(size, floor)) <= maxW + 0.5))
            return { lines, px: Math.max(size, floor) };
        if (size === floor) break;
    }
    return { lines: wrapWords(measure, str, floor, maxW), px: floor };
}

function wrapWords(measure: (s: string, px: number) => number, str: string, px: number, maxW: number): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of str.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && measure(next, px) > maxW) {
            lines.push(line);
            line = word;
        } else line = next;
    }
    if (line) lines.push(line);
    return lines;
}
