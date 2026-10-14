import { failureText } from "$lib/core/errors";
import { t } from "$lib/core/i18n.svelte";
import type { IngestStatus } from "@deadlock-plus/ipc-types/IngestStatus";

export type IngestStatusView = Omit<IngestStatus, "lastError"> & { lastError: string | null };

export function ingestStatusView(status: IngestStatus): IngestStatusView {
    return {
        ...status,
        lastError: status.lastError ? failureText(status.lastError, t("settings.privacy.ingest_failed")) : null,
    };
}
