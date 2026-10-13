import { describe, expect, it } from "vitest";
import { ingestStatusView } from "./status";

import type { IngestStatus } from "@deadlock-plus/ipc-types/IngestStatus";

const raw = (over: Partial<IngestStatus> = {}): IngestStatus => ({
    running: true,
    steamFound: true,
    submitted: 2,
    lastError: null,
    ...over,
});

describe("ingestStatusView", () => {
    it("passes a clean status through with no error text", () => {
        expect(ingestStatusView(raw())).toEqual({ running: true, steamFound: true, submitted: 2, lastError: null });
    });

    it("renders the error code with its params", () => {
        const view = ingestStatusView(raw({ lastError: { code: "ingest.request_failed", params: { status: "503" } } }));
        expect(view.lastError).toBe("The Deadlock API request failed (HTTP 503).");
    });
});
