import type { AccountProgress } from "@deadlock-plus/ipc-types/AccountProgress";
import type { DetailCoverage } from "@deadlock-plus/ipc-types/DetailCoverage";
import type { LastRun } from "@deadlock-plus/ipc-types/LastRun";
import type { OwnRecovery } from "@deadlock-plus/ipc-types/OwnRecovery";
import type { OwnRecoveryOutcome } from "@deadlock-plus/ipc-types/OwnRecoveryOutcome";

import type { Handlers } from "../../backend";

/** How much of the demo clock one fetched match takes. */
export const STEP_MS = 4000;
const SECONDS_PER_MATCH = 20;
const DAILY_LIMIT = 40;
const LIMIT_WAIT_S = 14 * 3600;
const EXTRA_BASE = 980_000_000;
const DAY_S = 86_400;
/** How many of the newest history rows fall inside the 30 days the replay tile counts. */
export const RECENT_ROWS = 12;

export interface SeededRun {
    state: "running" | "paused" | "limit";
    /** Matches already finished; the run's first `done` matches. */
    done: number;
    total: number;
    /** Fetches each account has spent today, in account order. */
    usedToday: readonly number[];
}

export interface RecoveryConfig {
    /** History rows that have no details on the API. */
    missing: number;
    /** History rows with details that have no replay. */
    noReplay: number;
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
 * tile counts a dozen matches. Rows stay newest first.
 */
export function spreadStartTimes<T extends { start_time: number }>(rows: readonly T[], nowS: number): T[] {
    return rows.map((row, i) =>
        i < RECENT_ROWS ? row : { ...row, start_time: nowS - 31 * DAY_S - (i - RECENT_ROWS) * 3.5 * DAY_S },
    );
}

/** What the shell module shares with the match detail module of one install. */
export interface RecoverySession {
    current?: { recovery(): Recovery; spreadTimes: boolean };
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
    recover(matchIds: readonly number[]): void;
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

export function createRecovery(config: RecoveryConfig, deps: RecoveryDeps): Recovery {
    const { now, matchIds } = deps;
    const nowS = () => Math.floor(now() / 1000);

    const missingIds = spread(matchIds.length, config.missing).map((i) => matchIds[i]!);
    const noDetails = new Set(missingIds);
    const withDetails = matchIds.filter((id) => !noDetails.has(id));
    const recentWithDetails = withDetails.slice(0, RECENT_ROWS);
    const noReplay = new Set(spread(recentWithDetails.length, config.noReplay).map((i) => recentWithDetails[i]!));

    const accounts: Account[] = deps.accountIds.slice(0, config.accounts).map((accountId) => ({ accountId, used: 0 }));
    let started = false;
    let running = false;
    let paused = false;
    let limitUntil: number | null = null;
    let queue: number[] = [];
    let done = 0;
    let delivered = 0;
    let outcome: OwnRecoveryOutcome | null = null;
    let pending = new Set<number>();
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
        const all = [
            ...missingIds,
            ...Array.from({ length: Math.max(0, seeded.total - missingIds.length) }, (_, i) => EXTRA_BASE + 1 + i),
        ].slice(0, seeded.total);
        done = Math.min(seeded.done, all.length);
        delivered = done;
        queue = all.slice(done);
        pending = new Set(all.slice(0, done).filter((id) => noDetails.has(id)));
        accounts.forEach((account, i) => (account.used = seeded.usedToday[i] ?? 0));
        started = true;
        running = true;
        paused = seeded.state === "paused";
        if (seeded.state === "limit") limitUntil = nowS() + LIMIT_WAIT_S;
    }

    const finish = (result: OwnRecoveryOutcome) => {
        lastRun = { endedAt: nowS(), delivered, left: queue.length, outcome: result };
        for (const id of pending) noDetails.delete(id);
        pending = new Set();
        queue = [];
        running = false;
        paused = false;
        limitUntil = null;
        outcome = result;
    };

    const step = (): boolean => {
        const account = accounts.filter((a) => a.used < DAILY_LIMIT).sort((a, b) => a.used - b.used)[0];
        if (!account) {
            limitUntil = nowS() + LIMIT_WAIT_S;
            return false;
        }
        const id = queue.shift()!;
        account.used++;
        done++;
        delivered++;
        if (noDetails.has(id)) pending.add(id);
        if (queue.length === 0) finish("done");
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
            return {
                ownRecovery: {
                    running,
                    paused,
                    waiting: running ? waiting : null,
                    done,
                    total: done + queue.length,
                    delivered,
                    failed: 0,
                    queued: [...queue],
                    etaSecs: queue.length * SECONDS_PER_MATCH,
                    accounts: accountProgress(),
                    outcome,
                    error: null,
                },
                lastRun,
            };
        },
        coverage(ids) {
            advance();
            const have = ids.filter((id) => !noDetails.has(id));
            return { withDetails: have, withReplay: have.filter((id) => !noReplay.has(id)) };
        },
        recover(ids) {
            advance();
            if (config.gameOpen && !running) throw { code: "gc.game_running", params: {} };
            const front = unique(ids);
            if (!running) {
                started = true;
                running = true;
                paused = false;
                done = 0;
                delivered = 0;
                outcome = null;
                pending = new Set();
                queue = front;
                lastTick = now();
                return;
            }
            const first = new Set(front);
            queue = [...front, ...queue.filter((id) => !first.has(id))];
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
        recover_matches: ({ matchIds }) => {
            of().recover(idsOf(matchIds));
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
};
