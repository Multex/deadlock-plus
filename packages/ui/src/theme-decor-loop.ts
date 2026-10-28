import type { Pointer } from "./theme-decor-wake";

/** Something moves fast enough that anything slower would stutter. */
export const BUSY_MS = 1000 / 60;
/** Slow drift reads the same at half the rate and costs half as much. */
export const CALM_MS = 1000 / 30;
/** Drift slower than a pixel a frame even at this rate, like dust hanging in the air. */
export const DRIFT_MS = 1000 / 20;

/** Below this a sleep is a run of animation frames; above it, a timer, so no frame is produced at all. */
const TIMER_MS = 40;
/** A cursor that has not moved for this long stops stirring the air. */
const STILL_MS = 90;

export interface CanvasScene {
    /** Called on mount and on every resize, in CSS pixels. */
    fit(width: number, height: number): void;
    /**
     * Draws one frame and returns how long to wait before the next, in ms. A long wait costs nothing: the canvas
     * keeps its last frame. `dt` is seconds since the last frame (0 on the first), `now` is the wall clock.
     */
    frame(
        ctx: CanvasRenderingContext2D,
        dt: number,
        now: number,
        pointer: Pointer | null,
        width: number,
        height: number,
    ): number;
}

/** A finger on a phone is scrolling or tapping the page, not waving through the air, so only a cursor stirs it. */
export function stirsDecor(e: Pick<PointerEvent, "pointerType">): boolean {
    return e.pointerType !== "touch";
}

/** The decor stops while the window is hidden or not focused, or when motion is reduced. */
function paused(root: HTMLElement): boolean {
    return document.hidden || root.hasAttribute("data-decor-paused") || root.hasAttribute("data-reduced-motion");
}

/**
 * Calls `tick` whenever it asks to be called again (its return value, in ms), but never while the decor is
 * paused. `wake` brings the next call forward, for input that should not wait out a long sleep.
 */
export function runTicker(tick: (now: number) => number): { stop(): void; wake(): void } {
    const root = document.documentElement;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let due = 0;

    const clear = () => {
        cancelAnimationFrame(frame);
        clearTimeout(timer);
        frame = 0;
        timer = undefined;
    };
    const schedule = (delay: number) => {
        clear();
        due = performance.now() + delay;
        if (delay > TIMER_MS) timer = setTimeout(() => (frame = requestAnimationFrame(run)), delay - TIMER_MS / 2);
        else frame = requestAnimationFrame(run);
    };
    const run = (time: number) => {
        frame = 0;
        if (paused(root)) return;
        // rAF fires at the display's rate (120, 144, 240 Hz); wait out the rest of the requested gap.
        if (time < due - 1) {
            frame = requestAnimationFrame(run);
            return;
        }
        schedule(Math.max(0, tick(Date.now())));
    };
    const sync = () => {
        if (paused(root)) clear();
        else if (!frame && !timer) frame = requestAnimationFrame(run);
    };

    const watch = new MutationObserver(sync);
    watch.observe(root, { attributes: true, attributeFilter: ["data-decor-paused", "data-reduced-motion"] });
    document.addEventListener("visibilitychange", sync);
    sync();

    return {
        stop() {
            clear();
            watch.disconnect();
            document.removeEventListener("visibilitychange", sync);
        },
        wake() {
            if (paused(root) || due - performance.now() <= BUSY_MS) return;
            clear();
            due = 0;
            frame = requestAnimationFrame(run);
        },
    };
}

/**
 * Runs a decor canvas on the shared ticker: sized to its box, fed the cursor's position and speed from anywhere
 * in the window, and woken early by cursor movement. Returns the cleanup.
 */
export function runCanvas(canvas: HTMLCanvasElement, scene: CanvasScene, maxPixelRatio = 1): () => void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return () => {};

    let rect = canvas.getBoundingClientRect();
    let ratio = 1;
    let last = 0;
    const resize = () => {
        rect = canvas.getBoundingClientRect();
        ratio = Math.min(maxPixelRatio, window.devicePixelRatio || 1);
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        scene.fit(width, height);
        last = 0;
        ticker.wake();
    };

    let pointer: Pointer | null = null;
    let lastMove = 0;
    const onMove = (e: PointerEvent) => {
        if (!stirsDecor(e)) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const seconds = (e.timeStamp - lastMove) / 1000;
        if (pointer && seconds > 0 && seconds < 0.25) {
            // Smoothed, so one jittery event does not fling everything.
            pointer.vx = pointer.vx * 0.6 + ((x - pointer.x) / seconds) * 0.4;
            pointer.vy = pointer.vy * 0.6 + ((y - pointer.y) / seconds) * 0.4;
            pointer.x = x;
            pointer.y = y;
        } else {
            pointer = { x, y, vx: 0, vy: 0 };
        }
        lastMove = e.timeStamp;
        ticker.wake();
    };
    const onLeave = () => (pointer = null);

    const ticker = runTicker((now) => {
        const time = performance.now();
        // After a sleep the scene gets one short step, not the whole gap.
        const dt = last ? Math.min((time - last) / 1000, 0.05) : 0;
        last = time;
        if (pointer && time - lastMove > STILL_MS) {
            pointer.vx *= 0.8;
            pointer.vy *= 0.8;
        }
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        const next = scene.frame(ctx, dt, now, pointer, canvas.width / ratio, canvas.height / ratio);
        const stirring = pointer !== null && time - lastMove < STILL_MS;
        if (next > DRIFT_MS) last = 0;
        return stirring ? Math.min(next, BUSY_MS) : next;
    });

    resize();
    const resizes = new ResizeObserver(resize);
    resizes.observe(canvas);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);

    return () => {
        ticker.stop();
        resizes.disconnect();
        window.removeEventListener("pointermove", onMove);
        document.documentElement.removeEventListener("pointerleave", onLeave);
    };
}

/**
 * A burst that repeats every `period` ms by the wall clock, active for its first `length` ms (shifted by
 * `offset`). Using the wall clock means a panel rebuilt mid-burst carries on instead of starting over.
 */
export function burst(now: number, period: number, length: number, offset = 0) {
    const at = (((now - offset) % period) + period) % period;
    const active = at < length;
    return {
        active,
        progress: active ? at / length : 0,
        untilChange: active ? length - at : period - at,
    };
}

/**
 * `addColorStop` throws on a colour the canvas cannot parse. A theme colour read from a custom property is
 * empty until the theme's CSS has applied, so an unresolved stop is left out and the gradient stays valid.
 */
export function addStop(gradient: CanvasGradient, offset: number, colour: string) {
    if (!colour) return;
    try {
        gradient.addColorStop(offset, colour);
    } catch {
        // An unparseable colour leaves the gradient one stop short, which still draws.
    }
}

/**
 * Builds a value once its inputs exist. `build` returns null while they do not (a theme colour read before the
 * theme's CSS has applied), and is tried again on the next call until it succeeds; the result is then cached.
 */
export function lazy<T>(build: () => T | null): () => T | null {
    let value: T | null = null;
    return () => (value ??= build());
}

/** A soft round glow: a bright core inside a fading halo, drawn once and stamped with `drawImage`. */
export function glowSprite(core: string, glow: string, size = 48, haloAlpha = 0.45): HTMLCanvasElement {
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = size;
    const ctx = sprite.getContext("2d");
    if (!ctx) return sprite;
    const r = size / 2;
    const halo = ctx.createRadialGradient(r, r, 0, r, r, r);
    addStop(halo, 0, glow);
    addStop(halo, 1, "transparent");
    ctx.globalAlpha = haloAlpha;
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 1;
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(r, r, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    return sprite;
}
