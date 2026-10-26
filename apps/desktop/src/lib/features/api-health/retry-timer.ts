import { retryDelayS } from "./busy";

export interface RetryTimer {
    /** Plans the next attempt after a busy answer, replacing any pending one. Returns the wait in seconds. */
    schedule(retryAfterS: number | null): number;
    /** Runs the attempt at once, unless one is already running. */
    tryNow(): void;
    /** After a success: the next schedule starts from the API's own wait again. */
    reset(): void;
    stop(): void;
    /** Whole seconds until the pending attempt, or null when none is pending. */
    readonly remainingS: number | null;
    readonly running: boolean;
}

export function createRetryTimer(options: { run: () => unknown; onChange?: () => void }): RetryTimer {
    const { run, onChange = () => {} } = options;
    let attempt = 0;
    let deadline: number | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let ticker: ReturnType<typeof setInterval> | null = null;
    let running = false;

    const clear = () => {
        if (timeout !== null) clearTimeout(timeout);
        if (ticker !== null) clearInterval(ticker);
        timeout = ticker = null;
        deadline = null;
    };

    const fire = () => {
        if (running) return;
        clear();
        running = true;
        onChange();
        let pending: Promise<unknown>;
        try {
            pending = Promise.resolve(run());
        } catch (e) {
            pending = Promise.reject(e);
        }
        void pending
            .catch(() => {})
            .finally(() => {
                running = false;
                onChange();
            });
    };

    return {
        schedule(retryAfterS) {
            clear();
            const waitS = retryDelayS(attempt++, retryAfterS);
            deadline = Date.now() + waitS * 1000;
            timeout = setTimeout(fire, waitS * 1000);
            ticker = setInterval(onChange, 1000);
            onChange();
            return waitS;
        },
        tryNow: fire,
        reset() {
            clear();
            attempt = 0;
            onChange();
        },
        stop() {
            clear();
            onChange();
        },
        get remainingS() {
            return deadline === null ? null : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        },
        get running() {
            return running;
        },
    };
}
