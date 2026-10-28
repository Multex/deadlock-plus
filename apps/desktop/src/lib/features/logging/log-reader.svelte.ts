import { failureText } from "$lib/core/errors";
import { t } from "$lib/core/i18n.svelte";
import type { LogEntry } from "./logs";

export class LogReader {
    entries = $state<LogEntry[] | null>(null);
    failed = $state<string | null>(null);

    constructor(private readonly read: () => Promise<LogEntry[]>) {}

    async load() {
        try {
            this.entries = await this.read();
            this.failed = null;
        } catch (e) {
            this.entries = null;
            this.failed = failureText(e, t("logging.read_failed"));
        }
    }
}
