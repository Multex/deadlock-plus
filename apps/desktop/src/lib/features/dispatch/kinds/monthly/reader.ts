/** Spreads in reading order: 0 the closed cover, 1 pages 2–3, 2 pages 4–5. */
export const LAST_SPREAD = 2;

export type ReaderAction = "next" | "prev" | "first" | "last" | "close";

export interface ReaderState {
    /** The spread the magazine last came to rest on. */
    at: number;
    /** Where the reader asked to go; queued steps play out one turn at a time until `at` gets there. */
    goal: number;
    /** The spread the leaves are moving to, or `null` at rest. */
    turn: number | null;
}

export const CLOSED: ReaderState = { at: 0, goal: 0, turn: null };

const clamp = (n: number) => Math.min(LAST_SPREAD, Math.max(0, n));

/**
 * A step (next/prev) moves one leaf; more steps while it is in flight queue behind it, and a step back drops the
 * moving leaf back. A jump (first/last/close) sends every leaf straight to its spread in one flip.
 */
export function request(s: ReaderState, action: ReaderAction): ReaderState {
    const step = action === "next" ? 1 : action === "prev" ? -1 : 0;
    const goal = step !== 0 ? clamp(s.goal + step) : action === "last" ? LAST_SPREAD : 0;
    if (s.turn === null) {
        if (goal === s.at) return s;
        return { at: s.at, goal, turn: goal };
    }
    if (goal === s.goal && step !== 0) return s;
    if (step === 0) return { at: s.at, goal, turn: goal };
    // Still at or past the leaf in flight, in its direction: wait for it. Otherwise pull it back.
    const ahead = (s.turn - s.at) * (goal - s.turn) >= 0 && goal !== s.at;
    return { at: s.at, goal, turn: ahead ? s.turn : goal };
}

/** The leaves reached `turn`: rest there, or start the next queued step. */
export function settle(s: ReaderState): ReaderState {
    if (s.turn === null) return s;
    const at = s.turn;
    if (s.goal === at) return { at, goal: at, turn: null };
    return { at, goal: s.goal, turn: at + Math.sign(s.goal - at) };
}

/** The spread on show, or the one it is turning to. */
export const shown = (s: ReaderState): number => s.turn ?? s.at;

/** Each leaf's turn (0 lying right, 1 turned over) once the magazine rests on `spread`. */
export const leafTargets = (spread: number) => ({ p1: spread >= 1 ? 1 : 0, p2: spread >= 2 ? 1 : 0 });

export const spreadPages = (spread: number): { from: number; to: number } | null =>
    spread <= 0 ? null : { from: spread * 2, to: spread * 2 + 1 };

/** `open`: the magazine is past its cover (or on its way). */
export function keyAction(e: { key: string; shiftKey: boolean }, open: boolean): ReaderAction | null {
    switch (e.key) {
        case "ArrowRight":
        case "PageDown":
            return "next";
        case "ArrowLeft":
        case "PageUp":
            return "prev";
        case "Home":
            return "first";
        case "End":
            return "last";
        case "Escape":
            return open ? "close" : null;
        case "Enter":
            return open ? null : "next";
        case " ":
            return e.shiftKey ? "prev" : "next";
        default:
            return null;
    }
}

/** Px a press may wander and still count as a click. */
const CLICK_SLOP = 6;
/** Px sideways that make a drag a page pull. */
const SWIPE = 40;

/**
 * What a press released at `x` after moving `dx`/`dy` does, on a book whose open spread spans `box`. Closed, only
 * the right half holds the cover. A click turns the page it lands on; a sideways pull turns the way it was pulled.
 */
export function pointerAction(
    p: { x: number; dx: number; dy: number },
    box: { left: number; width: number },
    spread: number,
): ReaderAction | null {
    const moved = Math.hypot(p.dx, p.dy);
    let action: ReaderAction | null;
    if (moved <= CLICK_SLOP) {
        const right = p.x - p.dx >= box.left + box.width / 2;
        if (spread === 0 && !right) return null;
        action = right ? "next" : "prev";
    } else if (Math.abs(p.dx) >= SWIPE && Math.abs(p.dx) > Math.abs(p.dy) * 1.5) {
        action = p.dx < 0 ? "next" : "prev";
    } else {
        return null;
    }
    if (action === "next" && spread >= LAST_SPREAD) return null;
    if (action === "prev" && spread <= 0) return null;
    return action;
}

/** The page edge under the pointer that would turn on a click, for the curl and the cursor. */
export function hoverEdge(x: number, box: { left: number; width: number }, spread: number): "next" | "prev" | null {
    const action = pointerAction({ x, dx: 0, dy: 0 }, box, spread);
    return action === "next" || action === "prev" ? action : null;
}
