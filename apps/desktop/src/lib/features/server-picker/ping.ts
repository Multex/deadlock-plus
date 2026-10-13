import { formatNumber, t } from "$lib/core/i18n.svelte";
import type { BadgeVariant } from "@deadlock-plus/ui/badge.svelte";

export function pingVariant(ms: number | null | undefined): BadgeVariant {
    if (ms == null) return "outline";
    if (ms <= 60) return "success";
    if (ms <= 120) return "warning";
    return "destructive";
}

/** `undefined` = not measured yet, `null` = measured but no reply after every retry. */
export function pingLabel(ms: number | null | undefined, pending: boolean): string {
    if (ms != null) return t("server_picker.ping.ms", { value: formatNumber(ms) });
    if (pending) return "...";
    return ms === null ? t("server_picker.ping.no_reply") : "—";
}
