/** Stops in reading order: 0 the cover, then the inside spread, or its two pages one at a time on a small window. */
export type InsideMode = "spread" | "pages";

export const lastStop = (mode: InsideMode): number => (mode === "spread" ? 1 : 2);

export type ReaderAction = "next" | "prev" | "first" | "last" | "close";
export type SleevePhase = "sealed" | "tearing" | "open";

export interface ReaderState {
    /** The stop the copy last came to rest on. */
    at: number;
    /** Where the reader asked to go; steps queued while a page turns play out one turn at a time. */
    goal: number;
    /** The stop the page in flight is turning to, or `null` at rest. */
    turn: number | null;
}

export const AT_COVER: ReaderState = { at: 0, goal: 0, turn: null };

/** Inside pages are printed as 2 and 3; the cover is page 1. */
export function stopLabel(stop: number, mode: InsideMode): { key: string; params?: Record<string, number> } {
    if (stop <= 0) return { key: "dispatch.monthly.spread.cover" };
    if (mode === "spread") return { key: "dispatch.monthly.spread.pages", params: { from: 2, to: 3 } };
    return { key: "dispatch.collectors.page", params: { page: stop + 1 } };
}

/**
 * A step moves one page; steps asked for while it turns queue behind it, so a reversal plays once the page in flight
 * lands. A jump (first, last, close) turns straight to its stop.
 */
export function request(s: ReaderState, action: ReaderAction, last: number): ReaderState {
    const clamp = (n: number) => Math.min(last, Math.max(0, n));
    const step = action === "next" ? 1 : action === "prev" ? -1 : 0;
    const goal =
        step !== 0 ? clamp(s.goal + step) : action === "close" ? 0 : action === "first" ? Math.min(1, last) : last;
    if (s.turn !== null) return goal === s.goal ? s : { ...s, goal };
    if (goal === s.at) return s;
    return { at: s.at, goal, turn: step !== 0 ? s.at + step : goal };
}

/** The page in flight landed: rest there, or start the next queued step. */
export function settle(s: ReaderState): ReaderState {
    if (s.turn === null) return s;
    const at = s.turn;
    if (s.goal === at) return { at, goal: at, turn: null };
    return { at, goal: s.goal, turn: at + Math.sign(s.goal - at) };
}

export const shown = (s: ReaderState): number => s.turn ?? s.at;

/** `stop`: where the copy rests (or is turning to). */
export function keyAction(
    e: { key: string; shiftKey: boolean },
    phase: SleevePhase,
    stop: number,
): ReaderAction | "tear" | null {
    if (phase === "tearing") return null;
    if (phase === "sealed") return e.key === "Enter" || e.key === " " ? "tear" : null;
    const inside = stop > 0;
    switch (e.key) {
        case "ArrowRight":
        case "PageDown":
            return "next";
        case "ArrowLeft":
        case "PageUp":
            return inside ? "prev" : null;
        case "Home":
            return inside ? "first" : null;
        case "End":
            return "last";
        case "Escape":
            return inside ? "close" : null;
        case "Enter":
            return inside ? null : "next";
        case " ":
            return e.shiftKey ? (inside ? "prev" : null) : "next";
        default:
            return null;
    }
}

/** Px a press may wander and still count as a click. */
const CLICK_SLOP = 6;
/** Px sideways that make a drag a page pull. */
const SWIPE = 40;

type Press = { x: number; dx: number; dy: number };

const isClick = (p: Press) => Math.hypot(p.dx, p.dy) <= CLICK_SLOP;
const isPull = (p: Press) => Math.abs(p.dx) >= SWIPE && Math.abs(p.dx) > Math.abs(p.dy) * 1.5;

/**
 * What a press released at `x` after moving `dx`/`dy` does on a copy drawn across `box`. The cover opens from
 * anywhere on it; inside, a click turns the page it lands on and a sideways pull turns the way it was pulled.
 */
export function pointerAction(
    p: Press,
    box: { left: number; width: number },
    stop: number,
    last: number,
): ReaderAction | null {
    let action: ReaderAction | null;
    if (isClick(p)) {
        if (stop === 0) return last > 0 ? "next" : null;
        action = p.x - p.dx >= box.left + box.width / 2 ? "next" : "prev";
    } else if (isPull(p)) {
        action = p.dx < 0 ? "next" : "prev";
    } else {
        return null;
    }
    if (action === "next" && stop >= last) return null;
    if (action === "prev" && stop <= 0) return null;
    return action;
}

/** The sealed sleeve tears from a click or a sideways pull anywhere on it, not only from its tab. */
export const sleeveAction = (p: Press): "tear" | null => (isClick(p) || isPull(p) ? "tear" : null);

/** The page under the pointer that a click would turn, for the cursor. */
export function hoverAction(
    x: number,
    box: { left: number; width: number },
    stop: number,
    last: number,
): ReaderAction | null {
    return pointerAction({ x, dx: 0, dy: 0 }, box, stop, last);
}

export const TURN_MS = 620;
/** Past edge-on the leaf is out of sight; stopping a little past it keeps the swing from reading as a snap. */
const SWING = 100;

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

/**
 * The leaf that moves in a turn, `k` 0 to 1. Forward, the page on show swings away round its spine to bare the next
 * one; back, the earlier page swings in on top and lands.
 */
export function turnPose(k: number, dir: 1 | -1): { top: "from" | "to"; angle: number } {
    const e = easeInOut(Math.min(1, Math.max(0, k)));
    return dir > 0 ? { top: "from", angle: 0 - SWING * e } : { top: "to", angle: 0 - SWING * (1 - e) };
}
