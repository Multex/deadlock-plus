import { describe, expect, it } from "vitest";
import { layoutBuild } from "./layout";
import { SAFE_MAX_WIDTH, columnsAtEveryScale, minWidthForColumns, sharesRowAtEveryScale } from "./safe";

const COLUMN_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const SCREENS = [
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
    { width: 3840, height: 2160 },
];

describe("minWidthForColumns", () => {
    it.each(COLUMN_COUNTS)("stores 82n + 12 for %s columns", (n) => {
        expect(minWidthForColumns(n)).toBe(82 * n + 12);
    });

    it.each(COLUMN_COUNTS)("keeps %s columns at 1080p, 1440p and 2160p", (n) => {
        expect(columnsAtEveryScale(minWidthForColumns(n))).toBe(n);
        for (const screen of SCREENS) {
            const [drawn] = layoutBuild([{ width: minWidthForColumns(n), height: 400, items: n }], screen).categories;
            expect(drawn.columns).toBe(n);
        }
    });
});

describe("columnsAtEveryScale", () => {
    it.each(COLUMN_COUNTS.slice(1))("loses a column somewhere at 82n + 11.75 for %s columns", (n) => {
        expect(columnsAtEveryScale(82 * n + 11.75)).toBeLessThan(n);
    });

    it("drops the game's 1440p Fit width 257.25 to 2 columns at 2160p", () => {
        const fit = { width: 257.25, height: 282.75, items: 6 };
        expect(layoutBuild([fit], { width: 2560, height: 1440 }).categories[0].columns).toBe(3);
        expect(layoutBuild([fit], { width: 3840, height: 2160 }).categories[0].columns).toBe(2);
        expect(columnsAtEveryScale(257.25)).toBe(2);
    });
});

describe("sharesRowAtEveryScale", () => {
    it("rejects 600 + 449, which wraps by 1 px at 1440p", () => {
        expect(sharesRowAtEveryScale([600, 449])).toBe(false);
    });

    it("accepts 600 + 448, which fits at every scale", () => {
        expect(sharesRowAtEveryScale([600, 448])).toBe(true);
    });

    it("accepts 600 + 448.5, which fills the 1426 px row at 1440p exactly", () => {
        expect(sharesRowAtEveryScale([600, 448.5])).toBe(true);
    });

    it("accepts a single category, even past the cap", () => {
        expect(sharesRowAtEveryScale([1200])).toBe(true);
    });
});

describe("SAFE_MAX_WIDTH", () => {
    it("is the widest stored width no scale caps", () => {
        expect(SAFE_MAX_WIDTH).toBe(1059);
        for (const screen of SCREENS) {
            expect(layoutBuild([{ width: 1059, height: 200, items: 1 }], screen).categories[0].capped).toBe(false);
        }
        const qhd = { width: 2560, height: 1440 };
        expect(layoutBuild([{ width: 1059.25, height: 200, items: 1 }], qhd).categories[0].capped).toBe(true);
        expect(layoutBuild([{ width: 1060, height: 200, items: 1 }], qhd).categories[0].capped).toBe(true);
    });
});
