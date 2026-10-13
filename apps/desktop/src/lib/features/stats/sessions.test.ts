import { describe, expect, it } from "vitest";
import type { Highlight } from "@deadlock-plus/stats/sessions";
import { highlightTitle } from "./sessions";

describe("highlightTitle", () => {
    const h = (kind: Highlight["kind"], verdict: Highlight["verdict"]) => ({ kind, verdict }) as Highlight;
    it("is empty without a highlight", () => {
        expect(highlightTitle(null)).toBe("");
    });
    it("names the best recent session", () => {
        expect(highlightTitle(h("best", "good"))).toBe("Your best recent session");
    });
    it("praises the latest session by verdict", () => {
        expect(highlightTitle(h("latest", "excellent"))).toBe("Excellent last session. Well played.");
        expect(highlightTitle(h("latest", "good"))).toBe("Nice work. Your last session went well.");
    });
});
