import { errorText } from "$lib/core/errors";
import { formatNumber, t, tn } from "$lib/core/i18n.svelte";
import type { GcStatus } from "@deadlock-plus/ipc-types/GcStatus";
import type { OwnRecovery } from "@deadlock-plus/ipc-types/OwnRecovery";

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

export function ownRecoveryLine(own: OwnRecovery | null): string {
    if (!own) return "";
    if (own.running) {
        if (own.missing === 0) {
            if (own.read === 0) return t("gc.own.reading_history");
            return t("gc.own.reading_history_count", { read: formatNumber(own.read) });
        }
        return t("gc.own.progress", { delivered: formatNumber(own.delivered), missing: formatNumber(own.missing) });
    }
    const matches = tn("gc.own.matches", own.delivered);
    switch (own.outcome) {
        case "done":
            return own.missing === 0 ? t("gc.own.nothing_missing") : t("gc.own.done", { matches });
        case "incomplete":
            return t("gc.own.incomplete", { matches, failed: formatNumber(own.failed) });
        case "rate_limited":
            return t("gc.own.rate_limited", { matches });
        case "stopped":
            return t("gc.own.stopped", { matches });
        case "failed":
            return own.error ? errorText(own.error) : "";
        default:
            return "";
    }
}
