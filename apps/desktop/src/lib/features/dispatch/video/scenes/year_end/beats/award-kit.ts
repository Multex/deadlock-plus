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
/** On a phone the row stands lower and larger, so the tall frame is filled instead of its top half. */
export const ROW_TOP_TALL = 330;

/** How far the award camera pushes in on the nominee row before the reveal: its drift plus its lean to the envelope. */
export const CAMERA_PUSH = 0.065;

/** The clear space between two nominee cards' outer edges, in content units: wider apart in 16:9, tight on a phone. */
export function GUTTER(size: SceneSize): number {
    return size.w > size.h * 1.2 ? 110 : size.h > size.w * 1.2 ? 26 : 40;
}

/**
 * The nominee cards' boxes, in seats left to right: a row across the frame, edge to edge on a phone, lowered by
 * `drop` content units under a long header. `bleed` is how far a card's frame stands outside its box, in content
 * units; the gutter is kept between the frames, not the boxes.
 */
export function nomineeSlots(n: number, size: SceneSize, drop = 0, bleed = 0): Rect[] {
    const { u, box } = sceneFrame(size.w, size.h);
    const wide = size.w > size.h * 1.2;
    const tall = size.h > size.w * 1.2;
    // Room for the camera's push, so the outer frames never reach the edge of the shot.
    const margin = Math.max((wide ? 220 : tall ? 20 : 40) * u, 18 * u + (size.w / 2) * CAMERA_PUSH);
    const gap = GUTTER(size) * u + 2 * bleed * u;
    const cap = (tall ? (n >= 3 ? 340 : 370) : 300) * u;
    const avail = size.w - 2 * margin - 2 * bleed * u;
    const w = Math.min(cap, (avail - gap * (n - 1)) / n);
    const h = w * CARD_RATIO;
    const total = n * w + (n - 1) * gap;
    const x0 = (size.w - total) / 2;
    const y = box.y + ((tall ? ROW_TOP_TALL : ROW_TOP) + drop) * u;
    return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), y, w, h }));
}

/**
 * Where each seat's card centre goes once the winner is revealed: the winner to `standX`, grown by `grow`; the others
 * shrunk by `shrink` and stepped aside, each clear of its neighbour towards the winner by `gutter` (frames of `bleed`
 * px included). Cards pushed past the frame's edge leave it, which beats overlapping the winner.
 */
export function revealRow(
    slots: readonly Rect[],
    winnerSeat: number,
    standX: number,
    grow: number,
    shrink: number,
    gutter: number,
    bleed: number,
): number[] {
    const out = slots.map((r) => r.x + r.w / 2);
    const half = (r: Rect, s: number) => (r.w / 2 + bleed) * s;
    const win = slots[winnerSeat];
    if (!win) return out;
    out[winnerSeat] = standX;
    const aside = gutter * 2;
    let edge = standX - half(win, grow) - gutter;
    for (let i = winnerSeat - 1; i >= 0; i--) {
        const hw = half(slots[i]!, shrink);
        out[i] = Math.min(out[i]! - aside, edge - hw);
        edge = out[i]! - hw - gutter;
    }
    edge = standX + half(win, grow) + gutter;
    for (let i = winnerSeat + 1; i < slots.length; i++) {
        const hw = half(slots[i]!, shrink);
        out[i] = Math.max(out[i]! + aside, edge + hw);
        edge = out[i]! + hw + gutter;
    }
    return out;
}

/**
 * How large the winner's card stands after the reveal, and its top edge, so the card and the `text` block under it
 * (the name and the acceptance line) fill the room between `top` and `bottom`: at most `cap` times its seat, never
 * smaller than the seat, the whole group centred in the room.
 */
export function winnerStand(
    card: { w: number; h: number },
    top: number,
    bottom: number,
    text: number,
    cap: number,
): { scale: number; top: number } {
    const room = bottom - top;
    const scale = Math.max(1, Math.min(cap, (room - text) / card.h));
    const used = card.h * scale + text;
    return { scale, top: top + Math.max(0, (room - used) / 2) };
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
