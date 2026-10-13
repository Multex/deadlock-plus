export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type Frame = { image: Size; stage: Size };
export type Fingers = { a: Point; b: Point };

/** The image is drawn at `scale`, with its top left corner at `x`, `y` of the stage. */
export type View = { scale: number; x: number; y: number };

/** One image pixel per CSS pixel: the size the app's text was designed to be read at. */
export const READABLE_SCALE = 1;

const STEP = 1.5;

// A fitted axis can come out a hair wider than the stage through rounding; it still counts as fitting.
const SLACK = 0.5;

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function clampAxis(offset: number, scaled: number, stage: number): number {
    if (scaled <= stage + SLACK) return (stage - scaled) / 2;
    // Adding zero turns a negative zero into a plain one.
    return clamp(offset, stage - scaled, 0) + 0;
}

function centre(frame: Frame): Point {
    return { x: frame.stage.width / 2, y: frame.stage.height / 2 };
}

export function fitScale({ image, stage }: Frame): number {
    if (stage.width <= 0 || stage.height <= 0 || image.width <= 0 || image.height <= 0) return 1;
    return Math.min(stage.width / image.width, stage.height / image.height, 1);
}

export function maxScale(frame: Frame): number {
    return Math.max(2 * READABLE_SCALE, 4 * fitScale(frame));
}

export function fitView(frame: Frame): View {
    return clampView({ scale: fitScale(frame), x: 0, y: 0 }, frame);
}

export function isZoomed(view: View, frame: Frame): boolean {
    return view.scale > fitScale(frame) * 1.01;
}

export function clampView(view: View, frame: Frame): View {
    const scale = clamp(view.scale, fitScale(frame), maxScale(frame));
    return {
        scale,
        x: clampAxis(view.x, frame.image.width * scale, frame.stage.width),
        y: clampAxis(view.y, frame.image.height * scale, frame.stage.height),
    };
}

/** Changes the scale while the image pixel under `point` stays under it. */
export function zoomAbout(view: View, point: Point, scale: number, frame: Frame): View {
    return moveAndZoom(view, point, point, scale, frame);
}

/** Changes the scale and carries the image pixel under `from` to `to`. */
function moveAndZoom(view: View, from: Point, to: Point, scale: number, frame: Frame): View {
    const next = clamp(scale, fitScale(frame), maxScale(frame));
    const ratio = next / view.scale;
    return clampView({ scale: next, x: to.x - (from.x - view.x) * ratio, y: to.y - (from.y - view.y) * ratio }, frame);
}

export function zoomStep(view: View, direction: 1 | -1, frame: Frame): View {
    return zoomAbout(view, centre(frame), direction > 0 ? view.scale * STEP : view.scale / STEP, frame);
}

export function panBy(view: View, dx: number, dy: number, frame: Frame): View {
    return clampView({ scale: view.scale, x: view.x + dx, y: view.y + dy }, frame);
}

/** `start` is the view when both fingers went down at `from`; they are now at `to`. */
export function pinch(start: View, from: Fingers, to: Fingers, frame: Frame): View {
    const spreadBefore = Math.hypot(from.b.x - from.a.x, from.b.y - from.a.y);
    const spreadNow = Math.hypot(to.b.x - to.a.x, to.b.y - to.a.y);
    const scale = spreadBefore > 0 ? (start.scale * spreadNow) / spreadBefore : start.scale;
    return moveAndZoom(start, middle(from), middle(to), scale, frame);
}

function middle({ a, b }: Fingers): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Fit becomes a readable scale with the tapped spot in the middle of the stage; anything else becomes fit. */
export function toggleZoom(view: View, point: Point, frame: Frame): View {
    if (isZoomed(view, frame)) return fitView(frame);
    return moveAndZoom(view, point, centre(frame), Math.max(READABLE_SCALE, 2 * fitScale(frame)), frame);
}
