import { errorText } from "$lib/core/errors";
import type { IngestStatus } from "@deadlock-plus/ipc-types/IngestStatus";

export type IngestStatusView = Omit<IngestStatus, "lastError"> & { lastError: string | null };

export function ingestStatusView(status: IngestStatus): IngestStatusView {
    return { ...status, lastError: status.lastError ? errorText(status.lastError) : null };
}
