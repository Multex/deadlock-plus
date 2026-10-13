import type { ProvisionalMatch } from "@deadlock-plus/ipc-types/ProvisionalMatch";
import type { Match } from "./stats";

export function mergeProvisional(apiMatches: Match[], provisional: ProvisionalMatch[]): Match[] {
    const known = new Set(apiMatches.map((m) => m.matchId));
    const extra = new Map<number, Match>();
    for (const { capturedAt: _capturedAt, accountId: _accountId, ...rest } of provisional) {
        if (known.has(rest.matchId)) continue;
        extra.set(rest.matchId, { ...rest, rankDelta: null, provisional: true });
    }
    return [...apiMatches, ...extra.values()].sort((a, b) => a.startTime - b.startTime);
}

export const apiOnly = (matches: Match[]): Match[] => matches.filter((m) => !m.provisional);

export const forAccount = (provisional: ProvisionalMatch[], accountId: number): ProvisionalMatch[] =>
    provisional.filter((m) => accountId !== 0 && m.accountId === accountId);
