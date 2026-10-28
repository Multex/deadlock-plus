import { describe, expect, it } from "vitest";
import {
    editionKey,
    indexKey,
    markSeen,
    nextNumber,
    parseIndex,
    recordIssued,
    recordSkipped,
    unseenCount,
    unseenIds,
} from "./archive";
import type { DispatchIndex, IssuedEntry } from "./types";

const EMPTY: DispatchIndex = { schema: 1, issued: [], skipped: [], seen: [] };

const entry = (id: string, startS: number, over: Partial<IssuedEntry> = {}): IssuedEntry => ({
    id,
    kind: id.startsWith("weekly") ? "weekly" : "monthly",
    number: 1,
    issuedAt: startS + 700_000,
    startS,
    endS: startS + 604_800,
    matches: 7,
    onRequest: false,
    ...over,
});

const index = (issued: IssuedEntry[], over: Partial<DispatchIndex> = {}): DispatchIndex => ({
    ...EMPTY,
    issued,
    ...over,
});

describe("keys", () => {
    it("namespaces the index and each edition by account", () => {
        expect(indexKey(69)).toBe("dispatch:69:index");
        expect(editionKey(69, "weekly-2026-10-19")).toBe("dispatch:69:weekly-2026-10-19");
    });
});

describe("parseIndex", () => {
    it("gives an empty index for anything unreadable", () => {
        for (const raw of [null, undefined, 3, "x", [], {}, { schema: 2, issued: [] }]) {
            expect(parseIndex(raw)).toEqual(EMPTY);
        }
    });

    it("keeps a valid index", () => {
        const good = index([entry("weekly-2026-10-19", 200, { number: 2 }), entry("weekly-2026-10-12", 100)], {
            skipped: ["weekly-2026-10-05"],
            seen: ["weekly-2026-10-12"],
        });
        expect(parseIndex(JSON.parse(JSON.stringify(good)))).toEqual(good);
    });

    it("keeps Collector's Copy and Year-End Special entries", () => {
        const good = index([
            entry("year_end-2026", 300, { kind: "year_end" }),
            entry("collectors-season_1", 200, { kind: "collectors" }),
        ]);
        expect(parseIndex(JSON.parse(JSON.stringify(good)))).toEqual(good);
    });

    it("drops malformed entries and fills missing fields", () => {
        const ok = entry("weekly-2026-10-19", 200);
        const raw = {
            schema: 1,
            issued: [
                ok,
                null,
                { ...ok, id: 5 },
                { ...ok, kind: "daily" },
                { ...ok, number: "2" },
                { ...ok, onRequest: 1 },
            ],
            skipped: ["weekly-2026-10-05", 7, null],
            seen: ["weekly-2026-10-19", 3, null, {}],
        };
        expect(parseIndex(raw)).toEqual({
            ...EMPTY,
            issued: [ok],
            skipped: ["weekly-2026-10-05"],
            seen: ["weekly-2026-10-19"],
        });
    });

    it("treats a non-array issued list as empty", () => {
        expect(parseIndex({ schema: 1, issued: "nope", skipped: ["a"], seen: "weekly-2026-10-19" })).toEqual({
            ...EMPTY,
            skipped: ["a"],
        });
    });
});

describe("nextNumber", () => {
    it("starts at 1", () => {
        expect(nextNumber(EMPTY)).toBe(1);
    });

    it("is one past the highest issued number, whatever the order", () => {
        const i = index([entry("weekly-2026-10-19", 200, { number: 3 }), entry("monthly-2026-09", 50, { number: 7 })]);
        expect(nextNumber(i)).toBe(8);
    });
});

describe("recordIssued", () => {
    it("keeps issued sorted newest window first", () => {
        let i = recordIssued(EMPTY, entry("weekly-2026-10-12", 100));
        i = recordIssued(i, entry("weekly-2026-10-19", 200));
        i = recordIssued(i, entry("weekly-2026-09-28", 50, { onRequest: true }));
        expect(i.issued.map((e) => e.id)).toEqual(["weekly-2026-10-19", "weekly-2026-10-12", "weekly-2026-09-28"]);
    });

    it("replaces an entry with the same id", () => {
        const i = recordIssued(
            index([entry("weekly-2026-10-19", 200, { matches: 3 })]),
            entry("weekly-2026-10-19", 200),
        );
        expect(i.issued).toEqual([entry("weekly-2026-10-19", 200)]);
    });

    it("takes the id off the skipped list", () => {
        const i = recordIssued(
            index([], { skipped: ["weekly-2026-10-19", "weekly-2026-10-12"] }),
            entry("weekly-2026-10-19", 200),
        );
        expect(i.skipped).toEqual(["weekly-2026-10-12"]);
    });

    it("does not change its input", () => {
        const before = index([entry("weekly-2026-10-12", 100)], { skipped: ["weekly-2026-10-19"] });
        const copy = structuredClone(before);
        recordIssued(before, entry("weekly-2026-10-19", 200));
        expect(before).toEqual(copy);
    });
});

describe("recordSkipped", () => {
    it("adds an id once", () => {
        const i = recordSkipped(recordSkipped(EMPTY, "weekly-2026-10-19"), "weekly-2026-10-19");
        expect(i.skipped).toEqual(["weekly-2026-10-19"]);
        expect(EMPTY.skipped).toEqual([]);
    });
});

describe("markSeen and unseenCount", () => {
    const auto = [entry("weekly-2026-10-19", 300), entry("weekly-2026-10-12", 200), entry("weekly-2026-10-05", 100)];

    it("counts every automatic issue when nothing was seen", () => {
        const i = index([...auto, entry("weekly-2026-09-28", 50, { onRequest: true })]);
        expect(unseenCount(i)).toBe(3);
    });

    it("counts automatic issues not in seen, whatever their age", () => {
        const onRequestNewer = entry("weekly-2026-10-26", 400, { onRequest: true });
        const i = index([onRequestNewer, ...auto], { seen: ["weekly-2026-10-19"] });
        expect(unseenCount(i)).toBe(2);
    });

    it("is zero once every automatic issue is seen", () => {
        let i = index(auto);
        for (const e of auto) i = markSeen(i, e.id);
        expect(unseenCount(i)).toBe(0);
    });

    it("opening an older edition does not hide a newer unseen one", () => {
        expect(unseenCount(markSeen(index(auto), "weekly-2026-10-05"))).toBe(2);
    });

    it("lists unseen automatic ids newest first, matching the count", () => {
        const onRequest = entry("weekly-2026-10-26", 400, { onRequest: true });
        const i = index([onRequest, ...auto], { seen: ["weekly-2026-10-12"] });
        expect(unseenIds(i)).toEqual(["weekly-2026-10-19", "weekly-2026-10-05"]);
        expect(unseenCount(i)).toBe(unseenIds(i).length);
    });

    it("adds each id once", () => {
        const seen = markSeen(markSeen(index(auto), "weekly-2026-10-12"), "weekly-2026-10-12");
        expect(seen.seen).toEqual(["weekly-2026-10-12"]);
    });

    it("ignores an id that was never issued", () => {
        const before = index(auto);
        expect(markSeen(before, "weekly-2026-10-26")).toBe(before);
    });

    it("does not change its input", () => {
        const before = index(auto);
        markSeen(before, "weekly-2026-10-19");
        expect(before.seen).toEqual([]);
    });
});
