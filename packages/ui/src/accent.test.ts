import { describe, expect, it } from "vitest";

import {
    accentColour,
    accentHex,
    accentTokens,
    contrast,
    hexToAccent,
    hexToOklch,
    inGamut,
    namedAccentTokens,
    readableColour,
    themeAccent,
} from "./accent";
import { THEMES, oklchToHex, themeVariant, type Theme } from "./themes";

/** Every surface the accent is drawn on as text, or drawn behind text. */
const SURFACES = ["background", "card", "muted", "secondary", "popover", "chrome", "accent"];
const custom = THEMES.filter((t) => t.customAccent);
const theme = (id: string) => THEMES.find((t) => t.id === id)!;

describe("accentColour", () => {
    it("keeps every text pair at 4.5:1 or more, on every theme, whatever colour is picked", () => {
        for (const t of custom) {
            for (let hue = 0; hue < 360; hue += 30) {
                for (const chroma of [0, 0.06, 0.15, 0.3]) {
                    const colour = accentColour(t, { hue, chroma });
                    for (const surface of SURFACES) {
                        expect(
                            contrast(colour, t.tokens[surface]!),
                            `${t.id} ${hue}/${chroma} on ${surface}`,
                        ).toBeGreaterThanOrEqual(4.5);
                    }
                }
            }
        }
    });

    it("stays a colour the screen can show", () => {
        for (const t of custom) {
            for (let hue = 0; hue < 360; hue += 15) expect(inGamut(accentColour(t, { hue, chroma: 0.37 }))).toBe(true);
        }
    });

    it("keeps the hue that was picked", () => {
        const colour = accentColour(theme("deadlock"), { hue: 140, chroma: 0.12 });
        expect(Number(/oklch\([\d.]+ [\d.]+ ([\d.]+)\)/.exec(colour)?.[1])).toBeCloseTo(140, 0);
    });

    it("leaves a colour alone when it already passes, so a theme's own trim comes back unchanged", () => {
        expect(accentHex(theme("void"), hexToAccent("#9b5cff"))).toBe("#9b5cff");
    });

    it("keeps a pasted colour's own lightness when it passes, and moves it only as far as contrast needs", () => {
        expect(accentHex(theme("void"), hexToAccent("#3ec7ff"))).toBe("#3ec7ff");

        const dark = accentColour(theme("void"), hexToAccent("#1a1a40"));
        expect(contrast(dark, theme("void").tokens.muted!)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(dark, theme("void").tokens.muted!)).toBeLessThan(5);
    });
});

describe("every theme's own colours", () => {
    // Each text colour the UI draws over each surface it is drawn on.
    const PAIRS: [string, string][] = [
        ["foreground", "background"],
        ["foreground", "chrome"],
        ["foreground", "card"],
        ["foreground", "popover"],
        ["foreground", "muted"],
        ["foreground", "accent"],
        ["card-foreground", "card"],
        ["popover-foreground", "popover"],
        ["secondary-foreground", "secondary"],
        ["accent-foreground", "accent"],
        ["primary-foreground", "primary"],
        ["destructive-foreground", "destructive"],
        ["success-foreground", "success"],
        ["warning-foreground", "warning"],
        ["background", "brass"],
        ...["background", "card", "muted", "popover", "chrome", "accent"].flatMap((surface): [string, string][] => [
            ["muted-foreground", surface],
            ["brass", surface],
            ["primary", surface],
            ["success", surface],
            ["warning", surface],
            ["destructive", surface],
            ["dd-hk", surface],
            ["dd-am", surface],
        ]),
    ];

    const missesIn = (t: Theme, label: string) =>
        PAIRS.filter(([fg, bg]) => contrast(t.tokens[fg]!, t.tokens[bg]!) < 4.5).map(
            ([fg, bg]) => `${label} ${fg}/${bg} ${contrast(t.tokens[fg]!, t.tokens[bg]!).toFixed(2)}`,
        );

    it("keeps every text pair at 4.5:1 or more", () => {
        expect(THEMES.flatMap((t) => missesIn(t, t.id))).toEqual([]);
    });

    it("keeps every text pair at 4.5:1 or more in every variant, with each of its accents", () => {
        const misses = THEMES.flatMap((t) =>
            t.variants.flatMap((v) => {
                const variant = themeVariant(t, v.id);
                return [
                    ...missesIn(variant, `${t.id}/${v.id}`),
                    ...Object.keys(v.accents).flatMap((name) => {
                        const tokens = { ...variant.tokens, ...namedAccentTokens(t, v.id, name) };
                        return missesIn({ ...variant, tokens }, `${t.id}/${v.id}/${name}`);
                    }),
                ];
            }),
        );
        expect(misses).toEqual([]);
    });
});

