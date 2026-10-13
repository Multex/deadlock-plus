import { createPoller } from "$lib/core/poller";
import { presenceStatus as fetchPresenceStatus } from "./api";

import type { PresenceStatus } from "@deadlock-plus/ipc-types/PresenceStatus";

const POLL_MS = 3000;

class PresenceStatusStore {
    status = $state<PresenceStatus | null>(null);

    async refresh() {
        try {
            this.status = await fetchPresenceStatus();
        } catch {
            // Not running inside Tauri.
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

export const presenceStatus = new PresenceStatusStore();
