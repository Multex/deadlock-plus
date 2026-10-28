import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { THEMES } from "./themes";
import { THEME_PAGES, themeById, themeEffects, themeOgImage, themePath } from "./theme-pages";

describe("theme pages", () => {
    it("gives every theme a page under /themes", () => {
        expect(themePath("flint-snow")).toBe("/themes/flint-snow");
        expect(THEME_PAGES).toEqual(["/themes", ...THEMES.map((theme) => `/themes/${theme.id}`)]);
    });

    it("finds a theme by the id in its address, and nothing for one that is not a theme", () => {
        expect(themeById("nightshift")?.id).toBe("nightshift");
        expect(themeById("no-such-theme")).toBeUndefined();
        expect(themeById("")).toBeUndefined();
    });
});

describe("themeOgImage", () => {
    it("names a link preview of its own for every theme, and the file is there", () => {
        expect(themeOgImage("void")).toBe("/og/themes/void.jpg");
        for (const theme of THEMES) {
            const file = fileURLToPath(new URL(`../../../static${themeOgImage(theme.id)}`, import.meta.url));
            expect(existsSync(file), file).toBe(true);
        }
    });
});

describe("themeEffects", () => {
    const of = (id: string) => {
        const theme = themeById(id);
        if (!theme) throw new Error(id);
        return themeEffects(theme);
    };

    it("lists each effect a theme can turn off one by one", () => {
        expect(of("nightshift")).toEqual([
            "themes_page.effects.nightshift.rain",
            "themes_page.effects.nightshift.lights",
            "themes_page.effects.nightshift.frames",
            "themes_page.effects.nightshift.clock",
        ]);
        expect(of("flint-snow")).toContain("themes_page.effects.flint_snow.snow");
    });

    it("names a theme's effects in one line when they are one piece", () => {
        expect(of("void")).toEqual(["themes_page.effects.void"]);
        expect(of("deadlock")).toEqual(["themes_page.effects.deadlock"]);
    });

    it("lists nothing for a theme without effects", () => {
        expect(of("contrast")).toEqual([]);
        expect(of("catppuccin")).toEqual([]);
    });
});
