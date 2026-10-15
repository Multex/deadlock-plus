import { t } from "$lib/core/i18n.svelte";
import { command } from "$lib/core/tauri";
import { createDeadlockApi, DeadlockApiError } from "@deadlock-plus/deadlock-api";
import { parseApiDetail } from "@deadlock-plus/match/api-detail";
import type { MatchDetail } from "@deadlock-plus/match/detail";

export const readDetailCache = (matchId: number) => command<string | null>("match_detail_cache_read", { matchId });
export const writeDetailCache = (matchId: number, json: string) =>
    command("match_detail_cache_write", { matchId, json });

export async function fetchMetadata(matchId: number, fetchFn: typeof fetch = fetch): Promise<string> {
    try {
        return await createDeadlockApi({ fetch: fetchFn }).matchMetadata(matchId);
    } catch (e) {
        if (e instanceof DeadlockApiError) throw new Error(t("match_history.api_error", { status: e.status }));
        throw new Error(t("errors.common.network"));
    }
}

export const readProvisionalDetail = (matchId: number) => command<unknown | null>("get_postgame_detail", { matchId });
export const notifyBreakReminder = (lossStreak: number) => command("notify_break_reminder", { lossStreak });

export interface DetailSource {
    read(matchId: number): Promise<string | null>;
    write(matchId: number, json: string): Promise<void>;
    fetchText(matchId: number): Promise<string>;
    /** Captured post-game data, used only when the API has no usable match. */
    provisional?(matchId: number): Promise<unknown | null>;
}

export const liveDetailSource: DetailSource = {
    read: readDetailCache,
    write: writeDetailCache,
    fetchText: (matchId) => fetchMetadata(matchId),
    provisional: readProvisionalDetail,
};

function parseBody(text: string | null, matchId: number): MatchDetail | null {
    if (text === null) return null;
    try {
        const detail = parseApiDetail(JSON.parse(text));
        return detail?.matchId === matchId ? detail : null;
    } catch {
        return null;
    }
}

/**
 * Cache first; a missing, unreadable or unparseable cache entry falls through to one fetch.
 * Rejects when the fetched body is not a usable match.
 */
export async function resolveDetail(matchId: number, source: DetailSource = liveDetailSource): Promise<MatchDetail> {
    const cached = await source.read(matchId).catch(() => null);
    const hit = parseBody(cached, matchId);
    if (hit) return hit;

    try {
        const text = await source.fetchText(matchId);
        const detail = parseBody(text, matchId);
        if (!detail) throw new Error(t("match_history.detail_invalid"));
        // Best-effort: a failed write only costs a refetch next time.
        await source.write(matchId, text).catch(() => {});
        return detail;
    } catch (apiError) {
        const captured = await source.provisional?.(matchId).catch(() => null);
        const detail = captured ? parseApiDetail(captured, { source: "provisional" }) : null;
        if (detail?.matchId === matchId) return detail;
        throw apiError;
    }
}
