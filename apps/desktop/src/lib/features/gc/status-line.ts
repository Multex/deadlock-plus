import { errorText } from "$lib/core/errors";
import { formatDate, formatNumber, t, tn } from "$lib/core/i18n.svelte";
import { agoParts, lastRunEnding } from "./recovery-view";

import type { GcStatus } from "@deadlock-plus/ipc-types/GcStatus";
import type { LastRun } from "@deadlock-plus/ipc-types/LastRun";
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

const nowSecs = () => Date.now() / 1000;

export function ownRecoveryLine(own: OwnRecovery | null, nowS = nowSecs()): string {
    if (!own) return "";
    const left = formatNumber(Math.max(0, own.total - own.done));
    if (own.paused) return t("gc.own.paused", { left });
    if (own.running) {
        if (own.waiting?.reason === "game_open") return t("gc.own.waiting_game", { left });
        if (own.waiting?.reason === "daily_limit") {
            return t("gc.own.waiting_limit", { continues: continuesText(own.waiting.until, nowS) });
        }
        if (own.total === 0) return t("gc.own.reading_history");
        return t("gc.own.progress", { delivered: formatNumber(own.delivered), missing: formatNumber(own.total) });
    }
    const matches = tn("gc.own.matches", own.delivered);
    switch (own.outcome) {
        case "done":
            return own.total === 0 ? t("gc.own.nothing_missing") : t("gc.own.done", { matches });
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

function dayStart(secs: number): number {
    const d = new Date(secs * 1000);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function continuesText(until: number, nowS: number): string {
    const time = formatDate(until * 1000, { hour: "numeric", minute: "2-digit" });
    return dayStart(until) > dayStart(nowS)
        ? t("gc.own.continues_tomorrow", { time })
        : t("gc.own.continues_at", { time });
}

function agoText(thenS: number, nowS: number): string {
    const ago = agoParts(thenS, nowS);
    switch (ago.unit) {
        case "now":
            return t("gc.own.ago.now");
        case "yesterday":
            return t("gc.own.ago.yesterday");
        default:
            return tn(`gc.own.ago.${ago.unit}`, ago.count);
    }
}

export function lastRunLine(last: LastRun | null, nowS = nowSecs()): string {
    if (!last) return "";
    const params = {
        when: agoText(last.endedAt, nowS),
        delivered: formatNumber(last.delivered),
        left: formatNumber(last.left),
    };
    switch (lastRunEnding(last)) {
        case "failed":
            return t("gc.own.last_run_failed", params);
        case "limit":
            return t("gc.own.last_run_limit", params);
        case "nothing_left":
            return t("gc.own.last_run_nothing_left", params);
        case "left":
            return t("gc.own.last_run", params);
    }
}
