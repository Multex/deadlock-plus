import { toast } from "svelte-sonner";
import { failureText } from "$lib/core/errors";
import { t } from "$lib/core/i18n.svelte";
import { showOverlayTest } from "./api";

/** Asks the overlay for a sample notification and tells the player when none appears. */
export async function runOverlayTest(): Promise<void> {
    try {
        await showOverlayTest();
    } catch (e) {
        toast.error(failureText(e, t("settings.notifications.overlay_test_failed")));
    }
}
