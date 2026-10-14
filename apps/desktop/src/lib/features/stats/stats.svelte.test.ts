import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECONCILE_DELAYS_MS } from "@deadlock-plus/stats/reconcile-schedule";
import type { ProvisionalMatch } from "./postgame-api";

const ACCOUNT = 90210;

const mocks = vi.hoisted(() => ({
    playerMatchHistory: vi.fn(),
    playerRank: vi.fn(),
    kvGet: vi.fn(),
    kvSet: vi.fn(),
    captured: null as ((match: ProvisionalMatch) => void) | null,
}));

vi.mock("$lib/core/deadlock-api", () => ({
    deadlockApi: { playerMatchHistory: mocks.playerMatchHistory, playerRank: mocks.playerRank },
}));
vi.mock("$lib/core/kv", () => ({ kvGet: mocks.kvGet, kvSet: mocks.kvSet }));
vi.mock("$lib/features/ranks/ranks", () => ({
    apiForm: (tiers: unknown[]) => tiers,
    loadApiRanks: async () => [],
    withLocalArt: async (tiers: unknown[]) => tiers,
}));
vi.mock("./postgame-api", () => ({
    getPostgameMatches: async () => [],
    reconcilePostgameMatches: async () => 0,
    onPostgameMatch: async (handler: (match: ProvisionalMatch) => void) => {
        mocks.captured = handler;
        return () => {};
    },
}));

const row = (matchId: number) => ({ match_id: matchId, hero_id: 1, start_time: matchId, player_match_outcome: 1 });
const answered = (body: unknown, status = 200) => ({ ok: status < 400, status, body });
const dropped = () => Promise.reject(new TypeError("Failed to fetch"));

function capturedMatch(matchId: number): ProvisionalMatch {
    return {
        capturedAt: 0,
        accountId: ACCOUNT,
        matchId,
        heroId: 1,
        startTime: matchId,
        matchMode: 4,
        gameMode: 1,
        outcome: "win",
        kills: 0,
        deaths: 0,
        assists: 0,
        netWorth: 0,
        durationS: 1,
        rankBadge: 0,
        rankDelta: null,
        calibration: false,
        demotionProtected: false,
    };
}

async function freshStore() {
    vi.resetModules();
    return (await import("./stats.svelte")).stats;
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { addEventListener: vi.fn() });
    mocks.playerMatchHistory.mockReset();
    mocks.playerRank.mockReset().mockResolvedValue(null);
    mocks.kvGet.mockReset().mockResolvedValue(null);
    mocks.kvSet.mockReset().mockResolvedValue(undefined);
    mocks.captured = null;
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("a load that fails with no saved copy", () => {
    it("reports a dropped connection in the app's words, not the browser's", async () => {
        mocks.playerMatchHistory.mockImplementation(dropped);
        const stats = await freshStore();
        await stats.load(ACCOUNT);
        expect(stats.status).toBe("error");
        expect(stats.error).toBe("A network request failed. Check your connection and try again.");
    });

    it("names the status the API answered with", async () => {
        mocks.playerMatchHistory.mockResolvedValue(answered(null, 503));
        const stats = await freshStore();
        await stats.load(ACCOUNT);
        expect(stats.status).toBe("error");
        expect(stats.error).toBe("The Deadlock API returned an error (503).");
    });

    it("asks once per call, and again on a forced reload", async () => {
        mocks.playerMatchHistory.mockImplementation(dropped);
        const stats = await freshStore();
        await stats.load(ACCOUNT);
        expect(mocks.playerMatchHistory).toHaveBeenCalledTimes(1);

        mocks.playerMatchHistory.mockResolvedValue(answered([row(1)]));
        await stats.load(ACCOUNT, true);
        expect(stats.status).toBe("ready");
        expect(stats.matches.map((m) => m.matchId)).toEqual([1]);
    });
});

describe("an account change while a load is under way", () => {
    it("loads the new account once the first load has ended", async () => {
        let answerFirst!: (value: unknown) => void;
        mocks.playerMatchHistory.mockImplementation((accountId: number) =>
            accountId === ACCOUNT
                ? new Promise((resolve) => (answerFirst = resolve))
                : Promise.resolve(answered([row(7)])),
        );
        const stats = await freshStore();
        const first = stats.load(ACCOUNT);
        void stats.load(ACCOUNT + 1);
        answerFirst(answered([row(1)]));
        await first;

        expect(mocks.playerMatchHistory).toHaveBeenLastCalledWith(ACCOUNT + 1);
        expect(stats.status).toBe("ready");
        expect(stats.matches.map((m) => m.matchId)).toEqual([7]);
    });
});

describe("the background refresh after a captured match", () => {
    it("keeps what is shown when the request fails", async () => {
        mocks.playerMatchHistory.mockResolvedValue(answered([row(1)]));
        const stats = await freshStore();
        await stats.load(ACCOUNT);
        expect(stats.matches.map((m) => m.matchId)).toEqual([1]);

        mocks.playerMatchHistory.mockClear().mockImplementation(dropped);
        mocks.captured!(capturedMatch(2));
        await vi.advanceTimersByTimeAsync(RECONCILE_DELAYS_MS[0]);

        expect(mocks.playerMatchHistory).toHaveBeenCalledTimes(1);
        expect(stats.status).toBe("ready");
        expect(stats.error).toBeNull();
        expect(stats.cachedAt).toBeNull();
        expect(stats.matches.map((m) => m.matchId)).toEqual([1, 2]);
    });
});
