import { createPoller } from "$lib/core/poller";
import { ingestStatus as fetchIngestStatus } from "./api";

import { ingestStatusView, type IngestStatusView } from "./status";
import type { IngestStatus } from "@deadlock-plus/ipc-types/IngestStatus";

export type { IngestStatusView };

const POLL_MS = 3000;

class IngestStatusStore {
    private raw = $state<IngestStatus | null>(null);

    /** The error text is rendered on read, so it follows the active language. */
    get status(): IngestStatusView | null {
        return this.raw ? ingestStatusView(this.raw) : null;
    }

    async refresh() {
        try {
            this.raw = await fetchIngestStatus();
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

export const ingestStatus = new IngestStatusStore();
