import { SvelteSet } from "svelte/reactivity";
import { knownTotal, type EntryId, type EntryStats, type StatsById } from "./storage";

export type RowSize = "measuring" | "failed" | "measured";

export class StorageSizes {
    stats = $state<StatsById>({});
    // `$state` does not proxy a Set, so a plain one would never re-render a row that failed.
    readonly failed = new SvelteSet<EntryId>();

    readonly total = $derived(knownTotal(this.stats));
    readonly incomplete = $derived(this.failed.size > 0);

    readonly #read: (id: EntryId) => Promise<EntryStats>;

    constructor(read: (id: EntryId) => Promise<EntryStats>) {
        this.#read = read;
    }

    row(id: EntryId): RowSize {
        if (this.failed.has(id)) return "failed";
        return this.stats[id] === undefined ? "measuring" : "measured";
    }

    async measure(id: EntryId) {
        try {
            this.stats[id] = await this.#read(id);
            this.failed.delete(id);
        } catch {
            this.failed.add(id);
        }
    }

    forget(id: EntryId) {
        delete this.stats[id];
        this.failed.delete(id);
    }

    reset() {
        this.stats = {};
        this.failed.clear();
    }
}
