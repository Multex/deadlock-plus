import { command } from "$lib/core/tauri";
import type { MatchPingSeries } from "@deadlock-plus/ipc-types/MatchPingSeries";
import type { EnginePingView, HistoryPoint, NetworkPoll, NetworkSnapshot, PingSummary } from "./types";

/** `allowPrompt` says the user asked for it, so the system may ask for a password. */
export function startNetworkMonitor(allowPrompt = false) {
    return command<void>("start_network_monitor", { allowPrompt });
}

export function networkSnapshot() {
    return command<NetworkSnapshot>("network_snapshot");
}

export function networkHistory() {
    return command<HistoryPoint[]>("network_history");
}

/** Direct ping over `[startMs, endMs]`, read from the full on-disk log. */
export function networkHistoryRange(startMs: number, endMs: number) {
    return command<PingSummary | null>("network_history_range", { startMs, endMs });
}

/** Raw pings over `[startMs, endMs]`, thinned on the Rust side to at most `maxPoints`. */
export function networkHistoryPoints(startMs: number, endMs: number, maxPoints: number) {
    return command<HistoryPoint[]>("network_history_points", { startMs, endMs, maxPoints });
}

/** The ping curve recorded for one match, thinned to at most `maxPoints`; `null` when none was recorded. */
export function matchPingPoints(matchId: number, maxPoints: number) {
    return command<MatchPingSeries | null>("match_ping_points", { matchId, maxPoints });
}

/** Current snapshot plus the history points newer than `sinceT`, in one call. */
export async function networkPoll(sinceT: number | null): Promise<NetworkPoll> {
    const poll = await command<unknown>("network_poll", { sinceT });
    if (!isPoll(poll)) throw new Error("network_poll answered an unexpected shape");
    return poll;
}

const isPoll = (value: unknown): value is NetworkPoll =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as NetworkPoll).snapshot === "object" &&
    (value as NetworkPoll).snapshot !== null &&
    Array.isArray((value as NetworkPoll).tail);

/** The game's own ping, loss and jitter to the match server; `null` outside a match or when unreadable. */
export function enginePingLatest() {
    return command<EnginePingView | null>("engine_ping_latest");
}
