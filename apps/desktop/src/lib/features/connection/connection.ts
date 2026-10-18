import { t } from "$lib/core/i18n.svelte";
import type { BadgeVariant } from "@deadlock-plus/ui/badge.svelte";
import type { HistoryPoint } from "./types";

export const HISTORY_SHOWN = 300;

export function gapVariant(maxGapMs: number): BadgeVariant {
    if (maxGapMs < 100) return "success";
    if (maxGapMs < 250) return "warning";
    return "destructive";
}

export function lossVariant(lossPct: number): BadgeVariant {
    if (lossPct === 0) return "success";
    if (lossPct < 3) return "warning";
    return "destructive";
}

/** Appends `tail` to `history`, skipping points already held, and keeps the newest `HISTORY_SHOWN`. */
export function mergeTail(history: HistoryPoint[], tail: HistoryPoint[]): HistoryPoint[] {
    const lastT = history.at(-1)?.t ?? -1;
    const fresh = tail.filter((p) => p.t > lastT);
    if (fresh.length === 0) return history;
    const merged = history.concat(fresh);
    return merged.length > HISTORY_SHOWN ? merged.slice(-HISTORY_SHOWN) : merged;
}

export function appendPoint(history: HistoryPoint[], point: HistoryPoint): HistoryPoint[] {
    const next = history.concat(point);
    return next.length > HISTORY_SHOWN ? next.slice(-HISTORY_SHOWN) : next;
}

export function historySeries(history: HistoryPoint[]) {
    const shown = history.slice(-HISTORY_SHOWN);
    return {
        shown,
        series: [
            { label: t("connection.series.ping"), color: "var(--muted-foreground)", values: shown.map((p) => p.raw) },
        ],
    };
}

// `dp_helper::op::HELPER_OUT_OF_DATE`: the helper exe speaks another protocol version.
const HELPER_OUT_OF_DATE = "helper_out_of_date";

/** The trace failure as shown to the player. Other failures are already English sentences. */
export function traceErrorText(error: string): string {
    return error === HELPER_OUT_OF_DATE ? t("connection.notices.helper_out_of_date") : error;
}
