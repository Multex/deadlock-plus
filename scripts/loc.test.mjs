import { describe, expect, it } from "vitest";
import { countLines, languageOf, renderTable, replaceBlock, tally } from "./loc.mjs";

describe("countLines", () => {
    it("counts lines that are not blank or whitespace", () => {
        expect(countLines("a\n\n  \nb\r\n\tc\n")).toBe(3);
    });

    it("returns zero for an empty file", () => {
        expect(countLines("")).toBe(0);
    });
});

describe("languageOf", () => {
    it("maps source extensions to a language", () => {
        expect(languageOf("crates/dp-live/src/feed.rs")).toBe("Rust");
        expect(languageOf("apps/desktop/src/lib/x.ts")).toBe("TypeScript");
        expect(languageOf("apps/desktop/src/routes/+page.svelte")).toBe("Svelte");
        expect(languageOf("scripts/loc.mjs")).toBe("JavaScript");
        expect(languageOf("apps/web/src/app.css")).toBe("CSS");
    });

    it("skips other files, translations and generated bindings", () => {
        expect(languageOf("README.md")).toBeNull();
        expect(languageOf("locales/en.json")).toBeNull();
        expect(languageOf("packages/ipc-types/src/bindings.ts")).toBeNull();
    });
});

describe("tally", () => {
    it("sums files and lines per language, largest first, with a total", () => {
        const result = tally([
            { path: "a.ts", source: "x\ny\n" },
            { path: "b.rs", source: "x\ny\nz\n" },
            { path: "c.ts", source: "x\n\n" },
            { path: "notes.md", source: "x\n" },
        ]);
        expect(result.rows).toEqual([
            { language: "TypeScript", files: 2, lines: 3 },
            { language: "Rust", files: 1, lines: 3 },
        ]);
        expect(result.total).toEqual({ files: 3, lines: 6 });
    });
});

describe("renderTable", () => {
    it("renders a markdown table with grouped thousands and a bold total", () => {
        const table = renderTable({
            rows: [{ language: "Rust", files: 316, lines: 60691 }],
            total: { files: 316, lines: 60691 },
        });
        expect(table).toBe(
            [
                "| Language | Files | Lines |",
                "| --- | ---: | ---: |",
                "| Rust | 316 | 60,691 |",
                "| **Total** | **316** | **60,691** |",
            ].join("\n"),
        );
    });
});

describe("replaceBlock", () => {
    it("replaces only the text between the markers", () => {
        const readme = "top\n<!-- loc:start -->\nold\n<!-- loc:end -->\nbottom\n";
        expect(replaceBlock(readme, "new")).toBe("top\n<!-- loc:start -->\nnew\n<!-- loc:end -->\nbottom\n");
    });

    it("throws when the markers are missing", () => {
        expect(() => replaceBlock("no markers here", "new")).toThrow(/loc:start/);
    });
});
