import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

describe("theme decor", () => {
    it("remounts when a new accent reaches the page, since canvas decor reads its colours once on mount", () => {
        expect(read("./content-region.svelte")).toMatch(
            /\{#key appliedAccent\.key\}\s*<ThemeDecor [^>]*\/>\s*\{\/key\}/,
        );
    });

    it("hears of the accent only after its variables are written, so the remounted decor reads the new ones", () => {
        const startup = read("./startup.svelte.ts");
        const write = startup.indexOf("style.setProperty(name, value)");
        const stamp = startup.indexOf("appliedAccent.key =");
        expect(write).toBeGreaterThan(-1);
        expect(stamp).toBeGreaterThan(write);
    });
});
