import { sharedMatches as fetchSharedMatches } from "./api";

import type { SharedMatch } from "@deadlock-plus/ipc-types/SharedMatch";

class SharedMatchesStore {
    matches = $state<SharedMatch[] | null>(null);
    failed = $state(false);

    async refresh() {
        try {
            const list = await fetchSharedMatches();
            if (!Array.isArray(list)) throw new Error("shared_matches returned an unexpected shape");
            this.matches = list;
            this.failed = false;
        } catch {
            this.failed = true;
        }
    }
}

export const sharedMatches = new SharedMatchesStore();
