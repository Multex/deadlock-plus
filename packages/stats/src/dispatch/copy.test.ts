import { describe, expect, it } from "vitest";
import { copySeed, pickAlong, pickVariant, variantHash } from "./copy";

const seeds = (n: number) => Array.from({ length: n }, (_, i) => copySeed(1000 + i, `weekly-2026-10-${i}`));

describe("pickVariant", () => {
    it("is deterministic", () => {
        const seed = copySeed(42, "monthly-2026-10");
        expect(pickVariant(seed, "best_game.headline", 5)).toBe(pickVariant(seed, "best_game.headline", 5));
        expect(variantHash(seed, "x")).toBe(variantHash(copySeed(42, "monthly-2026-10"), "x"));
    });

    it("returns 1..n and hits every variant across 100 seeds", () => {
        for (const n of [2, 3, 4, 5, 8]) {
            const hits = new Set(seeds(100).map((s) => pickVariant(s, "best_game.headline", n)));
            expect([...hits].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
        }
    });

    it("spreads different slots of one seed apart", () => {
        const seed = copySeed(7, "weekly-2026-10-05");
        const picks = new Set(Array.from({ length: 40 }, (_, i) => pickVariant(seed, `slot.${i}`, 5)));
        expect(picks.size).toBe(5);
    });

    it("never returns the avoided variant, and still spreads over the rest", () => {
        for (const avoid of [1, 3, 5]) {
            const hits = new Set(seeds(200).map((s) => pickVariant(s, "deck", 5, avoid)));
            expect(hits.has(avoid)).toBe(false);
            expect(hits.size).toBe(4);
        }
    });

    it("ignores an avoid when there is only one variant", () => {
        expect(pickVariant(copySeed(1, "a"), "s", 1, 1)).toBe(1);
    });
});

describe("pickAlong", () => {
    it("never repeats the previous edition's pick along a chain", () => {
        for (const n of [2, 3, 5]) {
            const chain = seeds(300);
            let prev = 0;
            for (let i = 1; i <= chain.length; i++) {
                const pick = pickAlong(chain.slice(0, i), "best_game.headline", n);
                expect(pick).not.toBe(prev);
                prev = pick;
            }
        }
    });

    it("matches pickVariant for a lone edition", () => {
        const [s] = seeds(1);
        expect(pickAlong([s], "x", 4)).toBe(pickVariant(s, "x", 4));
    });

    it("depends only on the ids in the chain", () => {
        const chain = seeds(12);
        expect(pickAlong(chain, "slot", 5)).toBe(pickAlong([...chain], "slot", 5));
    });
});
