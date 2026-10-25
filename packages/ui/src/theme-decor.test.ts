import { describe, expect, it } from "vitest";

import { THEMES } from "./themes";
import { decorLoader, decorThemeIds } from "./theme-decor";

const load = (id: string) => () => Promise.resolve({ default: id });

describe("decorLoader", () => {
    const modules = {
        "./themes/midnight/decor.svelte": load("midnight"),
        "./themes/flint-snow/decor.svelte": load("fs"),
    };

    it("finds the decor of the theme in use", async () => {
        expect(await decorLoader(modules, "flint-snow")?.()).toEqual({ default: "fs" });
    });

    it("has nothing for a theme without decor", () => {
        expect(decorLoader(modules, "contrast")).toBeUndefined();
    });
});

describe("decor folders", () => {
    it("are each named after a theme in themes.json", () => {
        const folders = decorThemeIds(Object.keys(import.meta.glob("./themes/*/decor.svelte")));
        const ids = new Set(THEMES.map((t) => t.id));

        for (const folder of folders) expect(ids, folder).toContain(folder);
    });
});
