import { toast } from "svelte-sonner";
import { errorText } from "$lib/core/errors";
import { t } from "$lib/core/i18n.svelte";
import { openUrl } from "$lib/core/opener";

export const SUPPORT_URL = "https://ko-fi.com/flintsnow";
export const DISCORD_URL = "https://discord.gg/VM9utA3enT";

/** Takes no arguments on purpose: it is passed straight to click handlers, which hand it an event. */
export function openSupport(): void {
    void openUrl(SUPPORT_URL).catch((e) => toast.error(t("common.open_link_failed", { error: errorText(e) })));
}
