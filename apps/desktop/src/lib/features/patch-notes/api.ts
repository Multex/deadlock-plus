import { command } from "$lib/core/tauri";

import type { PatchDetail } from "@deadlock-plus/ipc-types/PatchDetail";
import type { PatchSearchResult } from "@deadlock-plus/ipc-types/PatchSearchResult";

export function searchPatchNotes(query: string) {
    return command<PatchSearchResult[]>("search_patch_notes", { query });
}

export function getPatchNotes(id: string) {
    return command<PatchDetail | null>("get_patch_notes", { id });
}
