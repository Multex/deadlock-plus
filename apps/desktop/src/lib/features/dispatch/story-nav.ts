export type StoryStep = "next" | "prev";
export type StoryAction = StoryStep | "close";

export function clampCard(index: number, count: number): number {
    if (count <= 0) return 0;
    return Math.min(Math.max(index, 0), count - 1);
}

/** Stops at either end instead of wrapping, like a stories app. */
export function stepCard(index: number, count: number, step: StoryStep): number {
    return clampCard(index + (step === "next" ? 1 : -1), count);
}

/** `onControl`: a button has focus, so Space and Enter press it instead of turning the card. */
export function keyAction(key: string, onControl = false): StoryAction | null {
    switch (key) {
        case "ArrowRight":
            return "next";
        case "ArrowLeft":
            return "prev";
        case "Escape":
            return "close";
        case " ":
            return onControl ? null : "next";
        default:
            return null;
    }
}

/**
 * The control to focus for a Tab press at `at` (-1: focus is outside), or `null` to let the browser move it.
 * -1 with no controls: keep focus where it is.
 */
export function trapFocus(at: number, count: number, shift: boolean): number | null {
    if (count === 0) return -1;
    const last = count - 1;
    if (shift) return at <= 0 ? last : null;
    return at < 0 || at === last ? 0 : null;
}

export function cardScale(stageW: number, stageH: number, cardW: number, cardH: number, margin: number): number {
    if (stageW <= 0 || stageH <= 0) return 0;
    return Math.max(0, Math.min((stageH - margin * 2) / cardH, (stageW - margin * 2) / cardW));
}
