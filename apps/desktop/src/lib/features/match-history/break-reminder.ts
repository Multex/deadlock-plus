import { DEFAULT_FILTERS, filterRows, type RowFilters } from "@deadlock-plus/match/filters";
import { toRow } from "@deadlock-plus/match/list";
import { groupSessions, scored, shouldSuggestBreak, type Session } from "@deadlock-plus/stats/sessions";
import type { Match } from "@deadlock-plus/stats/stats";

export const LOSS_STREAK = 3;

type ModeScope = Pick<RowFilters, "mode" | "custom">;

/** Sessions of the games a mode filter shows; bots, and customs unless asked for, never count. */
export function modeSessions(matches: Match[], { mode, custom }: ModeScope = DEFAULT_FILTERS): Session[] {
    const ids = new Set(filterRows(matches.map(toRow), { ...DEFAULT_FILTERS, mode, custom }, 0).map((r) => r.matchId));
    return groupSessions(matches.filter((m) => ids.has(m.matchId)));
}

function trailingLosses(session: Session): Match[] {
    const run: Match[] = [];
    for (const m of [...scored(session)].reverse()) {
        if (m.outcome !== "loss") break;
        run.unshift(m);
    }
    return run;
}

export interface BreakReminderDeps {
    now(): number;
    enabled(): boolean;
    notify(lossStreak: number): void;
}

/**
 * Returns an observer to call with the match list each time it changes. It notifies once per loss
 * streak, and only when the game that brought the streak to the limit ended after it was created.
 */
export function createBreakReminder(deps: BreakReminderDeps): (matches: Match[]) => void {
    const startedS = Math.floor(deps.now() / 1000);
    // A streak is identified by its games rather than its first one, so a missed loss that the API
    // fills in at its start later does not read as a new streak.
    let handled = new Set<number>();

    return (matches) => {
        const sessions = modeSessions(matches);
        if (!shouldSuggestBreak(sessions, LOSS_STREAK, Math.floor(deps.now() / 1000))) return;
        const run = trailingLosses(sessions.at(-1)!);
        if (run.some((m) => handled.has(m.matchId))) return;
        handled = new Set(run.map((m) => m.matchId));

        const limitGame = run[LOSS_STREAK - 1];
        if (limitGame.startTime + limitGame.durationS < startedS || !deps.enabled()) return;
        deps.notify(run.length);
    };
}
