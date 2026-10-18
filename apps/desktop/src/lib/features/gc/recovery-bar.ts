import { formatNumber, t } from "$lib/core/i18n.svelte";
import { durationParts, recoveryView } from "./recovery-view";
import { ownRecoveryLine } from "./status-line";

import type { OwnRecovery } from "@deadlock-plus/ipc-types/OwnRecovery";

export type RecoveryBarItem = {
    key: string;
    params: Record<string, string>;
    title: string;
    percent: number | null;
    dim: boolean;
};

export function durationText(secs: number): string {
    const { hours, minutes } = durationParts(secs);
    if (hours === 0) return t("match_history.recovery.duration_minutes", { count: minutes });
    if (minutes === 0) return t("match_history.recovery.duration_hours", { count: hours });
    return t("match_history.recovery.duration_hours_minutes", { hours, minutes });
}

export function recoveryBarItem(own: OwnRecovery | null, nowS = Date.now() / 1000): RecoveryBarItem | null {
    const view = recoveryView(own, 0);
    if (view.phase === "idle" || view.phase === "done") return null;
    const percent = view.total === 0 ? null : (view.done / view.total) * 100;
    const title = ownRecoveryLine(own, nowS);
    switch (view.phase) {
        case "running":
            if (view.total === 0) {
                return { key: "shell.statusbar.recovery.reading", params: {}, title, percent, dim: false };
            }
            return {
                key: "shell.statusbar.recovery.running",
                params: { done: formatNumber(view.done), total: formatNumber(view.total) },
                title: t("match_history.recovery.eta_left", { time: durationText(view.etaSecs) }),
                percent,
                dim: false,
            };
        case "paused":
            return { key: "shell.statusbar.recovery.paused", params: {}, title, percent, dim: true };
        case "waiting_game":
            return { key: "shell.statusbar.recovery.waiting_game", params: {}, title, percent, dim: true };
        case "waiting_limit":
            return { key: "shell.statusbar.recovery.waiting_limit", params: {}, title, percent, dim: true };
    }
}
