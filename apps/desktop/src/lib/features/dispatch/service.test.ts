import { editionKey, indexKey } from "@deadlock-plus/stats/dispatch/archive";
import type {
    DispatchIndex,
    Edition,
    EditionWindow,
    Enrichment,
    HeroCombat,
    PendingField,
} from "@deadlock-plus/stats/dispatch/types";
import { KNOWN_SEASONS } from "@deadlock-plus/stats/dispatch/seasons";
import { collectorsWindow, windowFor } from "@deadlock-plus/stats/dispatch/window";
import type { Match } from "@deadlock-plus/stats/stats";
import { describe, expect, it, vi, type Mock } from "vitest";
import { alertWhen, createDispatchService, historyStamp, type DispatchDeps } from "./service";

const ME = 1001;
const PLAYER = "Haze Main";
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

const SEASON_1 = KNOWN_SEASONS[0];
/** 2026-05-01 to the start of Beta Season 1. */
const SEASON_0 = { id: "season_0", name: "Preseason", startS: Date.UTC(2026, 4, 1) / 1000, endS: SEASON_1.startS };

/** `/v1/assets/ranked-seasons` as served: Beta Season 1 has a bogus second interval running to 2028. */
const RANKED_SEASONS = [
    {
        class_name: "season_1",
        name: "Beta Season 1",
        intervals: [
            { interval: 1, start_timestamp: SEASON_1.startS, end_timestamp: SEASON_1.endS },
            { interval: 2, start_timestamp: SEASON_1.endS, end_timestamp: 1_830_326_400 },
        ],
    },
];

const ENRICHED: Enrichment = {
    mates: [{ accountId: 7, name: "Mate", matches: 4, wins: 3 }],
    enemies: [],
    heroCombat: [],
    grades: [],
};

type FakeDeps = Omit<DispatchDeps, "history" | "enrich" | "notify" | "rankedSeasons"> & {
    history: Mock<DispatchDeps["history"]>;
    rankedSeasons: Mock<DispatchDeps["rankedSeasons"]>;
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
        playerName: () => PLAYER as string | null,
        history: vi.fn(async () => ({ matches: history as readonly Match[], live: true })),
        kv,
        enrich: vi.fn(async () => ENRICHED),
        notify: vi.fn(async () => {}),
        rankedSeasons: vi.fn(async (): Promise<unknown> => RANKED_SEASONS),
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
        expect(issued[0].playerName).toBe(PLAYER);
        expect(issued[0].days?.map((d) => d.matches)).toEqual([1, 1, 1, 1, 0, 0, 0]);
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

    it("issues nothing, and does not throw, when the match history cannot load", async () => {
        const f = fakeDeps({ history: vi.fn(async () => Promise.reject(new Error("503"))) });
        expect(await createDispatchService(f.deps).issueDue()).toEqual([]);
        expect(f.kv.set).not.toHaveBeenCalled();
    });

    it("issues nothing from a saved offline copy of the history", async () => {
        const f = fakeDeps({ history: vi.fn(async () => ({ matches: HISTORY, live: false })) });
        expect(await createDispatchService(f.deps).issueDue()).toEqual([]);
        expect(f.kv.set).not.toHaveBeenCalled();
    });
});

describe("player name", () => {
    it("freezes the name read at issue time, not the one shown later", async () => {
        let name: string | null = "Old Name";
        const f = fakeDeps({ playerName: () => name });
        const service = createDispatchService(f.deps);
        await service.issueDue();
        name = "New Name";

        expect(f.frozen("weekly-2026-10-19")?.playerName).toBe("Old Name");
        expect((await service.print(week(19)))?.playerName).toBe("Old Name");
        expect((await service.print(week(12)))?.playerName).toBe("New Name");
    });

    it("stores null when the name is unknown", async () => {
        const [issued] = await createDispatchService(fakeDeps({ playerName: () => null }).deps).issueDue();
        expect(issued.playerName).toBeNull();
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
        expect(edition?.playerName).toBe(PLAYER);
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
        expect((await service.view())?.unseenIds).toEqual(["weekly-2026-10-19"]);

        expect(await service.open("weekly-2026-10-19")).toEqual(issued);
        expect(f.index()?.seen).toEqual(["weekly-2026-10-19"]);
        expect((await service.view())?.unseen).toBe(0);
        expect((await service.view())?.unseenIds).toEqual([]);
    });

    it("is null for an edition that was never frozen", async () => {
        expect(await createDispatchService(fakeDeps().deps).open("weekly-2026-10-12")).toBeNull();
    });
});

