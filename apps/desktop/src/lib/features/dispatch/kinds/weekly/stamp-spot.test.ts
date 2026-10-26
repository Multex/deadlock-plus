import { describe, expect, it } from "vitest";
import { rotatedBox } from "../../fit";
import { STAMP_ANGLE } from "./arrival";
import { STAMP_MARGIN, STAMP_WORD, stampCenter, stampWordWidth } from "./stamp-spot";

const PAPER = { width: 720, height: 1080 };
const STAMP = { width: 240, height: 90 };

describe("stampWordWidth", () => {
    it("sizes the stamp to the photo", () => {
        expect(stampWordWidth(260)).toBe(260 - STAMP_WORD.inset);
    });

    it("keeps the word readable beside a narrow photo and modest beside a wide one", () => {
        expect(stampWordWidth(80)).toBe(STAMP_WORD.min);
        expect(stampWordWidth(900)).toBe(STAMP_WORD.max);
    });
});

describe("stampCenter", () => {
    it("centres the stamp across the lower part of the photo", () => {
        const photo = { left: 200, top: 250, width: 260, height: 300 };
        expect(stampCenter(photo, STAMP, PAPER, STAMP_ANGLE)).toEqual({ x: 330, y: 250 + 300 * 0.62 });
    });

    it("keeps the tilted stamp on the sheet when the photo sits at its edge", () => {
        const photo = { left: 26, top: 200, width: 160, height: 220 };
        const c = stampCenter(photo, STAMP, PAPER, STAMP_ANGLE);
        const box = rotatedBox(STAMP.width, STAMP.height, STAMP_ANGLE);
        expect(c.x - box.w / 2).toBeCloseTo(STAMP_MARGIN);
        const low = stampCenter({ left: 26, top: 1000, width: 260, height: 200 }, STAMP, PAPER, STAMP_ANGLE);
        expect(low.y + box.h / 2).toBeCloseTo(PAPER.height - STAMP_MARGIN);
    });
});
