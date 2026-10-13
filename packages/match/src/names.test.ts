import { describe, expect, it, vi } from "vitest";
import { parseApiDetail } from "./api-detail";
import { allPlayers } from "./detail";
import fixture from "./fixtures/api-ranked.json";
import { batchIds, NameResolver, NAME_TTL_MS, parseNames, parseStoredNames, withNames, type NameDeps } from "./names";

describe("batchIds", () => {
    it("dedupes, drops invalid ids and chunks", () => {
        expect(batchIds([3, 3, 0, -1, 1.5, 4, 5], 2)).toEqual([[3, 4], [5]]);
    });
    it("returns nothing for no ids", () => {
        expect(batchIds([])).toEqual([]);
    });
    it("keeps 12 players in one batch by default", () => {
        expect(batchIds(Array.from({ length: 12 }, (_, i) => i + 1))).toHaveLength(1);
    });
});

describe("parseNames", () => {
    it("reads account_id and personaname and skips empty names", () => {
        const m = parseNames([
            { account_id: 1, personaname: " Ann " },
            { account_id: 2, personaname: null },
            { account_id: 3, personaname: "" },
            { account_id: "4", personaname: "x" },
            { account_id: 5 },
            null,
        ]);
        expect([...m]).toEqual([[1, "Ann"]]);
    });
    it("tolerates a non-array body", () => {
        expect(parseNames({ error: "x" }).size).toBe(0);
    });
});

describe("withNames", () => {
    const detail = parseApiDetail(fixture)!;
    it("sets names only for known accounts and leaves the input untouched", () => {
        const [first, second] = allPlayers(detail);
        const out = withNames(detail, new Map([[first.accountId, "Ann"]]));
        const players = allPlayers(out);
        expect(players.find((p) => p.accountId === first.accountId)?.name).toBe("Ann");
        expect(players.find((p) => p.accountId === second.accountId)?.name).toBeUndefined();
        expect(first.name).toBeUndefined();
    });
});

describe("parseStoredNames", () => {
    it("drops malformed and expired entries", () => {
        const now = 10_000_000_000;
        const m = parseStoredNames(
            {
                "1": { n: "a", at: now },
                "2": { n: "b", at: now - NAME_TTL_MS - 1 },
                "3": { n: 5, at: now },
                x: { n: "c", at: now },
            },
            now,
        );
        expect([...m.keys()]).toEqual([1]);
    });
    it("handles garbage", () => {
        expect(parseStoredNames(null, 0).size).toBe(0);
        expect(parseStoredNames([1], 0).size).toBe(0);
    });
});

function deps(over: Partial<NameDeps> = {}): NameDeps {
    return {
        fetchBatch: vi.fn(async (ids: number[]) =>
            ids.filter((i) => i < 100 || i >= 1000).map((i) => ({ account_id: i, personaname: `p${i}` })),
        ),
        load: vi.fn(async () => null),
        save: vi.fn(async () => {}),
        now: () => 1_000,
        ...over,
    };
}

describe("NameResolver", () => {
    it("fetches unknown ids once and caches them in memory", async () => {
        const d = deps();
        const r = new NameResolver(d);
        expect((await r.resolve([1, 2])).get(2)).toBe("p2");
        await r.resolve([1, 2]);
        expect(d.fetchBatch).toHaveBeenCalledTimes(1);
        expect(d.save).toHaveBeenCalledTimes(1);
    });

    it("does not refetch ids the API does not know", async () => {
        const d = deps();
        const r = new NameResolver(d);
        const out = await r.resolve([1, 500]);
        expect(out.has(500)).toBe(false);
        await r.resolve([500]);
        expect(d.fetchBatch).toHaveBeenCalledTimes(1);
    });

    it("uses persisted names without fetching", async () => {
        const d = deps({ load: vi.fn(async () => ({ "7": { n: "saved", at: 1_000 } })) });
        const r = new NameResolver(d);
        expect((await r.resolve([7])).get(7)).toBe("saved");
        expect(d.fetchBatch).not.toHaveBeenCalled();
    });

    it("survives a failed batch and retries it later", async () => {
        let fail = true;
        const d = deps({
            fetchBatch: vi.fn(async (ids: number[]) => {
                if (fail) throw new Error("429");
                return ids.map((i) => ({ account_id: i, personaname: `p${i}` }));
            }),
        });
        const r = new NameResolver(d);
        expect((await r.resolve([1])).size).toBe(0);
        fail = false;
        expect((await r.resolve([1])).get(1)).toBe("p1");
    });

    it("survives unreadable and unwritable storage", async () => {
        const d = deps({
            load: vi.fn(async () => {
                throw new Error("kv");
            }),
            save: vi.fn(async () => {
                throw new Error("kv");
            }),
        });
        expect((await new NameResolver(d).resolve([1])).get(1)).toBe("p1");
    });

    it("splits large requests into batches", async () => {
        const d = deps();
        const ids = Array.from({ length: 120 }, (_, i) => i + 1000);
        await new NameResolver(d, 50).resolve(ids);
        expect(d.fetchBatch).toHaveBeenCalledTimes(3);
    });
});
