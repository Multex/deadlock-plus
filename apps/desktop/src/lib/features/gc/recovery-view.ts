import type { LastRun } from "@deadlock-plus/ipc-types/LastRun";
import type { OwnRecovery } from "@deadlock-plus/ipc-types/OwnRecovery";
import type { OwnRecoveryOutcome } from "@deadlock-plus/ipc-types/OwnRecoveryOutcome";

export const SECONDS_PER_MATCH = 20;
export const DAILY_FETCH_LIMIT = 40;

export type RecoveryPhase = "idle" | "running" | "paused" | "waiting_game" | "waiting_limit" | "done";
export type RecoveryAction = "start" | "pause" | "resume" | "cancel";

export type AccountCard = {
    accountId: number;
    usedToday: number;
    limit: number;
    rateLimited: boolean;
};

export type RecoveryView = {
    phase: RecoveryPhase;
    actions: RecoveryAction[];
    done: number;
    total: number;
    etaSecs: number;
    accounts: AccountCard[];
    outcome: OwnRecoveryOutcome | null;
};

function phaseOf(own: OwnRecovery | null): RecoveryPhase {
    if (!own) return "idle";
    if (own.paused) return "paused";
    if (own.running) {
        if (own.waiting?.reason === "game_open") return "waiting_game";
        if (own.waiting?.reason === "daily_limit") return "waiting_limit";
        return "running";
    }
    return own.outcome ? "done" : "idle";
}

function actionsFor(phase: RecoveryPhase, missing: number): RecoveryAction[] {
    switch (phase) {
        case "paused":
            return ["resume", "cancel"];
        case "running":
        case "waiting_game":
        case "waiting_limit":
            return ["pause", "cancel"];
        case "idle":
        case "done":
            return missing > 0 ? ["start"] : [];
    }
}

function accountCards(own: OwnRecovery | null): AccountCard[] {
    return (own?.accounts ?? []).map((a) => ({
        accountId: a.accountId,
        usedToday: a.usedToday,
        limit: DAILY_FETCH_LIMIT,
        rateLimited: a.rateLimited,
    }));
}

export function recoveryView(own: OwnRecovery | null, missing: number): RecoveryView {
    const phase = phaseOf(own);
    const actions = actionsFor(phase, missing);
    const accounts = accountCards(own);
    if (!own || phase === "idle") {
        return {
            phase,
            actions,
            done: 0,
            total: missing,
            etaSecs: missing * SECONDS_PER_MATCH,
            accounts,
            outcome: null,
        };
    }
    return {
        phase,
        actions,
        done: own.done,
        total: own.total,
        etaSecs: own.etaSecs,
        accounts,
        outcome: own.outcome,
    };
}

export function durationParts(secs: number): { hours: number; minutes: number } {
    const total = Math.max(1, Math.round(secs / 60));
    return { hours: Math.floor(total / 60), minutes: total % 60 };
}

export type Ago = { unit: "now" } | { unit: "minutes" | "hours" | "days"; count: number } | { unit: "yesterday" };

export function agoParts(thenS: number, nowS: number): Ago {
    const secs = nowS - thenS;
    if (secs < 60) return { unit: "now" };
    if (secs < 3600) return { unit: "minutes", count: Math.floor(secs / 60) };
    if (secs < 86_400) return { unit: "hours", count: Math.floor(secs / 3600) };
    const days = Math.floor(secs / 86_400);
    return days === 1 ? { unit: "yesterday" } : { unit: "days", count: days };
}

export type LastRunEnding = "nothing_left" | "left" | "limit" | "failed";

export function lastRunEnding(last: LastRun): LastRunEnding {
    if (last.outcome === "failed") return "failed";
    if (last.outcome === "rate_limited") return "limit";
    return last.left === 0 ? "nothing_left" : "left";
}
