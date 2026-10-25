import { describe, expect, it } from "vitest";
import { dispatchViewDeps } from "./view-deps";

// Monday 2026-10-05 00:00 in Berlin, still Sunday afternoon in Los Angeles.
const BERLIN_MONDAY = 1791151200;

describe("dispatchViewDeps", () => {
    const deps = dispatchViewDeps({}, []);

    it("dates in the edition's own time zone", () => {
        expect(deps.day(BERLIN_MONDAY, "Europe/Berlin")).toBe("Mon, Oct 5");
        expect(deps.day(BERLIN_MONDAY, "America/Los_Angeles")).toBe("Sun, Oct 4");
    });

    it("prints a week as one inclusive range and a month by name", () => {
        const last = BERLIN_MONDAY + 7 * 86400 - 1;
        expect(deps.dayRange(BERLIN_MONDAY, last, "Europe/Berlin")).toMatch(/^Oct 5\s–\s11, 2026$/);
        expect(deps.month(BERLIN_MONDAY, "Europe/Berlin")).toBe("October 2026");
    });

    it("knows no hero it was not given", () => {
        expect(deps.hero(7)).toBeUndefined();
    });
});
