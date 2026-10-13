import { createPoller } from "$lib/core/poller";
import { gcStatus as fetchGcStatus } from "./api";

import type { GcStatus } from "@deadlock-plus/ipc-types/GcStatus";

const POLL_MS = 3000;

class GcStatusStore {
    status = $state<GcStatus | null>(null);

    async refresh() {
        try {
            this.status = await fetchGcStatus();
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

export const gcStatus = new GcStatusStore();
