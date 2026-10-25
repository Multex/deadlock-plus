import { describe, expect, it } from "vitest";
import { MIN_CONTRAST, contrast } from "@deadlock-plus/ui/accent";
import { PAPER_TEXT_PAIRS, PAPER_TOKENS } from "./tokens";

describe("paper colours", () => {
    it("keeps every text pair on the paper at 4.5:1 or more", () => {
        const weak = PAPER_TEXT_PAIRS.map(([fg, bg]) => ({
            pair: `${fg} on ${bg}`,
            ratio: contrast(PAPER_TOKENS[fg], PAPER_TOKENS[bg]),
        })).filter(({ ratio }) => ratio < MIN_CONTRAST);
        expect(weak).toEqual([]);
    });

    it("checks text on the aged edge and the viewer highlight, not just the clean sheet", () => {
        const backgrounds = new Set(PAPER_TEXT_PAIRS.map(([, bg]) => bg));
        expect(backgrounds).toContain("paper-edge");
        expect(backgrounds).toContain("highlight");
    });
});
