import { describe, expect, it } from "vitest";
import { dragScroll, edgeSpeed, reveal, sidewaysWheel } from "./track-scroll";

describe("sidewaysWheel", () => {
    it("turns a vertical wheel turn into a sideways scroll", () => {
        expect(sidewaysWheel({ deltaX: 0, deltaY: 100, deltaMode: 0 }, 500)).toBe(100);
        expect(sidewaysWheel({ deltaX: 0, deltaY: -40, deltaMode: 0 }, 500)).toBe(-40);
    });

    it("keeps a sideways swipe as it is", () => {
        expect(sidewaysWheel({ deltaX: 30, deltaY: 5, deltaMode: 0 }, 500)).toBe(30);
    });

    it("counts lines and pages in pixels", () => {
        expect(sidewaysWheel({ deltaX: 0, deltaY: 3, deltaMode: 1 }, 500)).toBe(48);
        expect(sidewaysWheel({ deltaX: 0, deltaY: 1, deltaMode: 2 }, 500)).toBe(500);
    });
});

describe("edgeSpeed", () => {
    const box = { left: 100, right: 500 };

    it("does not scroll away from the edges", () => {
        expect(edgeSpeed(300, box)).toBe(0);
        expect(edgeSpeed(100 + 48, box)).toBe(0);
    });

    it("scrolls toward the edge the pointer is near, faster the closer it gets", () => {
        expect(edgeSpeed(120, box)).toBeLessThan(0);
        expect(edgeSpeed(480, box)).toBeGreaterThan(0);
        expect(edgeSpeed(495, box)).toBeGreaterThan(edgeSpeed(480, box));
        expect(edgeSpeed(105, box)).toBeLessThan(edgeSpeed(120, box));
    });

    it("scrolls at full speed past the edge", () => {
        expect(edgeSpeed(40, box)).toBe(-edgeSpeed(900, box));
        expect(edgeSpeed(900, box)).toBe(edgeSpeed(500, box));
    });
});

describe("dragScroll", () => {
    const view = { scrollLeft: 100, width: 300 };

    it("moves by the edge speed", () => {
        expect(dragScroll(view, 12, 1000)).toBe(112);
        expect(dragScroll(view, -12, 1000)).toBe(88);
    });

    it("stops scrolling right once the end of the steps is in view, so the drop caret stays visible", () => {
        expect(dragScroll(view, 12, 405)).toBe(105);
        expect(dragScroll({ scrollLeft: 105, width: 300 }, 12, 405)).toBe(105);
    });

    it("never scrolls back to reach that end, and never before the start", () => {
        expect(dragScroll({ scrollLeft: 300, width: 300 }, 12, 405)).toBe(300);
        expect(dragScroll({ scrollLeft: 5, width: 300 }, -12, 405)).toBe(0);
    });
});

describe("reveal", () => {
    const view = { scrollLeft: 200, width: 400 };

    it("leaves the scroll alone when the range is already in view", () => {
        expect(reveal(view, 250, 350)).toBe(200);
    });

    it("scrolls right just far enough to show a range past the right edge", () => {
        expect(reveal(view, 580, 700)).toBe(300);
    });

    it("scrolls left to show a range before the left edge", () => {
        expect(reveal(view, 120, 180)).toBe(120);
    });

    it("never scrolls before the start", () => {
        expect(reveal(view, -10, 20)).toBe(0);
    });
});