describe("peek", () => {
    it("reads a frozen edition without clearing its badge", async () => {
        const f = fakeDeps();
        const service = createDispatchService(f.deps);
        const [issued] = await service.issueDue();
        expect(await service.peek("weekly-2026-10-19")).toEqual(issued);
        expect(f.index()?.seen).toEqual([]);
        expect((await service.view())?.unseenIds).toEqual(["weekly-2026-10-19"]);
    });

    it("is null for an edition that was never frozen", async () => {
        expect(await createDispatchService(fakeDeps().deps).peek("weekly-2026-10-12")).toBeNull();
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
        expect(view?.shelf).toEqual({ weekly: [], monthly: [], collectors: [], year_end: [] });
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
        expect(view?.soFar?.playerName).toBe(PLAYER);
        expect(f.deps.enrich).not.toHaveBeenCalled();
    });

    it("is null while the account is unknown", async () => {
        expect(await createDispatchService(fakeDeps({ accountId: () => null }).deps).view()).toBeNull();
    });

    it("keeps the frozen editions on the shelf when the match history cannot load", async () => {
        const f = fakeDeps();
        await createDispatchService(f.deps).issueDue();
        f.deps.history.mockRejectedValue(new Error("503"));
        const view = await createDispatchService(f.deps).view();

        expect(view?.historyMissing).toBe(true);
        expect(view?.latest.weekly?.id).toBe("weekly-2026-10-19");
        expect(view?.shelf.weekly.map((e) => [e.window.id, e.status, e.matches, e.number])).toEqual([
            ["weekly-2026-10-19", "issued", 4, 1],
        ]);
        expect(view?.shelf.weekly[0].window).toEqual(week(19));
        expect([view?.soFar, view?.soFarMatches]).toEqual([null, 0]);
    });

    it("says the history loaded when it did", async () => {
        expect((await createDispatchService(fakeDeps().deps).view())?.historyMissing).toBe(false);
    });
});

