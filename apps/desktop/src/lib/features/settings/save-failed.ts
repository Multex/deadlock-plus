import { toast } from "svelte-sonner";
import { failureText } from "$lib/core/errors";
import { t } from "$lib/core/i18n.svelte";

// One id so a slider dragged across many failing writes shows one toast, not one per step.
const SAVE_FAILED_TOAST = "settings-save-failed";

/** Tells the player a setting did not save and the control shows the stored value again. */
export function settingSaveFailed(error: unknown) {
    toast.error(failureText(error, t("settings.save_failed")), { id: SAVE_FAILED_TOAST });
}
