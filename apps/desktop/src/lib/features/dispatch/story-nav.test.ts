import { describe, expect, it } from "vitest";
import { cardScale, clampCard, keyAction, stepCard, trapFocus } from "./story-nav";

describe("clampCard", () => {
    it("keeps the index inside the deck", () => {
        expect(clampCard(-1, 4)).toBe(0);
        expect(clampCard(2, 4)).toBe(2);
        expect(clampCard(9, 4)).toBe(3);
    });

    it("stays at 0 for an empty deck", () => {
        expect(clampCard(3, 0)).toBe(0);
    });
});

describe("stepCard", () => {
    it("moves one card and stops at either end", () => {
        expect(stepCard(0, 3, "next")).toBe(1);
        expect(stepCard(2, 3, "next")).toBe(2);
        expect(stepCard(2, 3, "prev")).toBe(1);
        expect(stepCard(0, 3, "prev")).toBe(0);
    });
});

describe("keyAction", () => {
    it("maps arrows, Space and Escape", () => {
        expect(keyAction("ArrowRight")).toBe("next");
        expect(keyAction(" ")).toBe("next");
        expect(keyAction("ArrowLeft")).toBe("prev");
        expect(keyAction("Escape")).toBe("close");
        expect(keyAction("a")).toBeNull();
        expect(keyAction("Tab")).toBeNull();
    });

    it("leaves Space and Enter to a focused button", () => {
        expect(keyAction(" ", true)).toBeNull();
        expect(keyAction("Enter", true)).toBeNull();
        expect(keyAction("ArrowRight", true)).toBe("next");
        expect(keyAction("Escape", true)).toBe("close");
    });
});

describe("trapFocus", () => {
    it("wraps Tab from the last control to the first", () => {
        expect(trapFocus(2, 3, false)).toBe(0);
        expect(trapFocus(1, 3, false)).toBeNull();
    });

    it("wraps Shift+Tab from the first control to the last", () => {
        expect(trapFocus(0, 3, true)).toBe(2);
        expect(trapFocus(1, 3, true)).toBeNull();
    });

    it("pulls focus in from outside", () => {
        expect(trapFocus(-1, 3, false)).toBe(0);
        expect(trapFocus(-1, 3, true)).toBe(2);
    });

    it("holds focus when there is nothing to tab to", () => {
        expect(trapFocus(-1, 0, false)).toBe(-1);
    });
});

describe("cardScale", () => {
    it("fits the card to the window height", () => {
        expect(cardScale(1600, 1000, 540, 960, 20)).toBeCloseTo(1);
    });

    it("shrinks to the width when the window is narrow", () => {
        expect(cardScale(310, 2000, 540, 960, 20)).toBeCloseTo(0.5);
    });

    it("is 0 before the window is measured", () => {
        expect(cardScale(0, 0, 540, 960, 20)).toBe(0);
    });
});
