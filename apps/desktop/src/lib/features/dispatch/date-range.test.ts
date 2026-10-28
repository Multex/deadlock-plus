import { describe, expect, it } from "vitest";
import { dateRange } from "./date-range";

const f = (locale: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

describe("dateRange", () => {
    it("joins the ends with a word instead of a dash", () => {
        expect(dateRange(f("en-US"), Date.UTC(2026, 9, 5), Date.UTC(2026, 9, 11), "to")).toBe("Oct 5 to 11, 2026");
        expect(dateRange(f("en-US"), Date.UTC(2026, 9, 5), Date.UTC(2026, 10, 1), "to")).toBe("Oct 5 to Nov 1, 2026");
        expect(dateRange(f("de"), Date.UTC(2026, 9, 5), Date.UTC(2026, 9, 11), "bis")).not.toMatch(/[–—]/);
    });

    it("prints one date when both ends fall on the same day", () => {
        expect(dateRange(f("en-US"), Date.UTC(2026, 9, 5), Date.UTC(2026, 9, 5, 5), "to")).toBe("Oct 5, 2026");
    });
});
