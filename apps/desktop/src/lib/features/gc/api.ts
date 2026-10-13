import { command } from "$lib/core/tauri";

import type { GcStatus } from "@deadlock-plus/ipc-types/GcStatus";

export const gcStatus = () => command<GcStatus>("gc_status");
