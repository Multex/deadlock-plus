import type { ObjectiveMark } from "./types";

export interface PlacedMark extends ObjectiveMark {
    /** Percent of the match. */
    at: number;
    /** 0 sits next to the axis; overlapping marks move outwards. */
    row: number;
}

/** `gap` is the share of the strip one mark needs, so marks closer than that stack. */
export function placeMarks(marks: ObjectiveMark[], durationS: number, gap: number): PlacedMark[] {
    const last: number[] = [];
    return [...marks]
        .sort((a, b) => a.timeS - b.timeS)
        .map((m) => {
            const share = durationS > 0 ? Math.min(1, Math.max(0, m.timeS / durationS)) : 0;
            let row = last.findIndex((l) => share - l >= gap);
            if (row < 0) row = last.length;
            last[row] = share;
            return { ...m, at: +(share * 100).toFixed(3), row };
        });
}