describe("readableColour", () => {
    const mocha = themeVariant(theme("catppuccin"), "mocha");
    const latte = themeVariant(theme("catppuccin"), "latte");

    it("leaves a colour that already reads at 4.5:1 on every surface exactly as it is", () => {
        expect(readableColour(mocha, "oklch(0.7871 0.1187 304.77)")).toBe("oklch(0.7871 0.1187 304.77)");
    });

    it("moves only the lightness of one that does not, away from the background, until it does", () => {
        const yellow = "oklch(0.714 0.1494 67.78)";
        const readable = readableColour(latte, yellow);
        const [l, , h] = /oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/.exec(readable)!.slice(1).map(Number);

        expect(l).toBeLessThan(0.714);
        expect(h).toBeCloseTo(67.78, 1);
        for (const surface of SURFACES) expect(contrast(readable, latte.tokens[surface]!)).toBeGreaterThanOrEqual(4.5);
    });
});

describe("namedAccentTokens", () => {
    const catppuccin = theme("catppuccin");

    it("rings focus in the accent's exact colour and keeps it as the trim where it reads", () => {
        const tokens = namedAccentTokens(catppuccin, "mocha", "peach")!;

        expect(oklchToHex(tokens.ring)).toBe("#fab387");
        expect(tokens.brass).toBe(tokens.ring);
    });

    it("draws the trim in the readable colour where the exact one is too faint for text", () => {
        const tokens = namedAccentTokens(catppuccin, "latte", "yellow")!;

        expect(oklchToHex(tokens.ring)).toBe("#df8e1d");
        expect(tokens.brass).toBe(readableColour(themeVariant(catppuccin, "latte"), tokens.ring));
        expect(tokens.brass).not.toBe(tokens.ring);
    });

    it("matches the flavour's own trim for the default accent", () => {
        for (const v of catppuccin.variants) {
            expect(namedAccentTokens(catppuccin, v.id, "mauve")!.brass, v.id).toBe(
                themeVariant(catppuccin, v.id).tokens.brass,
            );
        }
    });

    it("has nothing for an accent or a theme it does not know", () => {
        expect(namedAccentTokens(catppuccin, "mocha", "beige")).toBeNull();
        expect(namedAccentTokens(theme("void"), undefined, "mauve")).toBeNull();
    });
});

describe("contrast", () => {
    it("gives the WCAG ratio", () => {
        expect(contrast("oklch(1 0 0)", "oklch(0 0 0)")).toBeCloseTo(21, 1);
        expect(contrast("oklch(0 0 0)", "oklch(0 0 0)")).toBe(1);
        // Nightshift's foreground on its background, as palette.py reports it.
        expect(contrast("oklch(0.94 0.014 197)", "oklch(0.162 0.026 195)")).toBeCloseTo(16.2, 1);
    });
});

describe("hexToAccent", () => {
    it("reads the hue and vividness of a pasted colour", () => {
        const accent = hexToAccent("#9b5cff");
        expect(accent.hue).toBeCloseTo(297, 0);
        expect(accent.chroma).toBeCloseTo(0.23, 2);
    });

    it("takes the short form and no hash", () => {
        expect(hexToAccent("fff").chroma).toBeCloseTo(0, 3);
    });
});

describe("hexToOklch", () => {
    it("gives a plain oklch() colour that converts back to the very same hex", () => {
        for (const hex of ["#1e1e2e", "#cba6f7", "#eff1f5", "#df8e1d", "#000000", "#ffffff", "#080605"]) {
            expect(hexToOklch(hex), hex).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/);
            expect(oklchToHex(hexToOklch(hex)), hex).toBe(hex);
        }
    });
});

describe("themeAccent", () => {
    it("reads the theme's own trim as an accent, which the picker starts from", () => {
        const own = themeAccent(theme("void"));
        expect(own.hue).toBeCloseTo(297, 0);
        expect(own.chroma).toBeCloseTo(0.23, 2);
    });
});

describe("accentTokens", () => {
    it("swaps the trim, ring and edges, keeping how strongly the theme draws its borders", () => {
        const tokens = accentTokens(theme("nightshift"), { hue: 300, chroma: 0.15 });
        expect(tokens.brass).toBe(tokens.ring);
        expect(tokens.border).toBe(tokens.brass.replace(")", " / 20%)"));
        expect(tokens.input).toBe(tokens.brass.replace(")", " / 26%)"));
    });
});
