import { failureText } from "$lib/core/errors";
import { t, tn } from "$lib/core/i18n.svelte";
import { formatBytes } from "$lib/features/demos/demos";
import type { ClearReport, EntryId } from "./storage";

export interface ClearOutcome {
    freed: number;
    removed: number;
    failures: unknown[];
}

/** Clears each entry in turn; a clear that throws stops the rest, since the next one would likely fail the same way. */
export async function clearEntries(
    ids: EntryId[],
    clear: (id: EntryId) => Promise<ClearReport>,
): Promise<ClearOutcome> {
    const outcome: ClearOutcome = { freed: 0, removed: 0, failures: [] };
    for (const id of ids) {
        try {
            const report = await clear(id);
            outcome.freed += report.freedBytes;
            outcome.removed += report.removed;
            outcome.failures.push(...report.failed);
        } catch (e) {
            outcome.failures.push(e);
            break;
        }
    }
    return outcome;
}

export type ClearMessage = { kind: "success" | "info" | "error"; text: string };

export function clearMessages(outcome: ClearOutcome): ClearMessage[] {
    const messages: ClearMessage[] = [];
    const failed = outcome.failures.length;
    if (outcome.removed > 0)
        messages.push({ kind: "success", text: t("storage.toast.freed", { size: formatBytes(outcome.freed) }) });
    else if (failed === 0) messages.push({ kind: "info", text: t("storage.toast.nothing") });
    if (failed > 0)
        messages.push({
            kind: "error",
            text: failureText(outcome.failures[0], tn("storage.toast.clear_failed", failed)),
        });
    return messages;
}
