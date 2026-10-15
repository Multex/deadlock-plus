import { DEFAULT_FILTERS, filterRows, type RowFilters } from "@deadlock-plus/match/filters";
import { toRow } from "@deadlock-plus/match/list";
import { groupSessions, type Session } from "@deadlock-plus/stats/sessions";
import type { Match } from "@deadlock-plus/stats/stats";

export const LOSS_STREAK = 3;

type ModeScope = Pick<RowFilters, "mode" | "custom">;

/** Sessions of the games a mode filter shows; bots, and customs unless asked for, never count. */
export function modeSessions(matches: Match[], { mode, custom }: ModeScope = DEFAULT_FILTERS): Session[] {
    const ids = new Set(filterRows(matches.map(toRow), { ...DEFAULT_FILTERS, mode, custom }, 0).map((r) => r.matchId));
    return groupSessions(matches.filter((m) => ids.has(m.matchId)));
}
