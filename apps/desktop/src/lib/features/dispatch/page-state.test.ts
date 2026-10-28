import { describe, expect, it } from "vitest";
import { firstPaper } from "./page-state";

describe("firstPaper", () => {
    // Wednesday 2026-10-14 12:00 UTC; the next Monday is 2026-10-19.
    const NOW = Date.UTC(2026, 9, 14, 12) / 1000;

    it("comes out next Monday at 00:00 local", () => {
        expect(firstPaper(NOW, "UTC", 0).dateS).toBe(Date.UTC(2026, 9, 19) / 1000);
    });

    it("counts the matches still needed this week", () => {
        expect(firstPaper(NOW, "UTC", 0).needed).toBe(3);
        expect(firstPaper(NOW, "UTC", 2).needed).toBe(1);
        expect(firstPaper(NOW, "UTC", 5).needed).toBe(0);
    });
});
