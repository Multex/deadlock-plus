import { describe, expect, it } from "vitest";
import { rotatedBox } from "../../fit";
import { BAR, BOOK, PAD, PAGE, bookLayout } from "./layout";
import { REST_ANGLE } from "./timeline";

const room = { width: 1230, height: 835 };
const stage = { left: 0, top: 0, width: 790, height: 835 };

describe("bookLayout", () => {
    it("fits the tilted cover inside the stage, above the bar, with room for its shadow", () => {
        const l = bookLayout(room, stage, 0);
        const box = rotatedBox(PAGE.width, PAGE.height, REST_ANGLE);
        expect(box.h * l.scale).toBeLessThanOrEqual(stage.height - BAR - PAD * 2 + 1e-6);
        expect(box.w * l.scale).toBeLessThanOrEqual(stage.width - PAD * 2 + 1e-6);
        expect(l.cx).toBeCloseTo(stage.left + stage.width / 2, 6);
        expect(l.cy).toBeCloseTo((stage.height - BAR) / 2, 6);
    });

    it("centres the cover, not the closed book, by shifting half a page", () => {
        expect(bookLayout(room, stage, 0).tx).toBe(-PAGE.width / 2);
        expect(bookLayout(room, stage, 1).tx).toBe(0);
    });

    it("opens into the whole room: the spread fits it and sits in its middle above the bar", () => {
        const l = bookLayout(room, stage, 1);
        expect(BOOK.width * l.scale).toBeLessThanOrEqual(room.width - PAD * 2 + 1e-6);
        expect(BOOK.height * l.scale).toBeLessThanOrEqual(room.height - BAR - PAD * 2 + 1e-6);
        expect(l.cx).toBeCloseTo(room.width / 2, 6);
        expect(l.cy).toBeCloseTo((room.height - BAR) / 2, 6);
        expect(l.rot).toBe(0);
    });

    it("moves and grows smoothly between the two", () => {
        const [a, b, c] = [0, 0.5, 1].map((o) => bookLayout(room, stage, o));
        expect(b!.cx).toBeGreaterThan(a!.cx);
        expect(b!.cx).toBeLessThan(c!.cx);
        expect(b!.scale).toBeCloseTo((a!.scale + c!.scale) / 2, 6);
    });

    it("is 0 until the stage is measured", () => {
        expect(bookLayout({ width: 0, height: 0 }, { left: 0, top: 0, width: 0, height: 0 }, 0).scale).toBe(0);
    });
});
