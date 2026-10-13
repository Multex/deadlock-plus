import { APP_INVITE_CODE, SUPPORT_URL, inviteAppUrl, inviteUrl } from "@deadlock-plus/links";
import { toast } from "svelte-sonner";
import { errorText } from "$lib/core/errors";
import { t } from "$lib/core/i18n.svelte";
import { openUrl } from "$lib/core/opener";
import { trackDiscordInvite } from "$lib/features/telemetry/api";

export { SUPPORT_URL };
export const DISCORD_URL = inviteUrl(APP_INVITE_CODE);
export const DISCORD_APP_URL = inviteAppUrl(APP_INVITE_CODE);

/** The app link skips the browser. It fails when Discord is not installed, and the web invite takes over. */
export function openDiscord(): void {
    void openUrl(DISCORD_APP_URL)
        .catch(() => openUrl(DISCORD_URL))
        .then(() => trackDiscordInvite().catch(() => {}))
        .catch((e) => toast.error(t("common.open_link_failed", { error: errorText(e) })));
}

/** Takes no arguments on purpose: it is passed straight to click handlers, which hand it an event. */
export function openSupport(): void {
    void openUrl(SUPPORT_URL).catch((e) => toast.error(t("common.open_link_failed", { error: errorText(e) })));
}
