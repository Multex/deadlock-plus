import { classifyApiFailure } from "./busy";
import { createRetryTimer, type RetryTimer } from "./retry-timer";

/**
 * A load's "the Deadlock API is busy" state: set by a 429 or 503, it retries the load on its own after the
 * API's wait, backing off while the API stays busy, until a load succeeds or fails another way.
 */
export class ApiBusy {
    active = $state(false);
    /** Seconds until the next try; null while a try is running. */
    remainingS = $state<number | null>(null);

    private timer: RetryTimer;

    constructor(retry: () => unknown) {
        this.timer = createRetryTimer({ run: retry, onChange: () => (this.remainingS = this.timer.remainingS) });
    }

    /** True when `e` is a busy answer, which this now retries; any other failure ends the busy state. */
    handle(e: unknown): boolean {
        const failure = classifyApiFailure(e);
        if (failure.kind !== "busy") {
            this.clear();
            return false;
        }
        this.wait(failure.retryAfterS);
        return true;
    }

    /** For a caller that learns the API is busy some other way than a failed request of its own. */
    wait(retryAfterS: number | null): void {
        this.active = true;
        this.timer.schedule(retryAfterS);
    }

    clear(): void {
        this.active = false;
        this.timer.reset();
    }

    tryNow(): void {
        this.timer.tryNow();
    }
}
