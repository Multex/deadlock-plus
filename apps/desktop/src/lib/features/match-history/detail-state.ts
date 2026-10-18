import type { OwnRecovery } from "@deadlock-plus/ipc-types/OwnRecovery";
import { SECONDS_PER_MATCH } from "$lib/features/gc/recovery-view";

const REPLAY_DAYS = 30;
const DAY_S = 86_400;
const MIN_ETA_S = 3;

export type RecoveryRun = Pick<OwnRecovery, "running" | "paused" | "queued" | "waiting" | "done" | "total">;

export interface DetailInputs {
    matchId: number;
    run: RecoveryRun | null;
    gameRunning: boolean | null;
    gcRecovery: boolean;
    matchIngest: boolean;
    /** When this match was first seen at the head of the queue, in epoch ms. */
    headSinceMs: number | null;
    nowMs: number;
}

export type RecoveringProgress =
    { kind: "eta"; secs: number } | { kind: "paused" } | { kind: "after_game" } | { kind: "limit"; until: number };

export type DetailState =
    | { kind: "recovering"; progress: RecoveringProgress; fraction: number }
    | { kind: "recover"; consent: boolean }
    | { kind: "open_in_game" }
    | { kind: "turn_on_sharing" };

export type ReplayState =
    { kind: "available"; daysLeft: number | null } | { kind: "not_yet" } | { kind: "expired" } | { kind: "none" };

export type Eta = { unit: "seconds" | "minutes"; count: number };

function headElapsedS(place: number, headSinceMs: number | null, nowMs: number): number {
    if (place !== 0 || headSinceMs === null) return 0;
    return Math.min(SECONDS_PER_MATCH, Math.max(0, (nowMs - headSinceMs) / 1000));
}

function progressOf(run: RecoveryRun, place: number, elapsedS: number): RecoveringProgress {
    if (run.paused) return { kind: "paused" };
    if (run.waiting?.reason === "game_open") return { kind: "after_game" };
    if (run.waiting?.reason === "daily_limit") return { kind: "limit", until: run.waiting.until };
    const secs = place * SECONDS_PER_MATCH + SECONDS_PER_MATCH - elapsedS;
    return { kind: "eta", secs: Math.max(MIN_ETA_S, Math.ceil(secs)) };
}

/** What the "Match details" row of a match the Deadlock API does not have offers next. */
export function detailState({
    matchId,
    run,
    gameRunning,
    gcRecovery,
    matchIngest,
    headSinceMs,
    nowMs,
}: DetailInputs): DetailState {
    const place = run && (run.running || run.paused) ? run.queued.indexOf(matchId) : -1;
    if (run && place >= 0) {
        const fetching = !run.paused && !run.waiting;
        const elapsedS = fetching ? headElapsedS(place, headSinceMs, nowMs) : 0;
        return {
            kind: "recovering",
            progress: progressOf(run, place, elapsedS),
            fraction: elapsedS / SECONDS_PER_MATCH,
        };
    }
    if (gameRunning === true) return { kind: matchIngest ? "open_in_game" : "turn_on_sharing" };
    return { kind: "recover", consent: !gcRecovery };
}

/** Replays are kept about 30 days, so an older match's replay counts as expired whatever the API says. */
export function replayState(
    matchId: number,
    startTime: number | null,
    withReplay: readonly number[] | null,
    nowS: number,
): ReplayState | null {
    if (!withReplay) return null;
    const ageS = startTime === null ? null : nowS - startTime;
    if (ageS !== null && ageS >= REPLAY_DAYS * DAY_S) return { kind: "expired" };
    if (withReplay.includes(matchId)) {
        return { kind: "available", daysLeft: ageS === null ? null : Math.ceil((REPLAY_DAYS * DAY_S - ageS) / DAY_S) };
    }
    return { kind: ageS === null ? "none" : "not_yet" };
}

export function etaParts(secs: number): Eta {
    return secs < 60 ? { unit: "seconds", count: secs } : { unit: "minutes", count: Math.round(secs / 60) };
}
