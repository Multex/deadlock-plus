import { describe, expect, it } from "vitest";
import { layoutBuild, type BuildCategory, type Screen } from "./layout";
import { layoutPreview } from "./preview";

const QHD: Screen = { width: 2560, height: 1440 };
const FHD: Screen = { width: 1920, height: 1080 };
const UHD: Screen = { width: 3840, height: 2160 };

// S5 (2026-10-21, 1440p): "PICK 1 AFTER SPIRITUAL OVERFLOW", 352 x 225 px, three chips, beside one-line headers.
const PICK: BuildCategory = { width: 264, height: 168.75, items: 3 };

function pick(headerLines: number | undefined, screen: Screen = QHD) {
    return layoutBuild([{ ...PICK, headerLines }], screen).categories[0]!;
}

describe("header lines, measured at 1440p (S5)", () => {
    it("draws a one-line header 41 px tall and a two-line one 69 px tall", () => {
        expect(pick(undefined).header).toBe(41);
        expect(pick(1).header).toBe(41);
        expect(pick(2).header).toBe(69);
    });

    it("pushes the chips down 28 px per extra line, from 53 to 81 px below the box top", () => {
        const one = pick(1);
        const two = pick(2);
        expect(one.chips[0]!.y - one.box.y).toBe(53);
        expect(two.chips[0]!.y - two.box.y).toBe(81);
        expect(two.chips.map((chip) => chip.x)).toEqual(one.chips.map((chip) => chip.x));
    });

    it("keeps the box at its stored size", () => {
        expect(pick(2).box).toEqual(pick(1).box);
        expect(pick(2).box.height).toBe(225);
    });

    it("reports the chip row the stored height cuts off once the title wraps", () => {
        expect(pick(1).clippedRows).toBe(0);
        expect(pick(2).clippedRows).toBe(1);
    });

    it("counts every row whose chips pass the inner bottom edge", () => {
        const twoRows: BuildCategory = { width: 264, height: 282.75, items: 6 };
        const at = (headerLines: number) => layoutBuild([{ ...twoRows, headerLines }], QHD).categories[0]!;
        expect(at(1).clippedRows).toBe(0);
        expect(at(2).clippedRows).toBe(1);
        expect(at(7).clippedRows).toBe(1);
        expect(at(8).clippedRows).toBe(2);
    });

    it("leaves other categories in the row where they are", () => {
        const beside: BuildCategory = { width: 176, height: 168.75, items: 2 };
        const plain = layoutBuild([beside, PICK], QHD).categories;
        const wrapped = layoutBuild([beside, { ...PICK, headerLines: 2 }], QHD).categories;
        expect(wrapped[0]).toEqual(plain[0]);
        expect(wrapped[1]!.box).toEqual(plain[1]!.box);
    });
});

describe("header lines, predicted at 1080p and 2160p (unmeasured)", () => {
    it("adds 21 px per line at 1080p and 42 px at 2160p", () => {
        expect(pick(1, FHD).header).toBe(31);
        expect(pick(2, FHD).header).toBe(52);
        expect(pick(1, UHD).header).toBe(62);
        expect(pick(2, UHD).header).toBe(104);
    });
});

describe("header lines in the Build Browser preview (predicted)", () => {
    it("adds 18 px per line at 1440p and clips the row the shop clips", () => {
        const one = layoutPreview([{ ...PICK, headerLines: 1 }], QHD).categories[0]!;
        const two = layoutPreview([{ ...PICK, headerLines: 2 }], QHD).categories[0]!;
        expect(two.header - one.header).toBe(18);
        expect(two.chips[0]!.y - one.chips[0]!.y).toBe(18);
        expect(one.clippedRows).toBe(0);
        expect(two.clippedRows).toBe(1);
    });
});
