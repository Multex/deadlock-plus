import { describe, expect, it } from "vitest";
import catalog from "../../../../../../locales/app/en.json";
import { t } from "$lib/core/i18n.svelte";
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
        expect(view.lastError).toBe(catalog.errors.ingest.request_failed.replace("{status}", "503"));
    });

    it("names the upload when the error itself says nothing more", () => {
        const view = ingestStatusView(raw({ lastError: { code: "common.internal", params: {} } }));
        expect(view.lastError).toBe(t("settings.privacy.ingest_failed"));
    });
});
