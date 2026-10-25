import { editionKey, indexKey } from "@deadlock-plus/stats/dispatch/archive";
import type { DispatchIndex, Edition, EditionWindow, Enrichment } from "@deadlock-plus/stats/dispatch/types";
import { windowFor } from "@deadlock-plus/stats/dispatch/window";
import type { Match } from "@deadlock-plus/stats/stats";
import { describe, expect, it, vi, type Mock } from "vitest";
import { alertWhen, createDispatchService, type DispatchDeps } from "./service";

const ME = 1001;
const TZ = "UTC";
/** Wednesday 2026-10-28 12:00 UTC: last week is Mon 19 - Sun 25 October, last month is September. */
const NOW = Date.UTC(2026, 9, 28, 12) / 1000;
const oct = (day: number, hour = 18) => Date.UTC(2026, 9, day, hour) / 1000;
const week = (day: number): EditionWindow => windowFor("weekly", oct(day), TZ);

const match = (matchId: number, startTime: number, kills = 5): Match => ({
    matchId,
    heroId: 1 + (matchId % 3),
    startTime,
    matchMode: 1,
    gameMode: 1,
    outcome: matchId % 2 ? "win" : "loss",
    kills,
    deaths: 2,
    assists: 4,
    netWorth: 20_000,
    durationS: 1800,
    rankBadge: 0,
    rankDelta: null,
    calibration: false,
    demotionProtected: false,
});

/** Four matches last week, three the week before, one the week before that. */
const HISTORY: Match[] = [
    match(1, oct(5)),
    match(2, oct(12)),
    match(3, oct(13)),
    match(4, oct(14)),
    match(5, oct(19), 9),
    match(6, oct(20)),
    match(7, oct(21)),
    match(8, oct(22)),
];

const ENRICHED: Enrichment = {
    mates: [{ accountId: 7, name: "Mate", matches: 4, wins: 3 }],
    enemies: [],
    heroCombat: [],
    grades: [],
};

type FakeDeps = Omit<DispatchDeps, "history" | "enrich" | "notify"> & {
    history: Mock<DispatchDeps["history"]>;
    enrich: Mock<DispatchDeps["enrich"]>;
    notify: Mock<DispatchDeps["notify"]>;
};

function fakeDeps(over: Partial<FakeDeps> = {}, history: Match[] = HISTORY) {
    const store = new Map<string, string>();
    const kv = {
        get: vi.fn(async (key: string) => {
            const raw = store.get(key);
            return raw === undefined ? null : (JSON.parse(raw) as unknown);
        }),
        set: vi.fn(async (key: string, value: unknown) => {
            store.set(key, JSON.stringify(value));
        }),
    };
    const deps: FakeDeps = {
        nowS: () => NOW,
        tz: () => TZ,
        accountId: () => ME as number | null,
        history: vi.fn(async () => ({ matches: history as readonly Match[], live: true })),
        kv,
        enrich: vi.fn(async () => ENRICHED),
        notify: vi.fn(async () => {}),
        ...over,
    };
    const read = <T>(key: string) => {
        const raw = store.get(key);
        return raw === undefined ? null : (JSON.parse(raw) as T);
    };
    return {
        deps,
        kv,
        store,
        index: () => read<DispatchIndex>(indexKey(ME)),
        frozen: (id: string) => read<Edition>(editionKey(ME, id)),
    };
}

