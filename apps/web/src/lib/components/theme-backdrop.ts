interface IdleWindow {
    requestIdleCallback?(cb: () => void, options?: { timeout?: number }): number;
    cancelIdleCallback?(id: number): void;
    setTimeout(cb: () => void, ms?: number): unknown;
    clearTimeout(id: never): void;
}

/** Longest the decor waits for an idle moment before loading anyway. */
const IDLE_DEADLINE_MS = 3000;
/** Safari has no idle callback; by this point the page has painted and settled. */
const FALLBACK_MS = 1200;

/** Runs `run` once the browser is idle, so the decor never competes with the page's first paint. Returns a cancel. */
export function whenIdle(win: IdleWindow, run: () => void): () => void {
    if (win.requestIdleCallback && win.cancelIdleCallback) {
        const id = win.requestIdleCallback(run, { timeout: IDLE_DEADLINE_MS });
        return () => win.cancelIdleCallback?.(id);
    }
    const id = win.setTimeout(run, FALLBACK_MS);
    return () => win.clearTimeout(id as never);
}

interface MotionQuery {
    matches: boolean;
    addEventListener(type: "change", cb: (e: { matches: boolean }) => void): void;
    removeEventListener(type: "change", cb: (e: { matches: boolean }) => void): void;
}

/** The decor stills itself under `data-reduced-motion` on `<html>`; the website takes it from the visitor's OS. */
export function mirrorReducedMotion(
    root: { toggleAttribute(name: string, on: boolean): unknown },
    query: MotionQuery,
): () => void {
    const sync = (e: { matches: boolean }) => root.toggleAttribute("data-reduced-motion", e.matches);
    sync(query);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
}
