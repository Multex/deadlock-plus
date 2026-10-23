/** "fit" fills the column; a number is a fraction of the game's own px at the previewed resolution. */
export type Zoom = "fit" | number;

export const DEFAULT_ZOOM = 0.75;
export const ZOOM_STEPS = [0.5, 0.6, 0.75, 0.9, 1, 1.25, 1.5] as const;
export const ZOOM_KEY = "deadlock-plus:builds-editor-zoom";

/** One mouse wheel notch. Trackpads send smaller deltas, which add up to a step. */
const WHEEL_STEP = 100;
const EPSILON = 1e-6;
/** A step this close to Fit draws no visibly different size, so stepping treats it as Fit. */
const SAME_AS_FIT = 0.03;

/** The page never overflows the column: a zoom wider than Fit draws at Fit. */
export function zoomScale(zoom: Zoom, fit: number): number {
    return zoom === "fit" ? fit : Math.min(zoom, fit);
}

export function shownZoom(zoom: Zoom, fit: number): Zoom {
    return zoom === "fit" || zoom >= fit - EPSILON ? "fit" : zoom;
}

export function stepZoom(zoom: Zoom, fit: number, direction: 1 | -1): Zoom {
    const current = zoomScale(zoom, fit);
    const nearFit = fit * (1 - SAME_AS_FIT);
    if (direction > 0) {
        const next = ZOOM_STEPS.find((step) => step > current + EPSILON);
        if (next === undefined) return zoom;
        return next >= nearFit ? "fit" : next;
    }
    const below = current >= nearFit ? nearFit : current;
    const next = ZOOM_STEPS.findLast((step) => step < below - EPSILON);
    return next ?? zoom;
}

/** `steps` > 0 zooms in (wheel up). */
export function wheelSteps(rest: number, deltaY: number): { steps: number; rest: number } {
    const total = rest - deltaY;
    const steps = Math.trunc(total / WHEEL_STEP);
    return { steps, rest: total - steps * WHEEL_STEP };
}

export function loadZoom(): Zoom {
    let raw: string | null = null;
    try {
        raw = localStorage.getItem(ZOOM_KEY);
    } catch {
        return DEFAULT_ZOOM;
    }
    if (raw === "fit") return "fit";
    const value = Number(raw);
    return ZOOM_STEPS.find((step) => step === value) ?? DEFAULT_ZOOM;
}

export function saveZoom(zoom: Zoom): void {
    try {
        localStorage.setItem(ZOOM_KEY, String(zoom));
    } catch {
        // Storage can be unavailable; the zoom just won't persist.
    }
}
