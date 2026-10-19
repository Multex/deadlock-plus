import type { AccountProgress } from "@deadlock-plus/ipc-types/AccountProgress";
import type { DetailCoverage } from "@deadlock-plus/ipc-types/DetailCoverage";
import type { LastRun } from "@deadlock-plus/ipc-types/LastRun";
import type { OwnRecovery } from "@deadlock-plus/ipc-types/OwnRecovery";
import type { OwnRecoveryOutcome } from "@deadlock-plus/ipc-types/OwnRecoveryOutcome";
import type { StepProgress } from "@deadlock-plus/ipc-types/StepProgress";

import type { Handlers } from "../../backend";

/** How much of the demo clock one fetched match takes. */
export const STEP_MS = 4000;
const SECONDS_PER_MATCH = 20;
const DAILY_LIMIT = 40;
const LIMIT_WAIT_S = 14 * 3600;
const EXTRA_BASE = 980_000_000;
const EXTRA_REPLAYS = 500_000;
const DAY_S = 86_400;
const AGED_DAYS = 25;
/** How many of the newest history rows fall inside the 30 days the replay tile counts. */
export const RECENT_ROWS = 12;

export interface SeededRun {
    state: "running" | "paused" | "limit";
    /** Matches already finished; the run's first `done` matches. */
    done: number;
    total: number;
    /** How many of `total` are replays, fetched after every details match. */
    replays?: number;
    /** Fetches each account has spent today, in account order. */
    usedToday: readonly number[];
}

export interface RecoveryConfig {
    /** History rows that have no details on the API. */
    missing: number;
    /** Recent history rows with details that have no replay. */
    noReplay: number;
    /** History rows 21 to 30 days old with details and no replay, too old for Steam to hand the replay out. */
    agedNoReplay?: number;
    /** Saved Steam accounts that fetch. */
    accounts: number;
    gameOpen?: boolean;
    /** The background recovery setting; on when unset. */
    gcRecovery?: boolean;
    run?: SeededRun;
    lastRun?: { agoS: number; delivered: number; left: number; outcome: OwnRecoveryOutcome };
}

/** Whether a config shows recovery at all; the default one leaves every match whole and the panel hidden. */
export const showsRecovery = (config: RecoveryConfig) => config.missing > 0 || config.noReplay > 0 || !!config.run;

/**
 * Pushes every row past the newest `RECENT_ROWS` out of the last 30 days, a few days apart, so the replay
 * tile counts a dozen matches. The first `aged` of those rows land 21 to 30 days back instead. Rows stay
 * newest first.
 */
export function spreadStartTimes<T extends { start_time: number }>(rows: readonly T[], nowS: number, aged = 0): T[] {
    return rows.map((row, i) => {
        if (i < RECENT_ROWS) return row;
        const past = i - RECENT_ROWS;
        if (past < aged) return { ...row, start_time: nowS - (AGED_DAYS + past) * DAY_S };
        return { ...row, start_time: nowS - 31 * DAY_S - (past - aged) * 3.5 * DAY_S };
    });
}

/** What the shell module shares with the match detail module of one install. */
export interface RecoverySession {
    current?: { recovery(): Recovery; spreadTimes: boolean; agedRows: number };
}

export interface RecoveryDeps {
    now(): number;
    accountIds: readonly number[];
    /** The player's match ids, newest first. */
    matchIds: readonly number[];
}

export interface Recovery {
    status(): { ownRecovery: OwnRecovery | null; lastRun: LastRun | null };
    coverage(matchIds: readonly number[]): DetailCoverage;
    recover(matchIds: readonly number[], replayIds?: readonly number[], withHistory?: boolean): void;
    pause(): void;
    resume(): void;
    cancel(): void;
}

interface Account {
    accountId: number;
    used: number;
}

const unique = (ids: readonly number[]) => [...new Set(ids)];

/** `count` indices of `size`, spread evenly. */
const spread = (size: number, count: number) => Array.from({ length: count }, (_, k) => Math.floor((k * size) / count));

/** `ids` cut or padded with made-up ids after `base` to `count`. */
const padded = (ids: readonly number[], count: number, base: number) =>
    [...ids, ...Array.from({ length: Math.max(0, count - ids.length) }, (_, i) => base + 1 + i)].slice(0, count);

