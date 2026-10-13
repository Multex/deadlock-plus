import { matchPingPoints, networkHistoryPoints, networkHistoryRange } from "$lib/features/connection/api";
import type { MatchPingSeries } from "@deadlock-plus/ipc-types/MatchPingSeries";
import type { PingSource } from "@deadlock-plus/match/ping";

export const livePingSource: PingSource = {
    summary: networkHistoryRange,
    points: networkHistoryPoints,
    series: matchPingPoints,
};

export function sourceLabelKey(source: MatchPingSeries["source"] | null) {
    if (source === "engine") return "match_history.ping.source_engine";
    if (source === "icmp") return "match_history.ping.source_icmp";
    return "match_history.ping.source";
}
