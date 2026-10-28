import { rotatedBox } from "../../fit";

/** Room the tilted stamp keeps from the sheet's edge, in sheet px. */
export const STAMP_MARGIN = 18;
/** The word's box in sheet px: the photo's width less `inset`, within `min` and `max`; the frame adds about 50. */
export const STAMP_WORD = { min: 170, max: 250, inset: 44 };
/** How far down the photo the stamp's centre sits: below the face, across the hero's chest. */
const DROP = 0.62;

export interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export function stampWordWidth(photoWidth: number): number {
    return Math.min(STAMP_WORD.max, Math.max(STAMP_WORD.min, photoWidth - STAMP_WORD.inset));
}

/** The stamp's centre in sheet px: across the photo, pulled in so the whole tilted stamp stays on the sheet. */
export function stampCenter(
    photo: Rect,
    stamp: { width: number; height: number },
    paper: { width: number; height: number },
    angle: number,
): { x: number; y: number } {
    const box = rotatedBox(stamp.width, stamp.height, angle);
    const clamp = (v: number, half: number, size: number) =>
        Math.min(size - STAMP_MARGIN - half, Math.max(STAMP_MARGIN + half, v));
    return {
        x: clamp(photo.left + photo.width / 2, box.w / 2, paper.width),
        y: clamp(photo.top + photo.height * DROP, box.h / 2, paper.height),
    };
}
