import { afterEach, describe, expect, it } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { IDENTITY, MATCH_IDS, NOW_MS } from "./identity";
import { recoveryScenario } from "./index";
import { createRecovery, RECENT_ROWS, STEP_MS, type RecoveryConfig } from "./recovery";

const OPTIONS = { appVersion: "1.2.3", changelog: "# Changelog\n", mapItemsTsv: "" };
const ACCOUNTS = [1, 2, 3];
const NOW = 1_000_000_000_000;

const BASE: RecoveryConfig = { missing: 28, noReplay: 0, accounts: 3 };

function engine(config: Partial<RecoveryConfig> = {}) {
    let now = NOW;
    const recovery = createRecovery(
        { ...BASE, ...config },
        { now: () => now, accountIds: ACCOUNTS, matchIds: MATCH_IDS },
    );
    return {
        recovery,
        wait: (steps: number) => void (now += steps * STEP_MS),
    };
}

const syntheticIds = (count: number, from = 1) => Array.from({ length: count }, (_, i) => 970000000 + from + i);
const RUNNING = { state: "running", done: 12, total: 31, usedToday: [7, 5, 0] } as const;

describe("recovery state machine", () => {
    it("has no run and no missing details when nothing is missing", () => {
        const { recovery } = engine({ missing: 0 });
        expect(recovery.status().ownRecovery).toBeNull();
        const coverage = recovery.coverage([...MATCH_IDS]);
        expect(coverage.withDetails).toEqual([...MATCH_IDS]);
        expect(coverage.withReplay).toEqual([...MATCH_IDS]);
    });

    it("derives coverage from the rows: some lack details, some lack a replay", () => {
        const { recovery } = engine({ missing: 28, noReplay: 3 });
        const coverage = recovery.coverage([...MATCH_IDS]);
        expect(coverage.withDetails).toHaveLength(MATCH_IDS.length - 28);
        expect(coverage.withReplay).toHaveLength(MATCH_IDS.length - 28 - 3);
        for (const id of coverage.withReplay) expect(coverage.withDetails).toContain(id);
    });

    it("starts a run on the given ids and delivers one every step", () => {
        const { recovery, wait } = engine();
        const ids = syntheticIds(5);
        recovery.recover(ids);
        let run = recovery.status().ownRecovery!;
        expect(run).toMatchObject({ running: true, paused: false, waiting: null, done: 0, total: 5, delivered: 0 });
        expect(run.queued).toEqual(ids);
        expect(run.etaSecs).toBe(5 * 20);
        wait(2);
        run = recovery.status().ownRecovery!;
        expect(run).toMatchObject({ done: 2, delivered: 2, total: 5 });
        expect(run.queued).toEqual(ids.slice(2));
    });

    it("finishes with an outcome and a last run", () => {
        const { recovery, wait } = engine();
        recovery.recover(syntheticIds(2));
        wait(5);
        const { ownRecovery, lastRun } = recovery.status();
        expect(ownRecovery).toMatchObject({ running: false, outcome: "done", done: 2, delivered: 2, queued: [] });
        expect(lastRun).toMatchObject({ delivered: 2, left: 0, outcome: "done", endedAt: expect.any(Number) });
    });

    it("front-enqueues new ids in order, drops duplicates and grows the total", () => {
        const { recovery, wait } = engine();
        const ids = syntheticIds(5);
        recovery.recover(ids);
        wait(1);
        recovery.recover([ids[4]!, 970000100, 970000101]);
        const run = recovery.status().ownRecovery!;
        expect(run.queued).toEqual([ids[4], 970000100, 970000101, ids[1], ids[2], ids[3]]);
        expect(run.total).toBe(1 + 6);
        expect(run.done).toBe(1);
    });

    it("does nothing while paused and picks up again on resume", () => {
        const { recovery, wait } = engine();
        recovery.recover(syntheticIds(4));
        wait(1);
        recovery.pause();
        wait(10);
        expect(recovery.status().ownRecovery).toMatchObject({ running: true, paused: true, done: 1 });
        recovery.resume();
        wait(1);
        expect(recovery.status().ownRecovery).toMatchObject({ paused: false, done: 2 });
    });

    it("does not count the time spent paused as steps", () => {
        const { recovery, wait } = engine();
        recovery.recover(syntheticIds(10));
        recovery.pause();
        wait(10);
        recovery.resume();
        expect(recovery.status().ownRecovery!.done).toBe(0);
    });

    it("cancel stops the run and keeps what is left in the last run", () => {
        const { recovery, wait } = engine();
        recovery.recover(syntheticIds(6));
        wait(2);
        recovery.cancel();
        const { ownRecovery, lastRun } = recovery.status();
        expect(ownRecovery).toMatchObject({ running: false, outcome: "stopped", queued: [] });
        expect(lastRun).toMatchObject({ delivered: 2, left: 4, outcome: "stopped" });
        wait(5);
        expect(recovery.status().ownRecovery!.done).toBe(2);
    });

    it("waits on the daily limit once every account has used 40 fetches", () => {
        const { recovery, wait } = engine();
        recovery.recover(syntheticIds(130));
        wait(200);
        const run = recovery.status().ownRecovery!;
        expect(run.delivered).toBe(120);
        expect(run.queued).toHaveLength(10);
        expect(run.waiting).toEqual({ reason: "daily_limit", until: expect.any(Number) });
        for (const [i, account] of run.accounts.entries()) {
            expect(account).toMatchObject({ accountId: ACCOUNTS[i], usedToday: 40, delivered: 40, rateLimited: true });
        }
        if (run.waiting?.reason === "daily_limit") expect(run.waiting.until).toBeGreaterThan(Math.floor(NOW / 1000));
        expect(run.running).toBe(true);
    });

    it("spreads the fetches over the accounts", () => {
        const { recovery, wait } = engine();
        recovery.recover(syntheticIds(9));
        wait(9);
        const used = recovery.status().ownRecovery!.accounts.map((account) => account.usedToday);
        expect(used).toEqual([3, 3, 3]);
    });

    it("keeps delivered matches missing in the coverage until the run ends", () => {
        const { recovery, wait } = engine();
        const ids = [...MATCH_IDS];
        const missing = ids.filter((id) => !recovery.coverage(ids).withDetails.includes(id));
        recovery.recover(missing);
        wait(3);
        expect(recovery.coverage(missing).withDetails).toEqual([]);
        wait(40);
        expect(recovery.coverage(missing).withDetails).toEqual(missing);
    });

    it("refuses to start a run while the game is open", () => {
        const { recovery } = engine({ gameOpen: true });
        expect(() => recovery.recover(syntheticIds(2))).toThrow();
        try {
            recovery.recover(syntheticIds(2));
        } catch (error) {
            expect(error).toMatchObject({ code: "gc.game_running" });
        }
    });

    it("lists only the details step while no replay is queued", () => {
        const { recovery, wait } = engine();
        recovery.recover(syntheticIds(5));
        expect(recovery.status().ownRecovery!.steps).toEqual([{ step: "details", done: 0, total: 5 }]);
        wait(2);
        expect(recovery.status().ownRecovery!.steps).toEqual([{ step: "details", done: 2, total: 5 }]);
    });

    it("fetches replay ids after every details match and counts each step", () => {
        const { recovery, wait } = engine();
        const [a, b, c, r1, r2, r3] = syntheticIds(6);
        recovery.recover([a!, b!], [r1!, r2!]);
        let run = recovery.status().ownRecovery!;
        expect(run.queued).toEqual([a, b, r1, r2]);
        expect(run.steps).toEqual([
            { step: "details", done: 0, total: 2 },
            { step: "replays", done: 0, total: 2 },
        ]);
        wait(3);
        recovery.recover([c!], [r3!, r2!]);
        run = recovery.status().ownRecovery!;
        expect(run.queued).toEqual([c, r2, r3]);
        expect(run.steps).toEqual([
            { step: "details", done: 2, total: 3 },
            { step: "replays", done: 1, total: 3 },
        ]);
        expect(run).toMatchObject({ done: 3, total: 6 });
    });

    it("moves a match queued for its replay to the details step when asked for its details", () => {
        const { recovery } = engine();
        const [a, b] = syntheticIds(2);
        recovery.recover([], [a!, b!]);
        recovery.recover([a!], [a!]);
        const run = recovery.status().ownRecovery!;
        expect(run.queued).toEqual([a, b]);
        expect(run.steps).toEqual([
            { step: "details", done: 0, total: 1 },
            { step: "replays", done: 0, total: 1 },
        ]);
    });

    it("with the history, also queues the missing details and the recent matches without a replay", () => {
        const { recovery } = engine({ missing: 4, noReplay: 3, agedNoReplay: 1 });
        const ids = [...MATCH_IDS];
        const { withDetails, withReplay } = recovery.coverage(ids);
        const missing = ids.filter((id) => !withDetails.includes(id));
        const gaps = ids.slice(0, RECENT_ROWS).filter((id) => withDetails.includes(id) && !withReplay.includes(id));
        expect(missing).toHaveLength(4);
        expect(gaps).toHaveLength(3);

        recovery.recover([missing[2]!], [gaps[1]!], true);
        const run = recovery.status().ownRecovery!;
        expect(run.queued).toEqual([
            missing[2],
            ...missing.filter((id) => id !== missing[2]),
            gaps[1],
            gaps[0],
            gaps[2],
        ]);
        expect(run.steps).toEqual([
            { step: "details", done: 0, total: 4 },
            { step: "replays", done: 0, total: 3 },
        ]);
    });

    it("leaves a match 21 to 30 days old without a replay out of the history's replays", () => {
        const { recovery } = engine({ missing: 4, noReplay: 0, agedNoReplay: 1 });
        const aged = MATCH_IDS[RECENT_ROWS]!;
        const coverage = recovery.coverage([aged]);
        expect(coverage).toEqual({ withDetails: [aged], withReplay: [] });
        recovery.recover([], [], true);
        expect(recovery.status().ownRecovery!.queued).not.toContain(aged);
    });

    it("ends at once when there is nothing to fetch", () => {
        const { recovery } = engine({ missing: 0 });
        recovery.recover([], [], true);
        expect(recovery.status().ownRecovery).toMatchObject({ running: false, outcome: "done", total: 0 });
    });

    it("shows a recovered replay in the coverage once the run ends", () => {
        const { recovery, wait } = engine({ missing: 0, noReplay: 3 });
        const ids = [...MATCH_IDS];
        const gap = ids.find((id) => !recovery.coverage(ids).withReplay.includes(id))!;
        recovery.recover([], [gap]);
        expect(recovery.coverage([gap]).withReplay).toEqual([]);
        wait(2);
        expect(recovery.coverage([gap]).withReplay).toEqual([gap]);
    });

    it("seeds a run with both steps, the replays last", () => {
        const { recovery } = engine({
            missing: 20,
            noReplay: 3,
            run: { state: "running", done: 8, total: 23, replays: 2, usedToday: [5, 3, 0] },
        });
        const ids = [...MATCH_IDS];
        const { withDetails, withReplay } = recovery.coverage(ids);
        const gaps = ids.slice(0, RECENT_ROWS).filter((id) => withDetails.includes(id) && !withReplay.includes(id));
        const run = recovery.status().ownRecovery!;
        expect(run).toMatchObject({ running: true, done: 8, total: 23 });
        expect(run.steps).toEqual([
            { step: "details", done: 8, total: 21 },
            { step: "replays", done: 0, total: 2 },
        ]);
        expect(run.queued.slice(-2)).toEqual(gaps.slice(0, 2));
    });

    it("seeds a running, paused, limited or game-blocked run", () => {
        const running = engine({ run: RUNNING }).recovery.status();
        expect(running.ownRecovery).toMatchObject({ running: true, paused: false, done: 12, delivered: 12, total: 31 });
        expect(running.ownRecovery!.queued).toHaveLength(19);
        const paused = engine({ run: { state: "paused", done: 40, total: 100, usedToday: [20, 14, 6] } });
        expect(paused.recovery.status().ownRecovery).toMatchObject({ running: true, paused: true });
        const limit = engine({ run: { state: "limit", done: 120, total: 180, usedToday: [40, 40, 40] } });
        expect(limit.recovery.status().ownRecovery!.waiting).toMatchObject({ reason: "daily_limit" });
        const open = engine({ gameOpen: true, run: RUNNING });
        expect(open.recovery.status().ownRecovery!.waiting).toEqual({ reason: "game_open" });
    });
});

