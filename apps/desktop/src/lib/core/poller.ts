import { windowVisibility } from "./window-visibility";

export interface PollerEnv {
    isHidden(): boolean;
    onVisibilityChange(cb: () => void): () => void;
}

export interface PollerOptions {
    intervalMs: number;
    /** Run one tick synchronously inside `start()`. */
    immediate?: boolean;
    /** Suspend the timer while the main window is hidden; it restarts on show. */
    pauseWhenHidden?: boolean;
    env?: PollerEnv;
}

export interface Poller {
    /** Idempotent. Returns `stop`. */
    start(): () => void;
    stop(): void;
    readonly running: boolean;
}

/** `tick` receives the poller so it can stop itself (e.g. after a successful retry). */
export function createPoller(tick: (poller: Poller) => unknown, options: PollerOptions): Poller {
    const { intervalMs, immediate = false, pauseWhenHidden = false, env = windowVisibility } = options;

    let running = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let unwatch: (() => void) | null = null;

    const schedule = () => {
        if (timer === null) timer = setInterval(() => void tick(poller), intervalMs);
    };

    const unschedule = () => {
        if (timer !== null) clearInterval(timer);
        timer = null;
    };

    const poller: Poller = {
        get running() {
            return running;
        },
        start() {
            if (running) return poller.stop;
            running = true;
            if (pauseWhenHidden) {
                unwatch = env.onVisibilityChange(() => {
                    if (env.isHidden()) unschedule();
                    else schedule();
                });
            }
            if (immediate) {
                void tick(poller);
                if (!running) return poller.stop;
            }
            if (!(pauseWhenHidden && env.isHidden())) schedule();
            return poller.stop;
        },
        stop() {
            running = false;
            unschedule();
            unwatch?.();
            unwatch = null;
        },
    };

    return poller;
}
