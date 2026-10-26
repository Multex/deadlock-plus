import { describe, expect, it } from "vitest";
import { MIN_CONTRAST, contrast, hexToOklch } from "@deadlock-plus/ui/accent";
import { MONTH_PALETTES, PAGE_TEXT_PAIRS, PALETTE_TEXT_PAIRS, PAGE_TOKENS, monthPalette } from "./palette";

const ratio = (fg: string, bg: string) => contrast(hexToOklch(fg), hexToOklch(bg));

describe("month palettes", () => {
    it("has one cover colour per calendar month, each different", () => {
        expect(MONTH_PALETTES).toHaveLength(12);
        expect(new Set(MONTH_PALETTES.map((p) => p.bg)).size).toBe(12);
    });

    it("keeps every text pair on every month's cover and pages at 4.5:1 or more", () => {
        const weak = MONTH_PALETTES.flatMap((p, i) =>
            PALETTE_TEXT_PAIRS.map(([fg, bg]) => {
                const colours = { ...PAGE_TOKENS, ...p };
                return { pair: `month ${i + 1} ${fg} on ${bg}`, ratio: ratio(colours[fg], colours[bg]) };
            }),
        ).filter((r) => r.ratio < MIN_CONTRAST);
        expect(weak).toEqual([]);
    });

    it("keeps the inside pages' own greys at 4.5:1 or more", () => {
        const weak = PAGE_TEXT_PAIRS.map(([fg, bg]) => ({
            pair: `${fg} on ${bg}`,
            ratio: ratio(PAGE_TOKENS[fg], PAGE_TOKENS[bg]),
        })).filter((r) => r.ratio < MIN_CONTRAST);
        expect(weak).toEqual([]);
    });

    it("checks the sticker, the night panels and the white page, not just the cover", () => {
        const pairs = PALETTE_TEXT_PAIRS.map(([fg, bg]) => `${fg}/${bg}`);
        expect(pairs).toEqual(expect.arrayContaining(["bg/accent", "night/dark", "ink/paper", "paper/ink"]));
    });

    it("picks the palette by the month of the window's start, January first", () => {
        expect(monthPalette(1)).toBe(MONTH_PALETTES[0]);
        expect(monthPalette(12)).toBe(MONTH_PALETTES[11]);
        expect(monthPalette(13)).toBe(MONTH_PALETTES[0]);
    });
});