describe("issueDue", () => {
    it("issues, freezes and announces last week once", async () => {
        const f = fakeDeps();
        const issued = await createDispatchService(f.deps).issueDue();

        expect(issued.map((e) => [e.id, e.number, e.issuedAt])).toEqual([["weekly-2026-10-19", 1, NOW]]);
        expect(f.frozen("weekly-2026-10-19")).toEqual(issued[0]);
        expect(issued[0].mates).toEqual(ENRICHED.mates);
        expect(f.index()?.issued).toEqual([
            {
                id: "weekly-2026-10-19",
                kind: "weekly",
                number: 1,
                issuedAt: NOW,
                startS: week(19).startS,
                endS: week(19).endS,
                matches: 4,
                onRequest: false,
            },
        ]);
        expect(f.deps.notify.mock.calls).toEqual([["weekly"]]);
        const candidates = f.deps.enrich.mock.calls[0][2] as Match[];
        expect(candidates.map((m) => m.matchId)[0]).toBe(5);
        expect(candidates.length).toBe(3);
    });

    it("skips a closed window under three matches without a notification", async () => {
        const f = fakeDeps();
        await createDispatchService(f.deps).issueDue();
        expect(f.index()?.skipped).toEqual(["monthly-2026-09"]);
        expect(f.frozen("monthly-2026-09")).toBeNull();
        expect(f.deps.notify).not.toHaveBeenCalledWith("monthly");
    });

    it("skips last week when it holds two matches", async () => {
        const f = fakeDeps({}, HISTORY.slice(0, 6));
        expect(await createDispatchService(f.deps).issueDue()).toEqual([]);
        expect(f.index()?.skipped).toEqual(["weekly-2026-10-19", "monthly-2026-09"]);
        expect(f.deps.notify).not.toHaveBeenCalled();
        expect(f.deps.enrich).not.toHaveBeenCalled();
    });

    it("does nothing on a second run", async () => {
        const f = fakeDeps();
        const service = createDispatchService(f.deps);
        await service.issueDue();
        expect(await service.issueDue()).toEqual([]);
        expect(f.deps.notify).toHaveBeenCalledTimes(1);
        expect(f.deps.enrich).toHaveBeenCalledTimes(1);
    });

    it("does nothing on a later run from a fresh service over the same kv", async () => {
        const f = fakeDeps();
        await createDispatchService(f.deps).issueDue();
        expect(await createDispatchService(f.deps).issueDue()).toEqual([]);
        expect(f.deps.notify).toHaveBeenCalledTimes(1);
    });

    it("issues once when two runs overlap", async () => {
        const f = fakeDeps();
        const service = createDispatchService(f.deps);
        const [a, b] = await Promise.all([service.issueDue(), service.issueDue()]);
        expect(a.map((e) => e.id)).toEqual(["weekly-2026-10-19"]);
        expect(b).toBe(a);
        expect(f.deps.enrich).toHaveBeenCalledTimes(1);
        expect(f.index()?.issued.length).toBe(1);
    });

    it("still issues when every enrichment call failed", async () => {
        const nothing: Enrichment = { mates: null, enemies: null, heroCombat: null, grades: null };
        const f = fakeDeps({ enrich: vi.fn(async () => nothing) });
        const [edition] = await createDispatchService(f.deps).issueDue();
        expect(edition.id).toBe("weekly-2026-10-19");
        expect(edition.combat).toBeNull();
        expect(edition.mates).toEqual([]);
    });

    it("still issues when the enrichment throws", async () => {
        const f = fakeDeps({ enrich: vi.fn(async () => Promise.reject(new Error("down"))) });
        const [edition] = await createDispatchService(f.deps).issueDue();
        expect(edition.number).toBe(1);
        expect(edition.combat).toBeNull();
    });

    it("keeps the issue when the notification fails", async () => {
        const f = fakeDeps({ notify: vi.fn(async () => Promise.reject(new Error("no tauri"))) });
        const issued = await createDispatchService(f.deps).issueDue();
        expect(issued.length).toBe(1);
        expect(f.index()?.issued.length).toBe(1);
    });

    it("issues nothing while the account is unknown", async () => {
        const f = fakeDeps({ accountId: () => null });
        expect(await createDispatchService(f.deps).issueDue()).toEqual([]);
        expect(f.kv.set).not.toHaveBeenCalled();
    });

    it("issues nothing from a saved offline copy of the history", async () => {
        const f = fakeDeps({ history: vi.fn(async () => ({ matches: HISTORY, live: false })) });
        expect(await createDispatchService(f.deps).issueDue()).toEqual([]);
        expect(f.kv.set).not.toHaveBeenCalled();
    });
});

describe("alertWhen", () => {
    it("issues but does not announce while alerts are off", async () => {
        const send = vi.fn(async () => {});
        let on = false;
        const f = fakeDeps({ notify: vi.fn(alertWhen(() => on, send)) });
        const issued = await createDispatchService(f.deps).issueDue();
        expect(issued.length).toBe(1);
        expect(send).not.toHaveBeenCalled();

        on = true;
        await alertWhen(() => on, send)("monthly");
        expect(send.mock.calls).toEqual([["monthly"]]);
    });
});

