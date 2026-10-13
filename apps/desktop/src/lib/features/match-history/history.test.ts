import { describe, expect, it, vi } from "vitest";
import type { Match } from "@deadlock-plus/stats/stats";
import { parseApiDetail } from "@deadlock-plus/match/api-detail";
import { allPlayers } from "@deadlock-plus/match/detail";
import fixture from "@deadlock-plus/match/fixtures/api-ranked.json";
import { MatchHistoryStore, type HistoryDeps } from "./history.svelte";

const detail = parseApiDetail(fixture)!;
const matchId = detail.matchId;

function match(id: number, over: Partial<Match> = {}): Match {
    return {
        matchId: id,
        heroId: 1,
        startTime: id,
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
        ...over,
    };
}

function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function store(over: Partial<HistoryDeps> = {}, matches: Match[] = []) {
    const deps: HistoryDeps = {
        source: { matches, status: "ready", error: null, load: vi.fn(async () => {}) },
        resolveDetail: vi.fn(async () => detail),
        resolveNames: vi.fn(async () => new Map<number, string>()),
        now: () => 1_000_000,
        ...over,
    };
    return { s: new MatchHistoryStore(deps), deps };
}

describe("list", () => {
    it("builds rows newest first from the stats matches and flags provisional ones", () => {
        const { s } = store({}, [match(1), match(3, { provisional: true }), match(2)]);
        expect(s.rows.map((r) => [r.matchId, r.source])).toEqual([
            [3, "provisional"],
            [2, "api"],
            [1, "api"],
        ]);
    });

    it("delegates loading to the stats store and mirrors its state", async () => {
        const { s, deps } = store();
        await s.load(7, true);
        expect(deps.source.load).toHaveBeenCalledWith(7, true);
        expect(s.status).toBe("ready");
        expect(s.error).toBeNull();
    });

    it("filters and paginates, and a filter change returns to page one", () => {
        const rows = Array.from({ length: 60 }, (_, i) => match(i + 1, { outcome: i % 2 ? "win" : "loss" }));
        const { s } = store({}, rows);
        expect(s.view.total).toBe(60);
        expect(s.view.pageCount).toBe(3);
        s.setPage(3);
        expect(s.view.page).toBe(3);
        s.setFilters({ outcome: "win" });
        expect(s.view.page).toBe(1);
        expect(s.view.total).toBe(30);
        expect(s.view.items.every((r) => r.outcome === "win")).toBe(true);
    });

    it("resets filters to the defaults", () => {
        const { s } = store({}, [match(1)]);
        s.setFilters({ heroId: 9 });
        s.resetFilters();
        expect(s.filters.heroId).toBeNull();
    });
});

describe("openDetail", () => {
    it("loads, names the players and settles ready", async () => {
        const first = allPlayers(detail)[0].accountId;
        const { s, deps } = store({ resolveNames: vi.fn(async () => new Map([[first, "Ann"]])) });
        const out = await s.openDetail(matchId);
        expect(s.detailStatus).toBe("ready");
        expect(out).toBe(s.detail);
        expect(allPlayers(out!).find((p) => p.accountId === first)?.name).toBe("Ann");
        expect(deps.resolveNames).toHaveBeenCalledWith(allPlayers(detail).map((p) => p.accountId));
    });

    it("shows the detail before names arrive", async () => {
        const names = deferred<Map<number, string>>();
        const { s } = store({ resolveNames: vi.fn(() => names.promise) });
        const pending = s.openDetail(matchId);
        await Promise.resolve();
        await Promise.resolve();
        expect(s.detailStatus).toBe("ready");
        expect(s.detail?.matchId).toBe(matchId);
        names.resolve(new Map());
        await pending;
    });

    it("keeps the detail when name resolution fails", async () => {
        const { s } = store({
            resolveNames: vi.fn(async () => {
                throw new Error("x");
            }),
        });
        expect(await s.openDetail(matchId)).not.toBeNull();
        expect(s.detailStatus).toBe("ready");
    });

    it("reports unavailable when there is only provisional data", async () => {
        const { s, deps } = store({ resolveDetail: vi.fn(async () => null) });
        expect(await s.openDetail(matchId)).toBeNull();
        expect(s.detailStatus).toBe("unavailable");
        expect(deps.resolveNames).not.toHaveBeenCalled();
    });

    it("reports a fetch failure as an error", async () => {
        const { s } = store({
            resolveDetail: vi.fn(async () => {
                throw new Error("HTTP 503");
            }),
        });
        expect(await s.openDetail(matchId)).toBeNull();
        expect(s.detailStatus).toBe("error");
        expect(s.detailError).toBe("HTTP 503");
        expect(s.detail).toBeNull();
    });

    it("lets only the newest open write state", async () => {
        const slow = deferred<typeof detail>();
        const other = { ...detail, matchId: matchId + 1 };
        const resolveDetail = vi.fn((id: number) => (id === matchId ? slow.promise : Promise.resolve(other)));
        const { s } = store({ resolveDetail });
        const first = s.openDetail(matchId);
        await s.openDetail(matchId + 1);
        slow.resolve(detail);
        await first;
        expect(s.detail?.matchId).toBe(matchId + 1);
        expect(s.detailMatchId).toBe(matchId + 1);
    });

    it("closes and ignores a late result", async () => {
        const slow = deferred<typeof detail>();
        const { s } = store({ resolveDetail: vi.fn(() => slow.promise) });
        const pending = s.openDetail(matchId);
        s.closeDetail();
        slow.resolve(detail);
        await pending;
        expect(s.detailStatus).toBe("idle");
        expect(s.detail).toBeNull();
    });
});
