import { describe, expect, it } from "vitest";
import {
    CLOSED,
    LAST_SPREAD,
    keyAction,
    leafTargets,
    leftStack,
    pointerAction,
    request,
    settle,
    shown,
    spreadPages,
    type ReaderState,
} from "./reader";

const settleAll = (s: ReaderState) => {
    for (let i = 0; i < 10 && s.turn; i++) s = settle(s);
    return s;
};

describe("monthly reader turns", () => {
    it("opens from the cover with one forward turn", () => {
        const s = request(CLOSED, "next");
        expect(s).toEqual({ at: 0, goal: 1, turn: 1 });
        expect(settle(s)).toEqual({ at: 1, goal: 1, turn: null });
    });

    it("does nothing past either end", () => {
        expect(request(CLOSED, "prev")).toEqual(CLOSED);
        expect(request(CLOSED, "close")).toEqual(CLOSED);
        const last = settleAll(request(CLOSED, "last"));
        expect(last.at).toBe(LAST_SPREAD);
        expect(request(last, "next")).toEqual(last);
    });

    it("queues fast presses as one turn after another, never two leaves at once", () => {
        let s = request(CLOSED, "next");
        s = request(s, "next");
        s = request(s, "next");
        s = request(s, "next");
        expect(s).toEqual({ at: 0, goal: LAST_SPREAD, turn: 1 });
        s = settle(s);
        expect(s).toEqual({ at: 1, goal: LAST_SPREAD, turn: 2 });
        expect(settle(s)).toEqual({ at: 2, goal: 2, turn: null });
    });

    it("drops a page back when the reader changes their mind mid-turn", () => {
        let s = request(CLOSED, "next");
        s = request(s, "prev");
        expect(s).toEqual({ at: 0, goal: 0, turn: 0 });
        expect(settle(s)).toEqual(CLOSED);
    });

    it("a back press cancels a queued turn before it reverses the one in flight", () => {
        let s = request(request(CLOSED, "next"), "next");
        s = request(s, "prev");
        expect(s).toEqual({ at: 0, goal: 1, turn: 1 });
    });

    it("closes and jumps in one flip, not page by page", () => {
        const open = settleAll(request(CLOSED, "last"));
        expect(request(CLOSED, "last")).toEqual({ at: 0, goal: 2, turn: 2 });
        const closing = request(open, "close");
        expect(closing).toEqual({ at: 2, goal: 0, turn: 0 });
        expect(settle(closing)).toEqual(CLOSED);
        expect(request(open, "first").turn).toBe(0);
    });

    it("a jump mid-turn sends every leaf straight there", () => {
        const midway = settle(request(request(CLOSED, "next"), "next"));
        expect(request(midway, "close")).toEqual({ at: 1, goal: 0, turn: 0 });
        expect(request(request(CLOSED, "next"), "last")).toEqual({ at: 0, goal: 2, turn: 2 });
    });

    it("shows where the reader is headed, and which leaves lie turned there", () => {
        expect(shown(CLOSED)).toBe(0);
        expect(shown(request(CLOSED, "next"))).toBe(1);
        expect(leafTargets(0)).toEqual({ p1: 0, p2: 0 });
        expect(leafTargets(1)).toEqual({ p1: 1, p2: 0 });
        expect(leafTargets(2)).toEqual({ p1: 1, p2: 1 });
    });

    it("numbers each spread's pages", () => {
        expect(spreadPages(0)).toBeNull();
        expect(spreadPages(1)).toEqual({ from: 2, to: 3 });
        expect(spreadPages(2)).toEqual({ from: 4, to: 5 });
    });
});

describe("monthly reader input", () => {
    it.each([
        ["ArrowRight", "next"],
        ["PageDown", "next"],
        ["ArrowLeft", "prev"],
        ["PageUp", "prev"],
        ["Home", "first"],
        ["End", "last"],
    ] as const)("%s turns %s", (key, action) => {
        expect(keyAction({ key, shiftKey: false }, true)).toBe(action);
        expect(keyAction({ key, shiftKey: false }, false)).toBe(action);
    });

    it("Escape closes an open magazine and is left alone on the cover", () => {
        expect(keyAction({ key: "Escape", shiftKey: false }, true)).toBe("close");
        expect(keyAction({ key: "Escape", shiftKey: false }, false)).toBeNull();
    });

    it("Enter and Space open the cover; Space reads on, Shift+Space back", () => {
        expect(keyAction({ key: "Enter", shiftKey: false }, false)).toBe("next");
        expect(keyAction({ key: " ", shiftKey: false }, false)).toBe("next");
        expect(keyAction({ key: " ", shiftKey: false }, true)).toBe("next");
        expect(keyAction({ key: " ", shiftKey: true }, true)).toBe("prev");
        expect(keyAction({ key: "Enter", shiftKey: false }, true)).toBeNull();
        expect(keyAction({ key: "a", shiftKey: false }, true)).toBeNull();
    });

    const box = { left: 100, width: 800 };
    const tap = (x: number, dx = 0, dy = 0) => ({ x, dx, dy });

    it("a click on the closed cover opens it; the empty space beside it does nothing", () => {
        expect(pointerAction(tap(700), box, 0)).toBe("next");
        expect(pointerAction(tap(300), box, 0)).toBeNull();
    });

    it("a click on the right page turns on, on the left page turns back", () => {
        expect(pointerAction(tap(700), box, 1)).toBe("next");
        expect(pointerAction(tap(300), box, 1)).toBe("prev");
        expect(pointerAction(tap(700), box, LAST_SPREAD)).toBeNull();
        expect(pointerAction(tap(300), box, LAST_SPREAD)).toBe("prev");
    });

    it("a sideways drag turns the way the page was pulled, wherever it started", () => {
        expect(pointerAction(tap(300, -80, 10), box, 1)).toBe("next");
        expect(pointerAction(tap(700, 80, -10), box, 1)).toBe("prev");
        expect(pointerAction(tap(700, -80, 0), box, 0)).toBe("next");
        expect(pointerAction(tap(700, 80, 0), box, 0)).toBeNull();
    });

    it("a mostly vertical or tiny drag is neither a swipe nor a click", () => {
        expect(pointerAction(tap(700, 20, 90), box, 1)).toBeNull();
        expect(pointerAction(tap(700, 20, 2), box, 1)).toBeNull();
    });
});

describe("monthly reader left page block", () => {
    it("stays away while the bottom leaf is anywhere off the table", () => {
        for (const a of [0, -10, -90, -120, -150, -165]) expect(leftStack(a)).toBe(0);
    });

    it("shows in full once that leaf lies flat on the left", () => {
        expect(leftStack(-180)).toBe(1);
    });

    it("fades in over the last degrees of the landing", () => {
        const fade = [-168, -172, -176, -179].map(leftStack);
        expect(fade.every((v, i) => v > 0 && v < 1 && (i === 0 || v > fade[i - 1]!))).toBe(true);
    });
});
