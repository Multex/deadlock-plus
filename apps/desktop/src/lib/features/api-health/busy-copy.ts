import { t } from "$lib/core/i18n.svelte";

/** The API-busy line: the wait while one is pending, else that a try is running now. */
export function busyText(remainingS: number | null): string {
    return remainingS === null || remainingS === 0
        ? t("api_busy.retrying")
        : t("api_busy.waiting", { seconds: remainingS });
}
