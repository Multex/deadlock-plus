import { formatDate, t } from "$lib/core/i18n.svelte";
import type { Alert } from "@deadlock-plus/ipc-types/Alert";

export type { Alert };
export const unreadCount = (alerts: Alert[]): number => alerts.filter((a) => !a.read).length;

/** Routine posts stay quiet; anything else (matchmaking, major content) is called out. */
export function kindTone(kind: string): "routine" | "notable" {
    const k = kind.trim().toLowerCase();
    return k === "" || k === "patch notes" || k.startsWith("minor") ? "routine" : "notable";
}

/** Display label for a post's origin feed ("forum" or "steam", as reported by the backend). */
export function sourceLabel(source: string): string {
    return source === "steam" ? t("alerts.source.steam") : t("alerts.source.forum");
}

export function formatPublished(iso: string): string {
    const time = Date.parse(iso);
    if (Number.isNaN(time)) return "";
    return formatDate(time, { year: "numeric", month: "short", day: "numeric" });
}

/** Feed links come from a third party, so only plain web links are opened. */
export function safeExternalUrl(link: string): string | null {
    try {
        const u = new URL(link);
        return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
    } catch {
        return null;
    }
}

/** One key per search result. A patch can repeat a snippet (empty bullets, repeated lines), so repeats get a counter. */
export function searchResultKeys(results: { patchId: string; snippet: string }[]): string[] {
    const counts = new Map<string, number>();
    return results.map((r) => {
        const base = `${r.patchId.length}:${r.patchId}${r.snippet}`;
        const n = (counts.get(base) ?? 0) + 1;
        counts.set(base, n);
        return n === 1 ? base : `${base}#${n}`;
    });
}
