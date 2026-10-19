import { sharedMatches as fetchSharedMatches } from "./api";

import type { SharedMatch } from "@deadlock-plus/ipc-types/SharedMatch";

class SharedMatchesStore {
    matches = $state<SharedMatch[] | null>(null);

    async refresh() {
        try {
            this.matches = await fetchSharedMatches();
        } catch {
            // Not running inside Tauri.
        }
    }
}

export const sharedMatches = new SharedMatchesStore();
