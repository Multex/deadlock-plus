import { toast } from "svelte-sonner";
import { failureText } from "$lib/core/errors";
import { t } from "$lib/core/i18n.svelte";

export type RecoveryKind = "start" | "pause" | "resume" | "cancel" | "match" | "replay";

const FAILED: Record<RecoveryKind, string> = {
    start: "match_history.recovery.start_failed",
    pause: "match_history.recovery.pause_failed",
    resume: "match_history.recovery.resume_failed",
    cancel: "match_history.recovery.cancel_failed",
    match: "match_history.recovery.match_failed",
    replay: "match_history.recovery.replay_failed",
};

/** Runs a recovery action; a failure becomes one toast naming what could not be done. */
export async function runRecovery(kind: RecoveryKind, run: () => Promise<unknown>): Promise<boolean> {
    try {
        await run();
        return true;
    } catch (e) {
        toast.error(failureText(e, t(FAILED[kind])));
        return false;
    }
}
