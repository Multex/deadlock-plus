import { deadlockApi } from "$lib/core/deadlock-api";
import { createPoller } from "$lib/core/poller";
import { classifyHealth, healthFromFailure, type HealthResult } from "./health";

const POLL_MS = 60_000;
const TIMEOUT_MS = 10_000;

class ApiHealthStore {
    result = $state<HealthResult | null>(null);

    async refresh() {
        try {
            this.result = classifyHealth(await deadlockApi.health({ signal: AbortSignal.timeout(TIMEOUT_MS) }));
        } catch (e) {
            this.result = healthFromFailure(e);
        }
    }

    private poller = createPoller(() => this.refresh(), {
        intervalMs: POLL_MS,
        immediate: true,
        pauseWhenHidden: true,
    });

    start() {
        return this.poller.start();
    }
}

export const apiHealth = new ApiHealthStore();
