import { t } from "$lib/core/i18n.svelte";
import type { Highlight } from "@deadlock-plus/stats/sessions";

export function highlightTitle(h: Pick<Highlight, "kind" | "verdict"> | null): string {
    if (!h) return "";
    if (h.kind === "best") return t("sessions.highlight.best");
    return h.verdict === "excellent" ? t("sessions.highlight.excellent") : t("sessions.highlight.good");
}
