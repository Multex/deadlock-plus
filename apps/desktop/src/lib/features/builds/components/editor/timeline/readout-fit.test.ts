import { describe, expect, it } from "vitest";
import { readoutPlacement } from "../../../editor/timeline";
import { readoutFit } from "./readout-fit";

describe("readoutFit", () => {
    // A strip 1200 px wide whose top sits 500 px down a pane that spans 40 to 900; the item tooltip's main column is
    // 450 px and its ALT column adds 335 px beside it.
    const base = {
        anchor: 600,
        half: 19,
        gap: 6,
        track: { width: 1200, top: 500, bottom: 640 },
        bounds: { top: 40, bottom: 900 },
    };
    const short = { width: 450, height: 300 };
    const tall = { width: 450, height: 500 };
    const span = (placed: { left: number }) => [placed.left, placed.left + 450 + 335];

    it("places a readout without a details column as before, details side right", () => {
        const options = { ...base, tip: short };
        expect(readoutFit({ ...options, details: 0 })).toEqual({ ...readoutPlacement(options), side: "right" });
    });

    it("opens the details column left, inside the strip, for an anchor at the right edge", () => {
        const placed = readoutFit({ ...base, anchor: 1180, tip: short, details: 335 });
        expect(placed.side).toBe("left");
        expect(placed.top).toBe(-306);
        const [from, to] = span(placed);
        expect(from).toBeGreaterThanOrEqual(0);
        expect(to).toBeLessThanOrEqual(1200);
        // The main column still sits over the anchor.
        expect(from + 335).toBeLessThanOrEqual(1180);
        expect(to).toBeGreaterThanOrEqual(1180);
    });

    it("opens the details column right while it fits there", () => {
        expect(readoutFit({ ...base, tip: short, details: 335 })).toEqual({ left: 375, top: -306, side: "right" });
        expect(readoutFit({ ...base, anchor: 20, tip: short, details: 335 })).toEqual({
            left: 0,
            top: -306,
            side: "right",
        });
    });

    it("beside the anchor, keeps the whole tooltip off the icon on the side with room", () => {
        const right = readoutFit({ ...base, anchor: 300, tip: tall, details: 335 });
        expect(right).toEqual({ left: 325, top: -360, side: "right" });

        const left = readoutFit({ ...base, anchor: 1100, tip: tall, details: 335 });
        expect(left.side).toBe("left");
        const [from, to] = span(left);
        expect(from).toBeGreaterThanOrEqual(0);
        expect(to).toBeLessThanOrEqual(1100 - 19 - 6);
    });

    it("pins a tooltip wider than the strip to its left edge", () => {
        const placed = readoutFit({
            ...base,
            anchor: 650,
            track: { ...base.track, width: 700 },
            tip: short,
            details: 335,
        });
        expect(placed.left).toBe(0);
    });
});