export function createRecovery(config: RecoveryConfig, deps: RecoveryDeps): Recovery {
    const { now, matchIds } = deps;
    const nowS = () => Math.floor(now() / 1000);

    const aged = matchIds.slice(RECENT_ROWS, RECENT_ROWS + (config.agedNoReplay ?? 0));
    const candidates = matchIds.filter((id) => !aged.includes(id));
    const missingIds = spread(candidates.length, config.missing).map((i) => candidates[i]!);
    const noDetails = new Set(missingIds);
    // The newest RECENT_ROWS rows are all under 21 days old, so Steam still hands out their replays.
    const recentWithDetails = matchIds.slice(0, RECENT_ROWS).filter((id) => !noDetails.has(id));
    const noReplay = new Set([
        ...spread(recentWithDetails.length, config.noReplay).map((i) => recentWithDetails[i]!),
        ...aged,
    ]);
    const historyDetails = () => matchIds.filter((id) => noDetails.has(id));
    const historyReplays = () => recentWithDetails.filter((id) => noReplay.has(id));

    const accounts: Account[] = deps.accountIds.slice(0, config.accounts).map((accountId) => ({ accountId, used: 0 }));
    let started = false;
    let running = false;
    let paused = false;
    let limitUntil: number | null = null;
    let details: number[] = [];
    let replays: number[] = [];
    let detailsDone = 0;
    let replaysDone = 0;
    let delivered = 0;
    let outcome: OwnRecoveryOutcome | null = null;
    // Fetched this run: their details and replays only show once it ends.
    let finished = new Set<number>();
    let lastTick = now();
    let lastRun: LastRun | null = config.lastRun
        ? {
              endedAt: nowS() - config.lastRun.agoS,
              delivered: config.lastRun.delivered,
              left: config.lastRun.left,
              outcome: config.lastRun.outcome,
          }
        : null;

    const seeded = config.run;
    if (seeded) {
        const replayCount = Math.min(seeded.replays ?? 0, seeded.total);
        const detailIds = padded(missingIds, seeded.total - replayCount, EXTRA_BASE);
        const replayIds = padded(historyReplays(), replayCount, EXTRA_BASE + EXTRA_REPLAYS);
        const all = [...detailIds, ...replayIds];
        const done = Math.min(seeded.done, all.length);
        detailsDone = Math.min(done, detailIds.length);
        replaysDone = done - detailsDone;
        details = detailIds.slice(detailsDone);
        replays = replayIds.slice(replaysDone);
        delivered = done;
        finished = new Set(all.slice(0, done));
        accounts.forEach((account, i) => (account.used = seeded.usedToday[i] ?? 0));
        started = true;
        running = true;
        paused = seeded.state === "paused";
        if (seeded.state === "limit") limitUntil = nowS() + LIMIT_WAIT_S;
    }

    const finish = (result: OwnRecoveryOutcome) => {
        lastRun = { endedAt: nowS(), delivered, left: details.length + replays.length, outcome: result };
        for (const id of finished) {
            noDetails.delete(id);
            noReplay.delete(id);
        }
        finished = new Set();
        details = [];
        replays = [];
        running = false;
        paused = false;
        limitUntil = null;
        outcome = result;
    };

    /** Puts `ids` first among the details matches; one queued for its replay moves over. */
    const enqueueFront = (ids: readonly number[]) => {
        const front = new Set(ids);
        details = [...front, ...details.filter((id) => !front.has(id))];
        replays = replays.filter((id) => !front.has(id));
    };

    /** Adds `ids` last among the details matches, skipping any already queued for details or fetched this run. */
    const enqueueBack = (ids: readonly number[]) => {
        for (const id of ids) {
            if (finished.has(id) || details.includes(id)) continue;
            replays = replays.filter((other) => other !== id);
            details.push(id);
        }
    };

    /** Adds `ids` for their replays. A details fetch brings the replay with it, so those are skipped. */
    const enqueueReplays = (ids: readonly number[]) => {
        for (const id of ids) if (!finished.has(id) && !details.includes(id) && !replays.includes(id)) replays.push(id);
    };

    const step = (): boolean => {
        const account = accounts.filter((a) => a.used < DAILY_LIMIT).sort((a, b) => a.used - b.used)[0];
        if (!account) {
            limitUntil = nowS() + LIMIT_WAIT_S;
            return false;
        }
        if (details.length > 0) {
            finished.add(details.shift()!);
            detailsDone++;
        } else {
            finished.add(replays.shift()!);
            replaysDone++;
        }
        account.used++;
        delivered++;
        if (details.length + replays.length === 0) finish("done");
        return running;
    };

    const advance = () => {
        const t = now();
        if (limitUntil !== null && nowS() >= limitUntil) {
            limitUntil = null;
            for (const account of accounts) account.used = 0;
        }
        if (!running || paused || config.gameOpen || limitUntil !== null) {
            lastTick = t;
            return;
        }
        const steps = Math.floor((t - lastTick) / STEP_MS);
        lastTick += steps * STEP_MS;
        for (let i = 0; i < steps && running; i++) if (!step()) break;
        if (!running || limitUntil !== null) lastTick = t;
    };

    const accountProgress = (): AccountProgress[] =>
        accounts.map((a) => ({
            accountId: a.accountId,
            delivered: a.used,
            usedToday: a.used,
            rateLimited: a.used >= DAILY_LIMIT,
        }));

    const stepProgress = (): StepProgress[] => {
        const steps: StepProgress[] = [
            { step: "details", done: detailsDone, total: detailsDone + details.length },
            { step: "replays", done: replaysDone, total: replaysDone + replays.length },
        ];
        return steps.filter((s) => s.total > 0);
    };

    const idle = (): OwnRecovery => ({
        running: false,
        paused: false,
        waiting: null,
        done: 0,
        total: 0,
        delivered: 0,
        failed: 0,
        queued: [],
        etaSecs: 0,
        accounts: accountProgress(),
        outcome: null,
        error: null,
        steps: [],
    });

    return {
        status() {
            advance();
            if (!started) return { ownRecovery: showsRecovery(config) ? idle() : null, lastRun };
            const waiting = config.gameOpen
                ? ({ reason: "game_open" } as const)
                : limitUntil !== null
                  ? ({ reason: "daily_limit", until: limitUntil } as const)
                  : null;
            const queued = [...details, ...replays];
            const done = detailsDone + replaysDone;
            return {
                ownRecovery: {
                    running,
                    paused,
                    waiting: running ? waiting : null,
                    done,
                    total: done + queued.length,
                    delivered,
                    failed: 0,
                    queued,
                    etaSecs: queued.length * SECONDS_PER_MATCH,
                    accounts: accountProgress(),
                    outcome,
                    error: null,
                    steps: stepProgress(),
                },
                lastRun,
            };
        },
        coverage(ids) {
            advance();
            const have = ids.filter((id) => !noDetails.has(id));
            return { withDetails: have, withReplay: have.filter((id) => !noReplay.has(id)) };
        },
        recover(ids, replayIds = [], withHistory = false) {
            advance();
            if (config.gameOpen && !running) throw { code: "gc.game_running", params: {} };
            if (!running) {
                started = true;
                running = true;
                paused = false;
                details = [];
                replays = [];
                detailsDone = 0;
                replaysDone = 0;
                delivered = 0;
                outcome = null;
                finished = new Set();
                lastTick = now();
            }
            enqueueFront(unique(ids));
            enqueueReplays(replayIds);
            if (withHistory) {
                enqueueBack(historyDetails());
                enqueueReplays(historyReplays());
            }
            if (details.length + replays.length === 0) finish("done");
        },
        pause() {
            advance();
            if (running) paused = true;
        },
        resume() {
            if (!running || !paused) return;
            paused = false;
            lastTick = now();
        },
        cancel() {
            advance();
            if (running) finish("stopped");
        },
    };
}

