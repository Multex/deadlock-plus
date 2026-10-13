export const RECONCILE_DELAYS_MS = [20_000, 45_000, 90_000, 180_000, 300_000];

export interface ReconcileScheduleOptions {
    run: () => Promise<void>;
    pending: () => boolean;
    delaysMs?: number[];
}

export function createReconcileSchedule({ run, pending, delaysMs = RECONCILE_DELAYS_MS }: ReconcileScheduleOptions) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let running = false;

    const clear = () => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
    };

    const schedule = () => {
        clear();
        if (!pending() || attempt >= delaysMs.length) return;
        timer = setTimeout(() => void tick(), delaysMs[attempt]);
    };

    const tick = async () => {
        clear();
        if (running) return;
        running = true;
        attempt++;
        try {
            await run();
        } catch {
            // Background retries stay quiet; the next attempt tries again.
        } finally {
            running = false;
        }
        schedule();
    };

    return {
        arrived() {
            attempt = 0;
            schedule();
        },
        focused() {
            if (!pending() || running) return;
            void tick();
        },
        stop() {
            clear();
            attempt = 0;
        },
    };
}
