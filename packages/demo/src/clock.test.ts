import { afterEach, describe, expect, it } from "vitest";
import { shiftClock } from "./clock";

const TARGET = Date.UTC(2026, 9, 12, 19, 30, 0);

describe("shiftClock", () => {
    let restore = () => {};
    afterEach(() => restore());

    it("moves now to the target and keeps it running", () => {
        restore = shiftClock(TARGET);
        expect(Math.abs(Date.now() - TARGET)).toBeLessThan(1000);
        expect(Math.abs(new Date().getTime() - TARGET)).toBeLessThan(1000);
    });

    it("leaves explicit dates alone", () => {
        restore = shiftClock(TARGET);
        expect(new Date(2020, 0, 2).getFullYear()).toBe(2020);
        expect(new Date("2021-03-04T00:00:00Z").getTime()).toBe(Date.UTC(2021, 2, 4));
        expect(Date.UTC(2022, 0, 1)).toBe(1640995200000);
        expect(new Date() instanceof Date).toBe(true);
    });

    it("gives the real clock back", () => {
        const real = Date;
        shiftClock(TARGET)();
        expect(Date).toBe(real);
        expect(Math.abs(Date.now() - TARGET)).toBeGreaterThan(1000);
    });
});
