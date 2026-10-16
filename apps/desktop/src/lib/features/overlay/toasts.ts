import type { OverlayPosition } from "@deadlock-plus/ipc-types/OverlayPosition";
import type { OverlayToast } from "@deadlock-plus/ipc-types/OverlayToast";

export interface Shown {
    toast: OverlayToast;
    expiresAt: number;
}

/** `corner` is oldest first. */
export interface OverlayToasts {
    corner: readonly Shown[];
    center: Shown | null;
}

export const NO_TOASTS: OverlayToasts = { corner: [], center: null };
export const CORNER_LIMIT = 3;
const DEFAULT_POSITION: OverlayPosition = "topRight";

export function show(state: OverlayToasts, toast: OverlayToast, now: number): OverlayToasts {
    const shown = { toast, expiresAt: now + toast.durationMs };
    if (toast.placement === "center") return { ...state, center: shown };
    const corner = [...state.corner.filter((s) => s.toast.id !== toast.id), shown].slice(-CORNER_LIMIT);
    return { ...state, corner };
}

export function expire(state: OverlayToasts, now: number): OverlayToasts {
    const live = (s: Shown) => s.expiresAt > now;
    const corner = state.corner.filter(live);
    const center = state.center && live(state.center) ? state.center : null;
    if (corner.length === state.corner.length && center === state.center) return state;
    return { corner, center };
}

export function nextExpiry(state: OverlayToasts): number | null {
    const times = [...state.corner, ...(state.center ? [state.center] : [])].map((s) => s.expiresAt);
    return times.length ? Math.min(...times) : null;
}

export function reposition(state: OverlayToasts, position: OverlayPosition): OverlayToasts {
    if (state.corner.every((s) => s.toast.position === position)) return state;
    return { ...state, corner: state.corner.map((s) => ({ ...s, toast: { ...s.toast, position } })) };
}

/** The stack moves as one, so a position change while toasts show applies to all of them. */
export function cornerPosition(state: OverlayToasts): OverlayPosition {
    return state.corner.at(-1)?.toast.position ?? DEFAULT_POSITION;
}

/** Top to bottom; the newest toast sits nearest the anchored edge. */
export function stackOrder(state: OverlayToasts): Shown[] {
    return cornerPosition(state).startsWith("bottom") ? [...state.corner] : [...state.corner].reverse();
}

export interface Clock {
    now(): number;
    setTimeout(cb: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
}

export function createToastQueue(clock: Clock, onChange: (state: OverlayToasts) => void) {
    let state = NO_TOASTS;
    let timer: unknown = null;

    const schedule = () => {
        if (timer !== null) clock.clearTimeout(timer);
        timer = null;
        const at = nextExpiry(state);
        if (at === null) return;
        timer = clock.setTimeout(tick, Math.max(0, at - clock.now()));
    };

    const publish = (next: OverlayToasts) => {
        if (next === state) return;
        state = next;
        onChange(state);
    };

    function tick() {
        timer = null;
        publish(expire(state, clock.now()));
        schedule();
    }

    return {
        push(toast: OverlayToast) {
            publish(show(state, toast, clock.now()));
            schedule();
        },
        reposition(position: OverlayPosition) {
            publish(reposition(state, position));
        },
        dispose() {
            if (timer !== null) clock.clearTimeout(timer);
            timer = null;
        },
    };
}