describe("recovery scenarios", () => {
    const handles: DemoHandle[] = [];
    const start = (id: string) => {
        const handle = install(recoveryScenario(id, OPTIONS));
        handles.push(handle);
        return handle;
    };
    afterEach(() => {
        while (handles.length) handles.pop()!.uninstall();
    });
    const coverage = (handle: DemoHandle) =>
        handle.invoke("match_detail_coverage", { matchIds: [...MATCH_IDS] }) as {
            withDetails: number[];
            withReplay: number[];
        };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = (handle: DemoHandle) => handle.invoke("gc_status", {}) as any;

    it("recovery-missing has 28 matches without details and no run", () => {
        const handle = start("recovery-missing");
        expect(MATCH_IDS.length - coverage(handle).withDetails.length).toBe(28);
        expect(status(handle).ownRecovery).toMatchObject({
            running: false,
            paused: false,
            waiting: null,
            done: 0,
            total: 0,
            queued: [],
            outcome: null,
            error: null,
        });
        expect(status(handle).lastRun).toMatchObject({ delivered: 22, left: 0, outcome: "done" });
    });

    it("recovery-missing runs through the commands", () => {
        const handle = start("recovery-missing");
        const missing = [...MATCH_IDS].filter((id) => !coverage(handle).withDetails.includes(id));
        handle.invoke("recover_matches", { matchIds: missing });
        expect(status(handle).ownRecovery).toMatchObject({ running: true, total: 28 });
        handle.invoke("pause_match_recovery", {});
        expect(status(handle).ownRecovery.paused).toBe(true);
        handle.invoke("resume_match_recovery", {});
        handle.invoke("cancel_match_recovery", {});
        expect(status(handle).ownRecovery.outcome).toBe("stopped");
    });

    it("recovery-running, -paused, -limit and -game-open start inside a run", () => {
        expect(status(start("recovery-running")).ownRecovery).toMatchObject({ running: true, done: 12, total: 31 });
        expect(status(start("recovery-paused")).ownRecovery).toMatchObject({ running: true, paused: true });
        const limit = status(start("recovery-limit")).ownRecovery;
        expect(limit.waiting.reason).toBe("daily_limit");
        expect(limit.accounts.map((a: { usedToday: number }) => a.usedToday)).toEqual([40, 40, 40]);
        const open = start("recovery-game-open");
        expect(status(open).ownRecovery.waiting).toEqual({ reason: "game_open" });
        expect(open.invoke("is_game_running", {})).toBe(true);
    });

    it("recovery-gc-off turns the background recovery setting off", () => {
        const handle = start("recovery-gc-off");
        const settings = handle.invoke("kv_get", { store: "app-settings", key: "gcRecovery" });
        expect(settings).toBe(false);
        expect(MATCH_IDS.length - coverage(handle).withDetails.length).toBeGreaterThan(0);
    });

    it("recovery-replays has details everywhere and recent matches without a replay", () => {
        const { withDetails, withReplay } = coverage(start("recovery-replays"));
        expect(withDetails).toHaveLength(MATCH_IDS.length);
        expect(withReplay.length).toBeLessThan(withDetails.length);
    });

    it("idle recovery scenarios list every saved account with its daily use", () => {
        for (const id of ["recovery-missing", "recovery-gc-off", "recovery-replays"]) {
            const { accounts } = status(start(id)).ownRecovery;
            expect(accounts).toHaveLength(3);
            for (const account of accounts) expect(account).toMatchObject({ usedToday: 0, rateLimited: false });
        }
    });

    it("a finished run leaves its accounts in the idle state", () => {
        const handle = start("recovery-missing");
        handle.invoke("recover_matches", { matchIds: [MATCH_IDS[0]], withHistory: false });
        handle.invoke("cancel_match_recovery", {});
        expect(status(handle).ownRecovery.accounts).toHaveLength(3);
    });

    it("recover_matches queues only the given ids without the history", () => {
        const handle = start("recovery-missing");
        const missing = [...MATCH_IDS].filter((id) => !coverage(handle).withDetails.includes(id));
        handle.invoke("recover_matches", { matchIds: missing.slice(0, 5), withHistory: false });
        expect(status(handle).ownRecovery).toMatchObject({ total: 5, queued: missing.slice(0, 5) });
    });

    it("recover_matches queues the replay ids after the match ids", () => {
        const handle = start("recovery-missing");
        const missing = [...MATCH_IDS].filter((id) => !coverage(handle).withDetails.includes(id));
        const replays = coverage(handle).withDetails.slice(0, 2);
        handle.invoke("recover_matches", { matchIds: missing.slice(0, 2), replayIds: replays, withHistory: false });
        expect(status(handle).ownRecovery).toMatchObject({ queued: [...missing.slice(0, 2), ...replays] });
    });

    const API = "https://api.deadlock-api.com";
    const metadataStatus = async (id: number) => (await fetch(`${API}/v1/matches/${id}/metadata`)).status;
    const history = async () =>
        (await (await fetch(`${API}/v1/players/90000001/match-history`)).json()) as {
            match_id: number;
            start_time: number;
        }[];
    const recent = (rows: { start_time: number }[]) =>
        rows.filter((row) => NOW_MS / 1000 - row.start_time < 30 * 86_400);

    it("answers 404 for the matches that lack details and 200 for the rest", async () => {
        const handle = start("recovery-missing");
        const { withDetails } = coverage(handle);
        const missing = [...MATCH_IDS].filter((id) => !withDetails.includes(id));
        expect(missing).toHaveLength(28);
        for (const id of missing) expect(await metadataStatus(id)).toBe(404);
        for (const id of withDetails.slice(0, 5)) expect(await metadataStatus(id)).toBe(200);
    });

    it("keeps answering 404 for queued matches until their run ends", async () => {
        const handle = start("recovery-missing");
        const missing = [...MATCH_IDS].filter((id) => !coverage(handle).withDetails.includes(id));
        handle.invoke("recover_matches", { matchIds: missing.slice(0, 2), withHistory: false });
        expect(await metadataStatus(missing[0]!)).toBe(404);
    });

    it("the default scenario answers 200 for every match", async () => {
        start("default");
        for (const id of MATCH_IDS.slice(0, 5)) expect(await metadataStatus(id)).toBe(200);
    });

    it.each(["recovery-missing", "recovery-replays"])("%s keeps 12 of 60 matches within 30 days", async (id) => {
        start(id);
        const rows = await history();
        expect(rows.map((row) => row.match_id)).toEqual([...MATCH_IDS]);
        const times = rows.map((row) => row.start_time);
        expect(times).toEqual([...times].sort((a, b) => b - a));
        expect(recent(rows)).toHaveLength(12);
    });

    it("recovery-replays shows 9 of 12 recent matches with a replay", async () => {
        const handle = start("recovery-replays");
        const have = new Set(coverage(handle).withReplay);
        const rows = recent(await history()) as unknown as { match_id: number }[];
        expect(rows).toHaveLength(12);
        expect(rows.filter((row) => have.has(row.match_id))).toHaveLength(9);
    });

    const DAY_S = 86_400;
    const ageDays = (row: { start_time: number }) => (NOW_MS / 1000 - row.start_time) / DAY_S;
    const metadata = async (id: number) =>
        (
            (await (await fetch(`${API}/v1/matches/${id}/metadata`)).json()) as {
                match_info: { start_time: number; players: { account_id: number }[] };
            }
        ).match_info;

    it("recovery-replays leaves recent own matches with details and no replay to recover", async () => {
        const handle = start("recovery-replays");
        const { withDetails, withReplay } = coverage(handle);
        const rows = await history();
        const gaps = rows.filter((row) => withDetails.includes(row.match_id) && !withReplay.includes(row.match_id));
        expect(gaps).toHaveLength(3);
        for (const row of gaps) {
            expect(ageDays(row)).toBeLessThan(21);
            const detail = await metadata(row.match_id);
            expect(ageDays(detail)).toBeLessThan(21);
            expect(detail.players.map((p) => p.account_id)).toContain(IDENTITY.accountId);
        }
    });

    it("recovery-replays recovers the recent replays from the panel's start", () => {
        const handle = start("recovery-replays");
        const { withReplay } = coverage(handle);
        const gaps = [...MATCH_IDS].filter((id) => !withReplay.includes(id));
        handle.invoke("recover_matches", { matchIds: [], replayIds: [], withHistory: true });
        expect(status(handle).ownRecovery).toMatchObject({ running: true, queued: gaps });
        expect(status(handle).ownRecovery.steps).toEqual([{ step: "replays", done: 0, total: 3 }]);
    });

    it("recovery-running counts its run as the details step", () => {
        expect(status(start("recovery-running")).ownRecovery.steps).toEqual([{ step: "details", done: 12, total: 31 }]);
    });

    it("recovery-replay-run starts inside a run with both steps", () => {
        const run = status(start("recovery-replay-run")).ownRecovery;
        expect(run).toMatchObject({ running: true, paused: false, waiting: null });
        expect(run.steps).toEqual([
            { step: "details", done: expect.any(Number), total: expect.any(Number) },
            { step: "replays", done: 0, total: 2 },
        ]);
        expect(run.steps[0].done).toBeLessThan(run.steps[0].total);
    });

    it("recovery-replay-run leaves one recent replay out of the run and has one too old to recover", async () => {
        const handle = start("recovery-replay-run");
        const { withDetails, withReplay } = coverage(handle);
        const { queued } = status(handle).ownRecovery;
        const rows = await history();
        expect(rows.map((row) => row.match_id)).toEqual([...MATCH_IDS]);
        const times = rows.map((row) => row.start_time);
        expect(times).toEqual([...times].sort((a, b) => b - a));
        const noReplay = rows.filter((row) => withDetails.includes(row.match_id) && !withReplay.includes(row.match_id));
        const recent = noReplay.filter((row) => ageDays(row) < 21);
        const aged = noReplay.filter((row) => ageDays(row) >= 21 && ageDays(row) < 30);
        expect(recent).toHaveLength(3);
        expect(recent.filter((row) => !queued.includes(row.match_id))).toHaveLength(1);
        expect(aged).toHaveLength(1);
        expect(ageDays(await metadata(aged[0]!.match_id))).toBeGreaterThanOrEqual(21);
        expect(queued).not.toContain(aged[0]!.match_id);
    });

    it("the default scenario keeps its match times", async () => {
        start("default");
        expect(recent(await history()).length).toBeGreaterThan(12);
    });

    it("the default scenario has nothing missing", () => {
        const handle = start("default");
        expect(coverage(handle)).toEqual({ withDetails: [...MATCH_IDS], withReplay: [...MATCH_IDS] });
        expect(status(handle)).toMatchObject({ ownRecovery: null, lastRun: null });
    });
});
