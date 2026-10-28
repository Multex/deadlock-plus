import { t } from "$lib/core/i18n.svelte";
import { command } from "$lib/core/tauri";
import { classifyApiFailure } from "$lib/features/api-health/busy";
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
        // A 404 and a busy answer are states of their own for the caller, so they stay typed.
        if (e instanceof DeadlockApiError && (e.status === 404 || classifyApiFailure(e).kind === "busy")) throw e;
        if (e instanceof DeadlockApiError) throw new Error(t("match_history.api_error", { status: e.status }));
        throw new Error(t("errors.common.network"));
    }
}

export const readProvisionalDetail = (matchId: number) => command<unknown | null>("get_postgame_detail", { matchId });
export const fetchValveDetail = (matchId: number) => command<unknown | null>("fetch_match_details", { matchId });
export const notifyBreakReminder = (lossStreak: number) => command("notify_break_reminder", { lossStreak });

export interface DetailSource {
    read(matchId: number): Promise<string | null>;
    write(matchId: number, json: string): Promise<void>;
    fetchText(matchId: number): Promise<string>;
    /** Captured post-game data, used only when the API has no usable match. */
    provisional?(matchId: number): Promise<unknown | null>;
    /** Details loaded from Valve with what Deadlock+ recorded for the match, when nothing else has it. */
    valve?(matchId: number): Promise<unknown | null>;
}

export const liveDetailSource: DetailSource = {
    read: readDetailCache,
    write: writeDetailCache,
    fetchText: (matchId) => fetchMetadata(matchId),
    provisional: readProvisionalDetail,
    valve: fetchValveDetail,
};

/** Set on a cached body Deadlock+ decoded from Valve's file itself, before the Deadlock API had the match. */
const LOCAL_MARK = "deadlock_plus_source";

interface Cached {
    detail: MatchDetail;
    local: boolean;
}

function parseBody(text: string | null, matchId: number): Cached | null {
    if (text === null) return null;
    try {
        const raw: unknown = JSON.parse(text);
        const local = typeof raw === "object" && raw !== null && LOCAL_MARK in raw;
        const detail = parseApiDetail(raw, local ? { source: "provisional" } : {});
        return detail?.matchId === matchId ? { detail, local } : null;
    } catch {
        return null;
    }
}

/**
 * Cache first; a missing, unreadable or unparseable cache entry falls through to one fetch, and so does an
 * entry Deadlock+ decoded itself, which is shown only when the fetch fails.
 * Resolves null when the API answers 404 and no captured data fits; rejects on any other failure
 * or when the fetched body is not a usable match.
 */
export async function resolveDetail(
    matchId: number,
    source: DetailSource = liveDetailSource,
): Promise<MatchDetail | null> {
    const cached = await source.read(matchId).catch(() => null);
    const hit = parseBody(cached, matchId);
    if (hit && !hit.local) return hit.detail;

    try {
        const text = await source.fetchText(matchId);
        const fetched = parseBody(text, matchId);
        if (!fetched) throw new Error(t("match_history.detail_invalid"));
        // Best-effort: a failed write only costs a refetch next time.
        await source.write(matchId, text).catch(() => {});
        return fetched.detail;
    } catch (apiError) {
        if (hit) return hit.detail;
        for (const fallback of [source.provisional, source.valve]) {
            const raw = await fallback?.(matchId).catch(() => null);
            const detail = raw ? parseApiDetail(raw, { source: "provisional" }) : null;
            if (detail?.matchId === matchId) return detail;
        }
        if (apiError instanceof DeadlockApiError && apiError.status === 404) return null;
        throw apiError;
    }
}
