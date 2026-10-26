export interface Size {
    width: number;
    height: number;
}

export const SLEEVE: Size = { width: 780, height: 1180 };
export const COVER: Size = { width: 720, height: 1080 };
export const PAGE: Size = COVER;
export const SPREAD: Size = { width: 1440, height: 1080 };

/** Where the cover sits in the bag before it rises; once risen its centre is the bag's centre. */
export const SLOT = { x: 30, y: 80 } as const;
/** The tear tab sticks out this far past the bag's left edge; the same is kept free on the right. */
const TAB_OVERHANG = 14;
/** Room around the object for its drop shadow. */
export const STAGE_PAD = 22;
/** The row of buttons under the object. */
export const CONTROLS_H = 52;
/** Past 1.35 the type grows beyond print size on a 1440p window. */
const MAX_SCALE = 1.35;
/** Below this the chart's 13px labels drop under 9px, so the pages turn one at a time instead. */
const SPREAD_MIN_SCALE = 0.7;

export function fitBox(stage: Size, box: Size): number {
    if (stage.width <= 0 || stage.height <= 0) return 0;
    const extra = box === SLEEVE ? TAB_OVERHANG * 2 : 0;
    return Math.max(
        0.1,
        Math.min(
            MAX_SCALE,
            (stage.width - STAGE_PAD * 2) / (box.width + extra),
            (stage.height - STAGE_PAD * 2 - CONTROLS_H) / box.height,
        ),
    );
}

export function insideMode(stage: Size): "spread" | "pages" {
    return fitBox(stage, SPREAD) >= SPREAD_MIN_SCALE ? "spread" : "pages";
}

/** The scale during the tear: the bag's fit, handing over to the cover's as `settle` runs 0 to 1. */
export function tearScale(stage: Size, settle: number): number {
    const from = fitBox(stage, SLEEVE);
    return from + (fitBox(stage, COVER) - from) * settle;
}

/**
 * The object's area above the buttons: the scaled object plus its shadow room. `inside` is the open spread or page,
 * `null` for the cover, which keeps the taller of the bag and the cover so the buttons hold still through the tear.
 */
export function spotHeight(stage: Size, inside: Size | null): number {
    const tall = inside
        ? inside.height * fitBox(stage, inside)
        : Math.max(SLEEVE.height * fitBox(stage, SLEEVE), COVER.height * fitBox(stage, COVER));
    return Math.min(stage.height - CONTROLS_H, tall + STAGE_PAD * 2);
}
