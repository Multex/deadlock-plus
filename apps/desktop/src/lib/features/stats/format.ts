import { formatDate, formatNumber, t, tn } from "$lib/core/i18n.svelte";
import type { Eta } from "@deadlock-plus/stats/climb";

export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export const pct = (v: number | null) =>
    v === null ? "-" : formatNumber(Math.round(v * 100) / 100, { style: "percent", maximumFractionDigits: 0 });

export const shortDay = (s: number) => formatDate(s * 1000, { day: "numeric", month: "short" });

export function etaText(e: Eta): string {
    if (e.daysLow === null) return t("rank.eta.not_climbing");
    if (e.daysHigh === null) return t("rank.eta.days_or_more", { low: e.daysLow });
    return e.daysLow === e.daysHigh
        ? tn("rank.eta.about", e.daysLow)
        : t("rank.eta.range", { low: e.daysLow, high: e.daysHigh });
}
