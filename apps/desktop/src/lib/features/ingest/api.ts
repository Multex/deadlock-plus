import { command } from "$lib/core/tauri";

import type { IngestStatus } from "@deadlock-plus/ipc-types/IngestStatus";

export const ingestStatus = () => command<IngestStatus>("ingest_status");
