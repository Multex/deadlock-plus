import { command } from "$lib/core/tauri";

import type { GcStatus } from "@deadlock-plus/ipc-types/GcStatus";

export const gcStatus = () => command<GcStatus>("gc_status");
export const recoverOwnMatches = () => command("recover_own_matches");
export const cancelOwnMatchRecovery = () => command("cancel_own_match_recovery");
