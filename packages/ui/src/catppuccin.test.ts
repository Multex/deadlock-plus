import { describe, expect, it } from "vitest";

import { contrast, hexToOklch, readableColour } from "./accent";
import palette from "./catppuccin-palette.json";
import { THEMES, oklchToHex, themeVariant } from "./themes";

const FLAVORS = ["latte", "frappe", "macchiato", "mocha"] as const;
const ACCENTS = [
    "rosewater",
    "flamingo",
    "pink",
    "mauve",
    "red",
    "maroon",
    "peach",
    "yellow",
    "green",
    "teal",
    "sky",
    "sapphire",
    "blue",
    "lavender",
];
const catppuccin = THEMES.find((t) => t.id === "catppuccin")!;
const colours = (flavor: (typeof FLAVORS)[number]): Record<string, string> => palette.flavors[flavor].colors;

// Catppuccin's style guide, as the app's tokens: Base for the page, Mantle and Crust for the panes around it,
// Surface for raised elements, Text and Subtext for copy, Red, Yellow and Green for errors, warnings and success.
const SURFACE_ROLES: Record<string, (dark: boolean) => string> = {
    background: () => "base",
    chrome: () => "crust",
    card: () => "mantle",
    popover: () => "crust",
    secondary: () => "surface0",
    muted: () => "surface0",
    accent: () => "surface0",
    foreground: () => "text",
    "card-foreground": () => "text",
    "popover-foreground": () => "text",
    "secondary-foreground": () => "text",
    "accent-foreground": () => "text",
    "primary-foreground": (dark) => (dark ? "crust" : "base"),
    "destructive-foreground": (dark) => (dark ? "crust" : "base"),
    "success-foreground": (dark) => (dark ? "crust" : "base"),
    "warning-foreground": (dark) => (dark ? "crust" : "base"),
    border: () => "surface1",
    input: () => "surface2",
    ring: () => "mauve",
};
const TEXT_ROLES: Record<string, string> = {
    "muted-foreground": "subtext0",
    brass: "mauve",
    primary: "green",
    success: "green",
    warning: "yellow",
    destructive: "red",
    "dd-hk": "yellow",
    "dd-am": "sapphire",
};

describe("the Catppuccin palette copy", () => {
    it("is palette.json v1.8.0, spot-checked against the published values", () => {
        expect(palette.version).toBe("1.8.0");
        expect(palette.source).toMatch(
            /^https:\/\/github\.com\/catppuccin\/palette\/blob\/[0-9a-f]{40}\/palette\.json$/,
        );
        expect(colours("latte")).toMatchObject({
            base: "#eff1f5",
            text: "#4c4f69",
            mauve: "#8839ef",
            yellow: "#df8e1d",
        });
        expect(colours("frappe")).toMatchObject({ base: "#303446", crust: "#232634", red: "#e78284", teal: "#81c8be" });
        expect(colours("macchiato")).toMatchObject({ base: "#24273a", mantle: "#1e2030", sapphire: "#7dc4e4" });
        expect(colours("mocha")).toMatchObject({
            base: "#1e1e2e",
            text: "#cdd6f4",
            mauve: "#cba6f7",
            green: "#a6e3a1",
        });
    });

    it("has 26 colours in each flavour, the 14 accents among them", () => {
        for (const flavor of FLAVORS) {
            expect(Object.keys(colours(flavor)), flavor).toHaveLength(26);
            for (const accent of ACCENTS)
                expect(colours(flavor)[accent], `${flavor} ${accent}`).toMatch(/^#[0-9a-f]{6}$/);
        }
        expect(palette.flavors.latte.dark).toBe(false);
        expect(FLAVORS.filter((f) => palette.flavors[f].dark)).toEqual(["frappe", "macchiato", "mocha"]);
    });
});

describe("the Catppuccin theme", () => {
    it("names each flavour as Catppuccin does, light for Latte only", () => {
        for (const flavor of FLAVORS) {
            const variant = catppuccin.variants.find((v) => v.id === flavor)!;
            expect(variant.name).toBe(palette.flavors[flavor].name);
            expect(variant.light).toBe(!palette.flavors[flavor].dark);
        }
    });

    it("paints every surface, border and plain text colour in the flavour's exact colour", () => {
        for (const flavor of FLAVORS) {
            const { tokens } = themeVariant(catppuccin, flavor);
            const dark = palette.flavors[flavor].dark;
            for (const [token, role] of Object.entries(SURFACE_ROLES)) {
                expect(oklchToHex(tokens[token]!), `${flavor} ${token}`).toBe(colours(flavor)[role(dark)]);
            }
        }
    });

    it("keeps a coloured text exact where it reads at 4.5:1, and moves only its lightness where it does not", () => {
        for (const flavor of FLAVORS) {
            const variant = themeVariant(catppuccin, flavor);
            for (const [token, role] of Object.entries(TEXT_ROLES)) {
                const exact = hexToOklch(colours(flavor)[role]!);
                expect(variant.tokens[token], `${flavor} ${token}`).toBe(readableColour(variant, exact));
            }
        }
    });

    it("draws Mocha and Macchiato text in their exact colours, with nothing to move", () => {
        for (const flavor of ["mocha", "macchiato"] as const) {
            const { tokens } = themeVariant(catppuccin, flavor);
            for (const [token, role] of Object.entries(TEXT_ROLES)) {
                expect(oklchToHex(tokens[token]!), `${flavor} ${token}`).toBe(colours(flavor)[role]);
            }
        }
    });

    it("darkens Latte's yellow for text, keeping its hue, since the published one reads at 2.3:1 on Base", () => {
        const latte = themeVariant(catppuccin, "latte");
        const published = latte.variants[0]!.accents.yellow!;
        const hue = (c: string) => Number(/oklch\([\d.]+ [\d.]+ ([\d.]+)\)/.exec(c)![1]);

        expect(contrast(published, latte.tokens.background!)).toBeLessThan(2.5);
        expect(latte.tokens.warning).not.toBe(published);
        expect(hue(latte.tokens.warning!)).toBeCloseTo(hue(published), 0);
        expect(contrast(latte.tokens.warning!, latte.tokens.accent!)).toBeGreaterThanOrEqual(4.5);
    });

    it("offers all 14 accents in every flavour, in the flavour's exact colours", () => {
        for (const variant of catppuccin.variants) {
            expect(Object.keys(variant.accents)).toEqual(ACCENTS);
            for (const accent of ACCENTS) {
                const hex = colours(variant.id as (typeof FLAVORS)[number])[accent]!;
                expect(variant.accents[accent], `${variant.id} ${accent}`).toBe(hexToOklch(hex));
                expect(oklchToHex(variant.accents[accent]!), `${variant.id} ${accent}`).toBe(hex);
            }
        }
    });
});
