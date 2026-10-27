import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";
import type { ProvisionalMatch } from "./postgame-api";
import { stats } from "./stats.svelte";
import { matchHistory } from "$lib/features/match-history/history.svelte";
import StatsPage from "../../../routes/(app)/stats/+page.svelte";
import MatchHistoryPage from "../../../routes/(app)/match-history/+page.svelte";

const mocks = vi.hoisted(() => ({
    playerMatchHistory: vi.fn(),
    captured: [] as unknown[],
    // The store lives across tests; a fresh account per test makes it load again from scratch.
    account: { steamId32: 90_000 },
}));

vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async (name: string) => (name === "get_postgame_matches" ? mocks.captured : undefined)),
    fileSrc: (path: string) => path,
    listen: vi.fn(async () => () => {}),
}));
vi.mock("$lib/core/deadlock-api", () => ({
    deadlockApi: { playerMatchHistory: mocks.playerMatchHistory, playerRank: async () => null },
}));
vi.mock("$lib/core/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined }));
vi.mock("$lib/features/ranks/ranks", () => ({
    apiForm: (tiers: unknown[]) => tiers,
    loadApiRanks: async () => [],
    withLocalArt: async (tiers: unknown[]) => tiers,
}));
vi.mock("$lib/features/steam-account/account.svelte", () => ({
    steamAccount: { loaded: true, account: mocks.account },
}));

const answered = (body: unknown, status: number) => ({ ok: status < 400, status, body });
const FAULTS = {
    "503": () => Promise.resolve(answered(null, 503)),
    "429": () => Promise.resolve(answered({ type: "ip", remaining: 0, next_request_in: 12 }, 429)),
    drop: () => Promise.reject(new TypeError("Failed to fetch")),
} as const;
type Fault = keyof typeof FAULTS;
const busyFault = (fault: Fault) => fault !== "drop";

function capturedMatch(matchId: number): ProvisionalMatch {
    return {
        capturedAt: 0,
        accountId: mocks.account.steamId32,
        matchId,
        heroId: 1,
        startTime: Math.floor(Date.now() / 1000) - 3600,
        matchMode: 4,
        gameMode: 1,
        outcome: "win",
        kills: 3,
        deaths: 1,
        assists: 7,
        netWorth: 20000,
        durationS: 1800,
        rankBadge: 0,
        rankDelta: null,
        calibration: false,
        demotionProtected: false,
    };
}

async function renderAfterLoad(page: "stats" | "match-history", fault: Fault) {
    mocks.playerMatchHistory.mockImplementation(FAULTS[fault]);
    await stats.load(mocks.account.steamId32);
    return render(page === "stats" ? StatsPage : MatchHistoryPage).body;
}

const region = (name: string, state: "busy" | "error") => `data-region="${name}" data-region-state="${state}"`;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    vi.stubGlobal("window", { addEventListener: vi.fn() });
    mocks.playerMatchHistory.mockReset();
    mocks.captured = [];
    mocks.account.steamId32++;
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe.each(Object.keys(FAULTS) as Fault[])("an outage (%s) with nothing saved", (fault) => {
    const state = busyFault(fault) ? "busy" : "error";

    it("keeps the Stats frame and gives each section its own state", async () => {
        const body = await renderAfterLoad("stats", fault);
        expect(body).toContain("Stats");
        expect(body).toContain('id="rank-heading"');
        expect(body).toContain('id="games-heading"');
        expect(body).toContain(region("stats-rank", state));
        expect(body).toContain(region("stats-games", state));
        expect(body).not.toContain("Could not load your match history");
        expect(body).toContain(busyFault(fault) ? "Deadlock API is busy" : "Retry");
    });

    it("keeps the Match History frame and shows the state in the list", async () => {
        const body = await renderAfterLoad("match-history", fault);
        expect(body).toContain("Match History");
        expect(body).toContain(region("match-list", state));
        expect(body).not.toContain("Could not load your match history");
        expect(body).toContain(busyFault(fault) ? "Deadlock API is busy" : "Retry");
    });
});

describe.each(Object.keys(FAULTS) as Fault[])("an outage (%s) with a match captured on this PC", (fault) => {
    beforeEach(() => {
        mocks.captured = [capturedMatch(42)];
    });

    it("Stats still shows the captured games and keeps the rank state", async () => {
        const body = await renderAfterLoad("stats", fault);
        expect(body).not.toContain('data-region="stats-games"');
        expect(body).toContain("1 matches known for this account");
        expect(body).toContain(region("stats-rank", busyFault(fault) ? "busy" : "error"));
        expect(body).toContain(region("history-captured-only", busyFault(fault) ? "busy" : "error"));
    });

    it("Match History still lists the captured match", async () => {
        const body = await renderAfterLoad("match-history", fault);
        expect(body).not.toContain('data-region="match-list"');
        // Server rendering rebuilds the rows on every read, so the session list cannot match them by
        // identity here; the filter bar and the store's rows show the list branch is taken.
        expect(body).toContain('aria-label="Match filters"');
        expect(matchHistory.rows.map((r) => r.matchId)).toEqual([42]);
        expect(body).toContain(region("history-captured-only", busyFault(fault) ? "busy" : "error"));
    });
});
