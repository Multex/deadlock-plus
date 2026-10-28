import { beforeEach, describe, expect, it } from "vitest";
import en from "../../../../../locales/en.json";
import { i18n, tn } from "./i18n.svelte";

describe("en counted labels", () => {
    beforeEach(() => i18n.reset({ en }, "en"));

    it("agrees with a count of one", () => {
        expect(tn("builds.editor.drag_items", 1)).toBe("1 item");
        expect(tn("builds.editor.copies_hint", 1)).toBe("In this build 1 time");
        expect(tn("performance.frametimes.recording", 1, { time: "0:01" })).toBe("Recording · 0:01 · 1 frame");
        expect(tn("performance.frametimes.graph_caption", 1, { ms: "16" })).toBe("Last 1 frame · top of graph 16 ms");
        expect(tn("performance.frametimes.summary", 1, { time: "0:01" })).toMatch(/^1 frame over 0:01\. /);
    });

    it("agrees with a larger count", () => {
        expect(tn("builds.editor.drag_items", 3)).toBe("3 items");
        expect(tn("builds.editor.copies_hint", 3)).toBe("In this build 3 times");
        expect(tn("performance.frametimes.recording", 1200, { time: "0:20" })).toBe("Recording · 0:20 · 1,200 frames");
        expect(tn("performance.frametimes.graph_caption", 240, { ms: "33" })).toBe(
            "Last 240 frames · top of graph 33 ms",
        );
        expect(tn("performance.frametimes.summary", 1200, { time: "0:20" })).toMatch(/^1,200 frames over 0:20\. /);
    });
});

describe("locale files", () => {
    it("hold no replacement characters from a lossy re-encode", async () => {
        const files = import.meta.glob("../../../../../locales/*.json", {
            query: "?raw",
            import: "default",
            eager: true,
        });
        const broken = Object.entries(files)
            .filter(([, text]) => (text as string).includes("\ufffd"))
            .map(([path]) => path);
        expect(broken).toEqual([]);
    });
});
