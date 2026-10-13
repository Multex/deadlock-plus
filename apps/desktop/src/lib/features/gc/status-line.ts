import { errorText } from "$lib/core/errors";
import { formatNumber, t, tn } from "$lib/core/i18n.svelte";
import type { GcStatus } from "@deadlock-plus/ipc-types/GcStatus";

export function gcStatusLine(enabled: boolean, status: GcStatus | null): string {
    if (!enabled) return t("gc.status.off");
    if (!status) return "";
    if (status.accounts === 0) {
        return status.lastError ? errorText(status.lastError) : t("gc.status.looking_for_login");
    }
    if (status.lastError) return t("gc.status.last_pass_failed", { error: errorText(status.lastError) });
    return t("gc.status.using", {
        accounts: tn("gc.status.accounts", status.accounts),
        delivered: formatNumber(status.delivered),
    });
}
