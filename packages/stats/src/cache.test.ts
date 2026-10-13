import { describe, expect, it } from "vitest";
import { parseStatsCache, toStatsCache } from "./cache";

const snapshot = { matches: [], ranks: [], rankInfo: null };

describe("stats cache", () => {
    it("round-trips a snapshot for the same account", () => {
        const raw = toStatsCache(42, 1000, snapshot);
        expect(parseStatsCache(raw, 42)).toEqual({ at: 1000, ...snapshot });
    });

    it("ignores a snapshot from another account", () => {
        expect(parseStatsCache(toStatsCache(42, 1000, snapshot), 43)).toBeNull();
    });

    it.each([null, undefined, 7, "x", {}, { accountId: 42 }, { accountId: 42, at: 1, matches: "no" }])(
        "rejects malformed input %j",
        (raw) => {
            expect(parseStatsCache(raw, 42)).toBeNull();
        },
    );
});
