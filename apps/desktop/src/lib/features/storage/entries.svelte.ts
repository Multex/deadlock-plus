import { t } from "$lib/core/i18n.svelte";
import type { EntryInfo } from "./storage";

export class StorageList {
    entries = $state<EntryInfo[]>([]);
    loading = $state(true);
    error = $state<string | null>(null);

    constructor(private readonly read: () => Promise<EntryInfo[]>) {}

    /** Resolves true once the entries are in, so the caller can measure them. */
    async load(): Promise<boolean> {
        this.loading = true;
        this.error = null;
        try {
            this.entries = await this.read();
        } catch {
            this.error = t("storage.list_error");
            return false;
        } finally {
            this.loading = false;
        }
        return true;
    }
}
