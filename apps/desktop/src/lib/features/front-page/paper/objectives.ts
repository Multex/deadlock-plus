import type { ObjectiveMark } from "./types";

export interface PlacedMark extends ObjectiveMark {
    /** Percent across the strip where the mark's centre sits. */
    at: number;
    /** 0 sits next to the axis; overlapping marks move outwards. */
    row: number;
}

/**
 * `gap` is the share of the strip one mark needs, so marks closer in time than that stack. `width` is the share one
 * mark's box covers: a mark near either end is pulled in by half of it so the box stays inside the strip, and a mark
 * pulled onto its neighbour's box stacks too.
 */
export function placeMarks(marks: ObjectiveMark[], durationS: number, gap: number, width = gap): PlacedMark[] {
    const last: { time: number; at: number }[] = [];
    const edge = Math.min(width / 2, 0.5);
    return [...marks]
        .sort((a, b) => a.timeS - b.timeS)
        .map((m) => {
            const time = durationS > 0 ? Math.min(1, Math.max(0, m.timeS / durationS)) : 0;
            const at = Math.min(1 - edge, Math.max(edge, time));
            let row = last.findIndex((l) => time - l.time >= gap && at - l.at >= width);
            if (row < 0) row = last.length;
            last[row] = { time, at };
            return { ...m, at: +(at * 100).toFixed(3), row };
        });
}