export function recoveryHandlers(of: () => Recovery): Handlers {
    const idsOf = (value: unknown) => (Array.isArray(value) ? value.map(Number) : []);
    return {
        match_detail_coverage: ({ matchIds }) => of().coverage(idsOf(matchIds)),
        recover_matches: ({ matchIds, replayIds, withHistory }) => {
            of().recover(idsOf(matchIds), idsOf(replayIds), withHistory === true);
            return null;
        },
        pause_match_recovery: () => (of().pause(), null),
        resume_match_recovery: () => (of().resume(), null),
        cancel_match_recovery: () => (of().cancel(), null),
    };
}

export const RECOVERY_PRESETS: Record<string, RecoveryConfig> = {
    default: { missing: 0, noReplay: 0, accounts: 1 },
    "recovery-missing": {
        missing: 28,
        noReplay: 0,
        accounts: 3,
        lastRun: { agoS: 24 * 3600, delivered: 22, left: 0, outcome: "done" },
    },
    "recovery-running": {
        missing: 28,
        noReplay: 0,
        accounts: 3,
        run: { state: "running", done: 12, total: 31, usedToday: [7, 5, 0] },
        lastRun: { agoS: 24 * 3600, delivered: 22, left: 0, outcome: "done" },
    },
    "recovery-paused": {
        missing: 28,
        noReplay: 0,
        accounts: 3,
        run: { state: "paused", done: 40, total: 100, usedToday: [20, 14, 6] },
        lastRun: { agoS: 3 * 24 * 3600, delivered: 22, left: 0, outcome: "done" },
    },
    "recovery-limit": {
        missing: 28,
        noReplay: 0,
        accounts: 3,
        run: { state: "limit", done: 120, total: 180, usedToday: [40, 40, 40] },
        lastRun: { agoS: 24 * 3600, delivered: 22, left: 0, outcome: "done" },
    },
    "recovery-gc-off": {
        gcRecovery: false,
        missing: 28,
        noReplay: 0,
        accounts: 3,
        lastRun: { agoS: 3 * 24 * 3600, delivered: 22, left: 0, outcome: "done" },
    },
    "recovery-replays": { missing: 0, noReplay: 3, accounts: 3 },
    "recovery-game-open": {
        missing: 28,
        noReplay: 0,
        accounts: 3,
        gameOpen: true,
        run: { state: "running", done: 12, total: 31, usedToday: [7, 5, 0] },
    },
    "recovery-replay-run": {
        missing: 20,
        noReplay: 3,
        agedNoReplay: 1,
        accounts: 3,
        run: { state: "running", done: 8, total: 23, replays: 2, usedToday: [5, 3, 0] },
    },
};
