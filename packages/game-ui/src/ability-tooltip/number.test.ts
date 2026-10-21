import { describe, expect, it } from "vitest";
import { formatShownNumber, roundHalfEven, shownDecimals } from "./number";

describe("roundHalfEven", () => {
    it("rounds an exact half to the even digit, as the game does", () => {
        expect(roundHalfEven(4.25, 1)).toBe(4.2);
        expect(roundHalfEven(1.75, 1)).toBe(1.8);
        expect(roundHalfEven(58.5, 0)).toBe(58);
        expect(roundHalfEven(59.5, 0)).toBe(60);
        expect(roundHalfEven(0.125, 2)).toBe(0.12);
    });

    it("rounds a value that only looks like a half by its stored binary value", () => {
        // 1.15 is stored as 1.149999..., 2.675 as 2.67499...
        expect(roundHalfEven(1.15, 1)).toBe(1.1);
        expect(roundHalfEven(2.675, 2)).toBe(2.67);
        // 0.35 is stored as 0.34999..., 0.45 as 0.450000...01.
        expect(roundHalfEven(0.35, 1)).toBe(0.3);
        expect(roundHalfEven(0.45, 1)).toBe(0.5);
    });

    it("rounds negative values by their size", () => {
        expect(roundHalfEven(-4.25, 1)).toBe(-4.2);
        expect(roundHalfEven(-2.5, 0)).toBe(-2);
        expect(roundHalfEven(-3.5, 0)).toBe(-4);
    });

    it("keeps integers and values that already fit", () => {
        expect(roundHalfEven(26, 1)).toBe(26);
        expect(roundHalfEven(1e21, 1)).toBe(1e21);
        expect(roundHalfEven(0.5, 2)).toBe(0.5);
        expect(roundHalfEven(0, 1)).toBe(0);
    });
});

describe("formatShownNumber", () => {
    it("trims trailing zeros and never groups digits", () => {
        expect(formatShownNumber(4.25, 1)).toBe("4.2");
        expect(formatShownNumber(26, 1)).toBe("26");
        expect(formatShownNumber(12500, 1)).toBe("12500");
        expect(formatShownNumber(0.06, 2)).toBe("0.06");
    });

    it("shows a value that rounds to zero without a minus", () => {
        expect(formatShownNumber(-0.04, 1)).toBe("0");
    });
});

describe("shownDecimals", () => {
    it("shows damage as whole numbers and the rest with one decimal", () => {
        expect(shownDecimals("tech_damage")).toBe(0);
        expect(shownDecimals("bullet_damage")).toBe(0);
        expect(shownDecimals("distance")).toBe(1);
        expect(shownDecimals(null)).toBe(1);
    });
});
