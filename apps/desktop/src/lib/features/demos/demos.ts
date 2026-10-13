import type { DemoStatus } from "@deadlock-plus/ipc-types/DemoStatus";
import type { Demo } from "@deadlock-plus/ipc-types/Demo";
import type { DemoListing } from "@deadlock-plus/ipc-types/DemoListing";
import type { PlayerSummary } from "@deadlock-plus/ipc-types/PlayerSummary";
import type { MatchSummary } from "@deadlock-plus/ipc-types/MatchSummary";
import type { MetaResult } from "@deadlock-plus/ipc-types/MetaResult";
import type { RecycleAvailability } from "@deadlock-plus/ipc-types/RecycleAvailability";
import type { DeleteMode } from "@deadlock-plus/ipc-types/DeleteMode";
import type { DeletePreview } from "@deadlock-plus/ipc-types/DeletePreview";
import type { DeleteReport } from "@deadlock-plus/ipc-types/DeleteReport";
import type { CleanupRule } from "@deadlock-plus/ipc-types/CleanupRule";
import type { CleanupMatch } from "@deadlock-plus/ipc-types/CleanupMatch";
import { formatNumber, t, tn } from "$lib/core/i18n.svelte";
import { platform, trashName, type Platform } from "$lib/core/platform";

export type {
    DemoStatus,
    Demo,
    DemoListing,
    PlayerSummary,
    MatchSummary,
    MetaResult,
    RecycleAvailability,
    DeleteMode,
    DeletePreview,
    DeleteReport,
    CleanupRule,
    CleanupMatch,
};

export function statlockerMatchUrl(matchId: number): string {
    return `https://statlocker.gg/match/${matchId}/summary`;
}

/** `accountIds` is ordered by preference; the first account found in the match wins. */
export function myPlayer(summary: MatchSummary, accountIds: number[]): PlayerSummary | null {
    for (const id of accountIds) {
        const p = summary.players.find((x) => x.accountId === id);
        if (p) return p;
    }
    return null;
}

export function matchResult(summary: MatchSummary, accountIds: number[]): "win" | "loss" | null {
    const me = myPlayer(summary, accountIds);
    if (!me) return null;
    return me.team === summary.winningTeam ? "win" : "loss";
}

export function formatDuration(totalSeconds: number): string {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const sec = String(totalSeconds % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function formatBytes(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    const plain = { useGrouping: false };
    if (unit === 0) return `${formatNumber(value, plain)} B`;
    return `${formatNumber(value, { ...plain, minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${units[unit]}`;
}

export function statusInfo(status: DemoStatus): { label: string; hint: string } {
    switch (status) {
        case "complete":
            return { label: t("demos.status.complete.label"), hint: t("demos.status.complete.hint") };
        case "partial":
            return { label: t("demos.status.partial.label"), hint: t("demos.status.partial.hint") };
        case "outdated":
            return { label: t("demos.status.outdated.label"), hint: t("demos.status.outdated.hint") };
        case "unknown":
            return { label: t("demos.status.unknown.label"), hint: t("demos.status.unknown.hint") };
    }
}

export function totalSize(demos: Demo[]): number {
    return demos.reduce((sum, d) => sum + d.size, 0);
}

export function countByStatus(demos: Demo[]): Record<DemoStatus, number> {
    const counts: Record<DemoStatus, number> = { complete: 0, partial: 0, outdated: 0, unknown: 0 };
    for (const d of demos) counts[d.status]++;
    return counts;
}

export function deleteCopy(
    p: DeletePreview,
    os: Platform = platform,
): { title: string; canRecycle: boolean; notice: string | null } {
    const title = tn("demos.delete.title", p.count);
    if (p.recycle === "available") return { title, canRecycle: true, notice: null };
    const trash = trashName(os);
    if (p.recycle === "disabled") {
        return { title, canRecycle: false, notice: t("demos.delete.disabled", { trash }) };
    }
    const notice =
        p.binFreeBytes === null
            ? tn("demos.delete.too_large", p.count, { trash })
            : tn("demos.delete.too_large_room", p.count, {
                  trash,
                  needed: formatBytes(p.totalBytes),
                  free: formatBytes(p.binFreeBytes),
              });
    return { title, canRecycle: false, notice };
}

export function unpinnedNames(demos: Demo[], pinned: Set<number>): string[] {
    return demos.filter((d) => !pinned.has(d.matchId)).map((d) => d.fileName);
}

const DEFAULT_RULES: CleanupRule[] = [
    { id: 1, enabled: false, kind: "olderThanDays", days: 30 },
    { id: 2, enabled: false, kind: "largerThanMb", mb: 1024 },
    { id: 3, enabled: false, kind: "outdated" },
    { id: 4, enabled: false, kind: "partial" },
];

/** The dialog offers one rule per kind; saved values win over the defaults. */
export function withAllRules(saved: CleanupRule[]): CleanupRule[] {
    return DEFAULT_RULES.map((fallback) => saved.find((r) => r.kind === fallback.kind) ?? { ...fallback });
}

export function ruleLabel(rule: CleanupRule): string {
    switch (rule.kind) {
        case "olderThanDays":
            return tn("demos.cleanup.rule_older_than_days", rule.days);
        case "largerThanMb":
            return rule.mb >= 1024 && rule.mb % 1024 === 0
                ? t("demos.cleanup.rule_larger_gb", { size: formatNumber(rule.mb / 1024) })
                : t("demos.cleanup.rule_larger_mb", { size: formatNumber(rule.mb) });
        case "outdated":
            return t("demos.cleanup.rule_outdated");
        case "partial":
            return t("demos.cleanup.rule_partial");
    }
}

export function gbToMb(gb: number): number {
    return Number.isFinite(gb) ? Math.max(1, Math.round(gb * 1024)) : 1;
}

export function mbToGb(mb: number): number {
    return mb / 1024;
}

export function matchesTotal(matches: { size: number }[]): { count: number; bytes: number } {
    return { count: matches.length, bytes: matches.reduce((sum, m) => sum + m.size, 0) };
}