describe("specials", () => {
    const ranked = (matchId: number, startTime: number): Match => ({ ...match(matchId, startTime), matchMode: 4 });
    const at = (y: number, m: number, d: number, h = 18) => Date.UTC(y, m - 1, d, h) / 1000;
    /** Thursday 2026-11-05 23:00 UTC, an hour after Beta Season 1 ended. */
    const SEASON_OVER = at(2026, 11, 5, 23);
    /** Three ranked matches in Preseason, four in Beta Season 1 plus one unranked. */
    const SEASON_HISTORY: Match[] = [
        ranked(21, at(2026, 6, 10)),
        ranked(22, at(2026, 6, 11)),
        ranked(23, at(2026, 6, 12)),
        ranked(24, at(2026, 8, 3)),
        match(25, at(2026, 8, 4)),
        ranked(26, at(2026, 9, 9)),
        ranked(27, at(2026, 10, 14)),
        ranked(28, at(2026, 11, 4)),
    ];
    const kindCalls = (f: ReturnType<typeof fakeDeps>, kind: string) =>
        f.deps.notify.mock.calls.filter(([k]) => k === kind);

    it("issues the Collector's Copy when the season ends, with its season, and announces it once", async () => {
        const f = fakeDeps({ nowS: () => SEASON_OVER }, SEASON_HISTORY);
        const service = createDispatchService(f.deps);
        const issued = await service.issueDue();

        const copy = issued.find((e) => e.window.kind === "collectors");
        expect([copy?.id, copy?.window.startS, copy?.window.endS, copy?.stats.matches]).toEqual([
            "collectors-season_1",
            SEASON_1.startS,
            SEASON_1.endS,
            4,
        ]);
        expect(copy?.season).toEqual(SEASON_1);
        expect(f.frozen("collectors-season_1")?.season).toEqual(SEASON_1);
        expect(await service.issueDue()).toEqual([]);
        expect(kindCalls(f, "collectors")).toEqual([["collectors"]]);
    });

    it("is not due before the season ends", async () => {
        const f = fakeDeps({ nowS: () => SEASON_1.endS - 60 }, SEASON_HISTORY);
        const issued = await createDispatchService(f.deps).issueDue();
        expect(issued.map((e) => e.window.kind)).not.toContain("collectors");
        expect(f.index()?.skipped ?? []).not.toContain("collectors-season_1");
    });

    it("issues only the newest ended season and offers the older one on the shelf", async () => {
        const fromApi = [
            ...RANKED_SEASONS,
            {
                class_name: "season_0",
                name: "Preseason",
                intervals: [{ interval: 1, start_timestamp: SEASON_0.startS, end_timestamp: SEASON_0.endS }],
            },
        ];
        const f = fakeDeps({ nowS: () => SEASON_OVER, rankedSeasons: vi.fn(async () => fromApi) }, SEASON_HISTORY);
        const service = createDispatchService(f.deps);
        const issued = await service.issueDue();
        const copy = issued.find((e) => e.window.kind === "collectors");
        expect(issued.filter((e) => e.window.kind === "collectors").map((e) => e.id)).toEqual(["collectors-season_1"]);

        const view = await service.view();
        expect(view?.shelf.collectors.map((e) => [e.window.id, e.status, e.matches, e.number])).toEqual([
            ["collectors-season_1", "issued", 4, copy?.number],
            ["collectors-season_0", "printable", 3, null],
        ]);
        expect(view?.latest.collectors?.id).toBe("collectors-season_1");

        const old = await service.print(collectorsWindow(SEASON_0, TZ));
        expect([old?.id, old?.season, old?.stats.matches]).toEqual(["collectors-season_0", SEASON_0, 3]);
        expect(f.index()?.issued.find((e) => e.id === "collectors-season_0")?.onRequest).toBe(true);
        expect(kindCalls(f, "collectors")).toEqual([["collectors"]]);
    });

    it("falls back to the pinned seasons when the asset fails", async () => {
        const down = vi.fn(async (): Promise<unknown> => Promise.reject(new Error("down")));
        const f = fakeDeps({ nowS: () => SEASON_OVER, rankedSeasons: down }, SEASON_HISTORY);
        const issued = await createDispatchService(f.deps).issueDue();
        expect(issued.find((e) => e.window.kind === "collectors")?.season).toEqual(SEASON_1);
    });

    it("fetches the season asset once per session", async () => {
        const f = fakeDeps({ nowS: () => SEASON_OVER }, SEASON_HISTORY);
        const service = createDispatchService(f.deps);
        await service.issueDue();
        await service.view();
        await service.print(collectorsWindow(SEASON_1, TZ));
        expect(f.deps.rankedSeasons).toHaveBeenCalledTimes(1);
    });

    it("issues the Year-End Special on Dec 1 for Dec 1 of the year before to Dec 1", async () => {
        const lastDecember = [match(19, at(2025, 11, 30, 23)), match(20, at(2025, 12, 15))];
        const f = fakeDeps({ nowS: () => at(2026, 12, 1, 0) + 1800 }, [...lastDecember, ...SEASON_HISTORY]);
        const service = createDispatchService(f.deps);
        const issued = await service.issueDue();

        const special = issued.find((e) => e.window.kind === "year_end");
        expect([special?.id, special?.window.startS, special?.window.endS, special?.stats.matches]).toEqual([
            "year_end-2026",
            at(2025, 12, 1, 0),
            at(2026, 12, 1, 0),
            9,
        ]);
        expect(special?.season).toBeNull();
        expect(kindCalls(f, "year_end")).toEqual([["year_end"]]);

        const view = await service.view();
        expect(view?.latest.year_end?.id).toBe("year_end-2026");
        expect(view?.shelf.year_end.map((e) => [e.window.id, e.status, e.number])).toEqual([
            ["year_end-2026", "issued", special?.number],
            ["year_end-2025", "too_few", null],
        ]);
    });

    it("issues no Year-End Special in October", async () => {
        const f = fakeDeps({}, [...HISTORY, ...SEASON_HISTORY]);
        const issued = await createDispatchService(f.deps).issueDue();
        expect(issued.map((e) => e.window.kind)).not.toContain("year_end");
        expect(f.index()?.skipped.filter((id) => id.startsWith("year_end"))).toEqual([]);
    });

    it("prints a past year on request", async () => {
        const lastYear = [match(31, at(2025, 3, 2)), match(32, at(2025, 7, 9)), match(33, at(2025, 11, 30))];
        const now = at(2026, 12, 2, 12);
        const f = fakeDeps({ nowS: () => now }, [...lastYear, ...SEASON_HISTORY]);
        const service = createDispatchService(f.deps);
        await service.issueDue();

        const view = await service.view();
        expect(view?.shelf.year_end.map((e) => [e.window.id, e.status, e.matches])).toEqual([
            ["year_end-2026", "issued", 8],
            ["year_end-2025", "printable", 3],
        ]);
        const printed = await service.print(view!.shelf.year_end[1].window);
        expect([printed?.id, printed?.stats.matches, printed?.issuedAt]).toEqual(["year_end-2025", 3, now]);
        expect(f.index()?.issued.find((e) => e.id === "year_end-2025")?.onRequest).toBe(true);
        expect(kindCalls(f, "year_end")).toEqual([["year_end"]]);
    });
});