describe("print", () => {
    it("prints a past window on request, numbered after the automatic one, with no notification", async () => {
        const f = fakeDeps();
        const service = createDispatchService(f.deps);
        await service.issueDue();
        const edition = await service.print(week(12));

        expect([edition?.id, edition?.number, edition?.issuedAt]).toEqual(["weekly-2026-10-12", 2, NOW]);
        expect(f.frozen("weekly-2026-10-12")).toEqual(edition);
        expect(f.index()?.issued.find((e) => e.id === "weekly-2026-10-12")?.onRequest).toBe(true);
        expect(f.deps.notify).toHaveBeenCalledTimes(1);
    });

    it("gives back the frozen edition when the window was already issued", async () => {
        const f = fakeDeps();
        const service = createDispatchService(f.deps);
        const [issued] = await service.issueDue();
        f.deps.enrich.mockClear();

        expect(await service.print(week(19))).toEqual(issued);
        expect(f.deps.enrich).not.toHaveBeenCalled();
        expect(f.index()?.issued.map((e) => [e.id, e.number, e.onRequest])).toEqual([["weekly-2026-10-19", 1, false]]);
    });

    it("is null under three matches and records nothing", async () => {
        const f = fakeDeps();
        expect(await createDispatchService(f.deps).print(week(5))).toBeNull();
        expect(f.frozen("weekly-2026-10-05")).toBeNull();
        expect(f.index()).toBeNull();
    });
});

describe("open", () => {
    it("returns the frozen edition and clears its badge", async () => {
        const f = fakeDeps();
        const service = createDispatchService(f.deps);
        const [issued] = await service.issueDue();
        expect((await service.view())?.unseen).toBe(1);

        expect(await service.open("weekly-2026-10-19")).toEqual(issued);
        expect(f.index()?.seen).toEqual(["weekly-2026-10-19"]);
        expect((await service.view())?.unseen).toBe(0);
    });

    it("is null for an edition that was never frozen", async () => {
        expect(await createDispatchService(fakeDeps().deps).open("weekly-2026-10-12")).toBeNull();
    });
});

describe("view", () => {
    it("lists closed windows newest first with their status", async () => {
        const f = fakeDeps();
        const service = createDispatchService(f.deps);
        await service.issueDue();
        const view = await service.view();

        expect(view?.shelf.weekly.map((e) => [e.window.id, e.status, e.matches, e.number, e.onRequest])).toEqual([
            ["weekly-2026-10-19", "issued", 4, 1, false],
            ["weekly-2026-10-12", "printable", 3, null, false],
            ["weekly-2026-10-05", "too_few", 1, null, false],
        ]);
        // The first row is in October, so no closed month reaches back to it.
        expect(view?.shelf.monthly).toEqual([]);
        expect(view?.latest.weekly?.id).toBe("weekly-2026-10-19");
        expect(view?.latest.monthly).toBeNull();
    });

    it("has no shelf without history", async () => {
        const view = await createDispatchService(fakeDeps({}, []).deps).view();
        expect(view?.shelf).toEqual({ weekly: [], monthly: [] });
    });

    it("has no edition so far under three matches this week", async () => {
        const f = fakeDeps({}, [...HISTORY, match(9, oct(26)), match(10, oct(27))]);
        const view = await createDispatchService(f.deps).view();
        expect(view?.soFar).toBeNull();
        expect(view?.soFarMatches).toBe(2);
    });

    it("builds this week so far from rows only", async () => {
        const f = fakeDeps({}, [...HISTORY, match(9, oct(26)), match(10, oct(27)), match(11, oct(28, 9))]);
        const view = await createDispatchService(f.deps).view();
        expect([view?.soFar?.id, view?.soFar?.number, view?.soFar?.issuedAt, view?.soFar?.combat]).toEqual([
            "weekly-2026-10-26",
            null,
            null,
            null,
        ]);
        expect(view?.soFarMatches).toBe(3);
        expect(f.deps.enrich).not.toHaveBeenCalled();
    });

    it("is null while the account is unknown", async () => {
        expect(await createDispatchService(fakeDeps({ accountId: () => null }).deps).view()).toBeNull();
    });
});
