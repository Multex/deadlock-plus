import { describe, expect, it } from "vitest";
import type { CopyRef } from "../data";
import { countedToken, layoutRich, lineId, numberSpan, say, type Stage } from "./stage";

const ref = (key: string, params: Record<string, string> = {}, count?: number): CopyRef =>
    count === undefined ? { key, params } : { key, params, count };

describe("lineId and say", () => {
    it("tells apart two refs with one key but other counts or params", () => {
        const a = ref("k_1", { matches: "9" }, 3);
        const b = ref("k_1", { matches: "4" }, 3);
        const c = ref("k_1", { matches: "9" }, 2);
        expect(new Set([lineId(a), lineId(b), lineId(c)]).size).toBe(3);
    });

    it("reads the translated line, and nothing for a missing or absent ref", () => {
        const stage = { awards: {}, lines: { [lineId(ref("k_1"))]: "Hello" } } as unknown as Stage;
        expect(say(stage, ref("k_1"))).toBe("Hello");
        expect(say(stage, ref("k_2"))).toBe("");
        expect(say(stage, null)).toBe("");
    });
});

describe("numberSpan", () => {
    it("finds the count as the line formats it", () => {
        expect(numberSpan("486 matches. Tonight, the awards.", 486)).toEqual({ start: 0, end: 3 });
        expect(numberSpan("Lights, cameras, 1,204 matches!", 1204)).toEqual({ start: 17, end: 22 });
        expect(numberSpan("1.204 Spiele, 2026", 1204)).toEqual({ start: 0, end: 5 });
        expect(numberSpan("2026 in 1 204 matches", 1204)).toEqual({ start: 8, end: 13 });
    });

    it("skips other numbers and misses when the count is not there", () => {
        expect(numberSpan("2026 in 23 matches", 23)).toEqual({ start: 8, end: 10 });
        expect(numberSpan("2026 awards", 23)).toBeNull();
    });
});

describe("countedToken", () => {
    it("formats a counted-up value in the token's own grouping", () => {
        expect(countedToken("1,204", 37)).toBe("37");
        expect(countedToken("1,204", 1003)).toBe("1,003");
        expect(countedToken("1.204", 1200)).toBe("1.200");
        expect(countedToken("486", 12)).toBe("12");
    });
});

describe("layoutRich", () => {
    // Every character 10 px wide at size 20, scaled with the size.
    const measure = (s: string, px: number) => (s.length * px) / 2;

    it("wraps words to the width and keeps a run's size", () => {
        const lines = layoutRich(
            [
                { text: "486", px: 40 },
                { text: " matches. Tonight, the awards.", px: 20 },
            ],
            190,
            measure,
        );
        expect(lines.map((l) => l.words.map((w) => w.text).join(" "))).toEqual([
            "486 matches.",
            "Tonight, the",
            "awards.",
        ]);
        expect(lines[0].words[0].px).toBe(40);
        expect(lines[0].height).toBe(40);
        expect(lines[1].height).toBe(20);
        for (const l of lines) expect(l.width).toBeLessThanOrEqual(190);
    });

    it("puts a lone word that overflows on its own line", () => {
        const lines = layoutRich([{ text: "Supercalifragilistic is long", px: 20 }], 100, measure);
        expect(lines[0].words.map((w) => w.text)).toEqual(["Supercalifragilistic"]);
    });

    it("joins a word split across runs without a space", () => {
        const lines = layoutRich(
            [
                { text: "Welcome, ", px: 20 },
                { text: "Lantern", px: 20, tag: "name" },
                { text: ". Take your seat.", px: 20 },
            ],
            1000,
            measure,
        );
        const words = lines[0].words;
        expect(words.map((w) => [w.text, w.tag ?? null, w.space])).toEqual([
            ["Welcome,", null, false],
            ["Lantern", "name", true],
            [".", null, false],
            ["Take", null, true],
            ["your", null, true],
            ["seat.", null, true],
        ]);
    });
});