describe("pending enrichment", () => {
    const ID = "weekly-2026-10-19";
    const combat = (heroId: number): HeroCombat => ({
        heroId,
        matches: 2,
        damage: 50_000,
        objDamagePerMin: 100,
        accuracy: 0.5,
        critRate: 0.2,
        mvpRankCounts: [],
        mvpRated: 0,
    });
    const RIVAL = { accountId: 9, name: "Rival", matches: 5, wins: 1 };
    const turnedAway: Enrichment & { pending: PendingField[] } = {
        mates: null,
        enemies: null,
        heroCombat: [combat(1)],
        grades: [],
        pending: ["mates", "enemies"],
    };
    const answered = { ...ENRICHED, enemies: [RIVAL], heroCombat: [combat(2)], pending: [] };

    it("freezes the fields the API turned away as pending", async () => {
        const f = fakeDeps({ enrich: vi.fn(async () => turnedAway) });
        await createDispatchService(f.deps).issueDue();
        expect(f.frozen(ID)?.pending).toEqual(["mates", "enemies"]);
    });

    it("freezes no pending list when nothing was turned away", async () => {
        const f = fakeDeps({ enrich: vi.fn(async () => ({ ...ENRICHED, pending: [] })) });
        await createDispatchService(f.deps).issueDue();
        expect(f.frozen(ID)).not.toHaveProperty("pending");
    });

    it("fills a pending edition on open, clears the flag, and keeps its number and date", async () => {
        const f = fakeDeps({ enrich: vi.fn().mockResolvedValueOnce(turnedAway).mockResolvedValueOnce(answered) });
        const service = createDispatchService(f.deps);
        const [issued] = await service.issueDue();
        expect(issued.mates).toEqual([]);
        expect(issued.nemesis).toBeNull();

        const opened = await service.open(ID);
        expect(opened?.mates).toEqual(ENRICHED.mates);
        expect(opened?.nemesis).toEqual(RIVAL);
        expect(opened?.rivals).toEqual([RIVAL]);
        expect(opened).not.toHaveProperty("pending");
        expect([opened?.number, opened?.issuedAt, opened?.playerName]).toEqual([1, NOW, PLAYER]);
        expect(f.frozen(ID)).toEqual(opened);
        expect(f.index()?.seen).toEqual([ID]);
    });

    it("never overwrites a field that was frozen good", async () => {
        const f = fakeDeps({ enrich: vi.fn().mockResolvedValueOnce(turnedAway).mockResolvedValueOnce(answered) });
        const service = createDispatchService(f.deps);
        await service.issueDue();
        expect((await service.open(ID))?.combat).toEqual([combat(1)]);
    });

    it("keeps what is still turned away pending and fills the rest", async () => {
        const stillAway = { ...answered, enemies: null, pending: ["enemies"] as PendingField[] };
        const f = fakeDeps({ enrich: vi.fn().mockResolvedValueOnce(turnedAway).mockResolvedValueOnce(stillAway) });
        const service = createDispatchService(f.deps);
        await service.issueDue();
        const opened = await service.open(ID);
        expect(opened?.mates).toEqual(ENRICHED.mates);
        expect(opened?.nemesis).toBeNull();
        expect(opened?.pending).toEqual(["enemies"]);
        expect(f.frozen(ID)?.pending).toEqual(["enemies"]);
    });

    it("leaves the edition as frozen when the API turns it away again", async () => {
        const f = fakeDeps({ enrich: vi.fn(async () => turnedAway) });
        const service = createDispatchService(f.deps);
        const [issued] = await service.issueDue();
        expect(await service.open(ID)).toEqual(issued);
        expect(f.index()?.seen).toEqual([ID]);
    });

    it("does not enrich again an edition frozen before pending existed", async () => {
        const f = fakeDeps();
        const service = createDispatchService(f.deps);
        const [issued] = await service.issueDue();
        expect(issued).not.toHaveProperty("pending");
        expect(await service.open(ID)).toEqual(issued);
        expect(f.deps.enrich).toHaveBeenCalledTimes(1);
    });

    it("does not fill or mark seen on a peek", async () => {
        const f = fakeDeps({ enrich: vi.fn().mockResolvedValueOnce(turnedAway).mockResolvedValueOnce(answered) });
        const service = createDispatchService(f.deps);
        await service.issueDue();
        expect((await service.peek(ID))?.pending).toEqual(["mates", "enemies"]);
        expect(f.deps.enrich).toHaveBeenCalledTimes(1);
        expect(f.index()?.seen).toEqual([]);
    });
});

describe("historyStamp", () => {
    it("is the same for an equal history handed back as a fresh list", () => {
        expect(historyStamp([...HISTORY])).toBe(historyStamp(HISTORY));
        expect(historyStamp([])).toBe(historyStamp([]));
    });

    it("changes when a game arrives or one is dropped", () => {
        expect(historyStamp([...HISTORY, match(9, oct(26))])).not.toBe(historyStamp(HISTORY));
        expect(historyStamp(HISTORY.slice(1))).not.toBe(historyStamp(HISTORY));
        expect(historyStamp([match(2, oct(5))])).not.toBe(historyStamp([match(1, oct(5))]));
    });
});
