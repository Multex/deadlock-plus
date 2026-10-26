import { fitScale } from "../../fit";
import { REST_ANGLE } from "./timeline";

/** One magazine page; the cover is the same size. */
export const PAGE = { width: 720, height: 936 } as const;
/** The open spread: two pages and the page block's edges. */
export const BOOK = { width: PAGE.width * 2 + 14, height: PAGE.height } as const;
/** The control bar under the magazine. */
export const BAR = 56;
/** Room around the magazine for its drop shadow. */
export const PAD = 24;

export interface Box {
    width: number;
    height: number;
}

export interface BookLayout {
    /** 0 until both boxes are measured. */
    scale: number;
    /** The book's centre in room coordinates. */
    cx: number;
    cy: number;
    /** Shift in book px: closed, only the right half (the cover) shows, so it moves left by half a page. */
    tx: number;
    rot: number;
}

/**
 * Closed (`open` 0) the cover sits in the stage; open (1) the spread takes the whole room. In between it moves and
 * grows linearly, so one eased `open` drives the whole move.
 */
export function bookLayout(room: Box, stage: Box & { left: number; top: number }, open: number): BookLayout {
    const closed = fitScale(stage.width, stage.height - BAR, PAGE, REST_ANGLE, PAD);
    const spread = fitScale(room.width, room.height - BAR, BOOK, 0, PAD);
    const lerp = (a: number, b: number) => a + (b - a) * open;
    if (closed === 0 || spread === 0) return { scale: 0, cx: 0, cy: 0, tx: 0, rot: REST_ANGLE };
    return {
        scale: lerp(closed, spread),
        cx: lerp(stage.left + stage.width / 2, room.width / 2),
        cy: lerp(stage.top + (stage.height - BAR) / 2, (room.height - BAR) / 2),
        tx: -(PAGE.width / 2) * (1 - open) + 0,
        rot: REST_ANGLE * (1 - open) + 0,
    };
}
