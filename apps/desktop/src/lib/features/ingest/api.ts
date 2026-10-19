import { command } from "$lib/core/tauri";

import type { IngestStatus } from "@deadlock-plus/ipc-types/IngestStatus";
import type { SharedMatch } from "@deadlock-plus/ipc-types/SharedMatch";

export const ingestStatus = () => command<IngestStatus>("ingest_status");
export const sharedMatches = () => command<SharedMatch[]>("shared_matches");
