/** One panel of the tri-fold poster; the closed copy is one panel, the open poster three side by side. */
export const PANEL = { w: 600, h: 900 } as const;

/** The closed copy is three sheets thick: its stacked edges show until the cover swings away. */
const THICK = 12;
const PAD = 40;
const MAX_SCALE = 1.2;
/** Open flaps stay a few degrees off flat, so the poster still reads as folded paper. */
const OPEN_TILT = 7;
const DIM = 0.38;
const DIM_IN = 200;

/** Milliseconds from the click: dim, flashbulb, scrap burst, cover swings right, inside flap swings left. */
export const REVEAL = {
    flashAt: 320,
    burstAt: 380,
    right: [1050, 1850] as const,
    left: [1650, 2450] as const,
    end: 3600,
};

export interface FoldFrame {
    /** 0 = cover shut, 1 = swung open. */
    right: number;
    left: number;
    flash: number;
    /** 1 = the room at its normal light. */
    light: number;
}

export const CLOSED: FoldFrame = { right: 0, left: 0, flash: 0, light: 1 };
export const OPEN: FoldFrame = { right: 1, left: 1, flash: 0, light: 1 };

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const progress = (t: number, [a, b]: readonly [number, number]) => clamp((t - a) / (b - a));
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

export function frameAt(t: number): FoldFrame {
    if (t >= REVEAL.end) return OPEN;
    const since = t - REVEAL.flashAt;
    const flash = since < -60 ? 0 : since < 0 ? (since + 60) / 60 : Math.exp(-since / 170);
    return {
        right: easeInOut(progress(t, REVEAL.right)),
        left: easeInOut(progress(t, REVEAL.left)),
        flash: flash < 0.01 ? 0 : clamp(flash),
        light: since < 0 ? 1 - DIM * clamp(t / DIM_IN) : 1,
    };
}

/** rotateY of each flap; `peek` lifts the closed cover on hover. */
export function flapAngles(frame: FoldFrame, peek: number): { left: number; right: number } {
    return {
        left: 180 - (180 - OPEN_TILT) * frame.left,
        right: -180 + (180 - OPEN_TILT) * frame.right + peek,
    };
}

/**
 * The scale that fits the copy, as far as it has unfolded, inside the stage with room around it, and the shift (in
 * panel px) that keeps it centred while only one flap is open.
 */
export function foldFit(frame: FoldFrame, stage: { width: number; height: number }) {
    const thick = 1 - frame.right;
    const width = PANEL.w * (1 + frame.right + frame.left) + THICK * thick;
    const height = PANEL.h + THICK * thick;
    const scale =
        stage.width > 0 && stage.height > 0
            ? Math.max(0, Math.min(MAX_SCALE, (stage.width - PAD * 2) / width, (stage.height - PAD * 2) / height))
            : 0;
    return { scale, width, shift: (PANEL.w / 2) * (frame.left - frame.right), thick };
}

export function scrapFade(t: number): number {
    return clamp((REVEAL.end - t) / 700);
}

/** The "Front page" export of a Year-End Special: the closed cover at its own size. */
export const YEAR_END_COVER = { width: PANEL.w, height: PANEL.h } as const;
