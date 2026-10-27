import { toast } from "svelte-sonner";
import { failureText } from "$lib/core/errors";
import { t } from "$lib/core/i18n.svelte";
import type { CleanupRule } from "./demos";

type CleanupStep = "load" | "save" | "check";

const FAILED: Record<CleanupStep, string> = {
    load: "demos.cleanup.load_failed",
    save: "demos.cleanup.save_failed",
    check: "demos.cleanup.check_failed",
};

export function cleanupFailed(error: unknown, step: CleanupStep) {
    toast.error(failureText(error, t(FAILED[step])));
}

/**
 * Saves the edited rules. When the save fails, the rules in effect are a copy of the stored ones,
 * so the dialog shows what the app will really use.
 */
export async function persistRules(
    edited: CleanupRule[],
    stored: CleanupRule[],
    save: (rules: CleanupRule[]) => Promise<unknown>,
): Promise<{ saved: boolean; rules: CleanupRule[] }> {
    try {
        await save(edited);
        return { saved: true, rules: edited };
    } catch (e) {
        cleanupFailed(e, "save");
        return { saved: false, rules: structuredClone(stored) };
    }
}
