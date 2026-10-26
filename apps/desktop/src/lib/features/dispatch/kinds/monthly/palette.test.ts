import { describe, expect, it } from "vitest";
import { MIN_CONTRAST, contrast, hexToOklch } from "@deadlock-plus/ui/accent";
import { hexToAccent } from "@deadlock-plus/ui/accent";
import {
    MONTH_PALETTES,
    PAGE_TEXT_PAIRS,
    PALETTE_TEXT_PAIRS,
    PAGE_TOKENS,
    heroPalette,
    monthPalette,
    type MonthPalette,
} from "./palette";

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

/** Every released hero's `colors.style` from deadlock-api's `/assets/heroes` (2026-10-26), plus the extremes. */
const HERO_COLOURS: Record<string, string> = {
    Infernus: "#C93C26",
    Seven: "#CC861E",
    Vindicta: "#A2C7E5",
    "Lady Geist": "#218440",
    Abrams: "#2092AE",
    Wraith: "#944D78",
    McGinnis: "#23549D",
    Paradox: "#983952",
    Dynamo: "#D0B945",
    Kelvin: "#74ABBC",
    Haze: "#AC6133",
    Holliday: "#A35A1B",
    Bebop: "#9F4734",
    Calico: "#572798",
    "Grey Talon": "#5EB083",
    "Mo & Krill": "#C58428",
    Shiv: "#E52A68",
    Ivy: "#9D8CA9",
    Warden: "#4D68A3",
    Yamato: "#625789",
    Lash: "#4174BB",
    Viscous: "#319826",
    Pocket: "#858617",
    Mirage: "#6A2E68",
    Vyper: "#A7AD00",
    Sinclair: "#6B6B6B",
    Mina: "#A9171E",
    Drifter: "#9D2C2B",
    Venator: "#BD3599",
    Victor: "#658B6F",
    Paige: "#258F63",
    "The Doorman": "#B77528",
    Billy: "#D4AD0E",
    Graves: "#D9F334",
    Apollo: "#FF3333",
    "Deadman Danny": "#CE8D2A",
    Rem: "#5383D1",
    Silver: "#BFBC9F",
    Celeste: "#BBA9E1",
    "Rat King": "#733033",
    Solomon: "#AA9E7E",
    Violet: "#653cbc",
    "Nurse Harrow": "#55C9BA",
    Baba: "#895672",
    black: "#000000",
    white: "#ffffff",
    yellow: "#ffff00",
};

const hueGap = (a: string, b: string) => {
    const d = Math.abs(hexToAccent(a).hue - hexToAccent(b).hue) % 360;
    return Math.min(d, 360 - d);
};

describe("hero palettes", () => {
    const palettes = Object.entries(HERO_COLOURS).map(([name, hex]) => ({ name, hex, p: heroPalette(hex) }));

    it("keeps every text pair at 4.5:1 or more for every hero's colour", () => {
        const weak = palettes
            .flatMap(({ name, p }) =>
                PALETTE_TEXT_PAIRS.map(([fg, bg]) => {
                    const colours: Record<string, string> = { ...PAGE_TOKENS, ...p };
                    return { pair: `${name} ${fg} on ${bg}`, ratio: ratio(colours[fg]!, colours[bg]!) };
                }),
            )
            .filter((r) => r.ratio < MIN_CONTRAST);
        expect(weak).toEqual([]);
    });

    it("gives every field as a six-digit hex", () => {
        for (const { p } of palettes)
            for (const key of Object.keys(p) as (keyof MonthPalette)[]) expect(p[key]).toMatch(/^#[0-9a-f]{6}$/);
    });

    it("keeps the hero's own hue on the cover, the glow, the accent, the ink and the night type", () => {
        const drift = palettes
            .filter(({ hex }) => hexToAccent(hex).chroma > 0.04)
            .flatMap(({ name, hex, p }) =>
                (["bg", "glow", "accent", "ink", "night"] as const).map((k) => ({
                    field: `${name} ${k}`,
                    gap: Math.round(hueGap(hex, p[k])),
                })),
            )
            .filter((d) => d.gap > 12);
        expect(drift).toEqual([]);
    });

    it("gives heroes of different colours different covers", () => {
        expect(heroPalette("#C93C26").bg).not.toBe(heroPalette("#2092AE").bg);
    });

    it("reads the hex with or without a hash, in either case", () => {
        expect(heroPalette("c93c26")).toEqual(heroPalette("#C93C26"));
    });
});
