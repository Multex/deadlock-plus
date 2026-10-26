import { describe, expect, it } from "vitest";
import {
    AT_COVER,
    keyAction,
    lastStop,
    pointerAction,
    request,
    settle,
    shown,
    sleeveAction,
    stopLabel,
    turnPose,
    type ReaderState,
} from "./reader";

const at = (n: number): ReaderState => ({ at: n, goal: n, turn: null });
const key = (k: string, shiftKey = false) => ({ key: k, shiftKey });
const BOX = { left: 100, width: 800 };
const click = (x: number) => ({ x, dx: 0, dy: 0 });

describe("collectors stops", () => {
    it("has the cover plus one spread, or the cover plus two single pages", () => {
        expect(lastStop("spread")).toBe(1);
        expect(lastStop("pages")).toBe(2);
    });

    it("labels each stop by its printed page numbers", () => {
        expect(stopLabel(0, "spread")).toEqual({ key: "dispatch.monthly.spread.cover" });
        expect(stopLabel(1, "spread")).toEqual({ key: "dispatch.monthly.spread.pages", params: { from: 2, to: 3 } });
        expect(stopLabel(1, "pages")).toEqual({ key: "dispatch.collectors.page", params: { page: 2 } });
        expect(stopLabel(2, "pages")).toEqual({ key: "dispatch.collectors.page", params: { page: 3 } });
    });
});

describe("collectors request", () => {
    it("opens the cover one stop at a time", () => {
        expect(request(AT_COVER, "next", 2)).toEqual({ at: 0, goal: 1, turn: 1 });
    });

    it("does nothing past either end", () => {
        expect(request(AT_COVER, "prev", 2)).toBe(AT_COVER);
        expect(request(at(2), "next", 2)).toEqual(at(2));
        expect(request(at(1), "last", 1)).toEqual(at(1));
    });

    it("jumps first, last and close in one turn", () => {
        expect(request(at(2), "close", 2)).toEqual({ at: 2, goal: 0, turn: 0 });
        expect(request(at(2), "first", 2)).toEqual({ at: 2, goal: 1, turn: 1 });
        expect(request(AT_COVER, "last", 2)).toEqual({ at: 0, goal: 2, turn: 2 });
    });

    it("queues steps behind the turn in flight and plays them on settle", () => {
        const moving = request(AT_COVER, "next", 2);
        const queued = request(moving, "next", 2);
        expect(queued).toEqual({ at: 0, goal: 2, turn: 1 });
        const landed = settle(queued);
        expect(landed).toEqual({ at: 1, goal: 2, turn: 2 });
        expect(settle(landed)).toEqual(at(2));
    });

    it("turns back after the turn in flight when asked to reverse", () => {
        const moving = request(at(1), "next", 2);
        const back = request(moving, "prev", 2);
        expect(back.turn).toBe(2);
        expect(back.goal).toBe(1);
        expect(settle(back)).toEqual({ at: 2, goal: 1, turn: 1 });
    });

    it("shows the stop it is turning to", () => {
        expect(shown(request(AT_COVER, "next", 2))).toBe(1);
        expect(shown(at(2))).toBe(2);
    });
});

describe("collectors keys", () => {
    it("tears the sealed copy on Enter or Space and ignores page keys", () => {
        expect(keyAction(key("Enter"), "sealed", 0)).toBe("tear");
        expect(keyAction(key(" "), "sealed", 0)).toBe("tear");
        expect(keyAction(key("ArrowRight"), "sealed", 0)).toBeNull();
        expect(keyAction(key("Escape"), "sealed", 0)).toBeNull();
    });

    it("waits out the tear", () => {
        expect(keyAction(key("Enter"), "tearing", 0)).toBeNull();
    });

    it("opens the cover on Enter, arrows, PageDown and Space", () => {
        for (const k of ["Enter", "ArrowRight", "PageDown", " "]) expect(keyAction(key(k), "open", 0)).toBe("next");
    });

    it("leaves Escape on the cover to the room", () => {
        expect(keyAction(key("Escape"), "open", 0)).toBeNull();
    });

    it("turns between pages and closes on Escape inside", () => {
        expect(keyAction(key("ArrowLeft"), "open", 1)).toBe("prev");
        expect(keyAction(key("PageUp"), "open", 1)).toBe("prev");
        expect(keyAction(key(" ", true), "open", 2)).toBe("prev");
        expect(keyAction(key("Home"), "open", 2)).toBe("first");
        expect(keyAction(key("End"), "open", 1)).toBe("last");
        expect(keyAction(key("Escape"), "open", 1)).toBe("close");
        expect(keyAction(key("Enter"), "open", 1)).toBeNull();
        expect(keyAction(key("a"), "open", 1)).toBeNull();
    });
});

describe("collectors pointer", () => {
    it("opens the cover from a click anywhere on it", () => {
        expect(pointerAction(click(150), BOX, 0, 1)).toBe("next");
        expect(pointerAction(click(850), BOX, 0, 1)).toBe("next");
    });

    it("turns on from the right half and back from the left half", () => {
        expect(pointerAction(click(800), BOX, 1, 2)).toBe("next");
        expect(pointerAction(click(200), BOX, 1, 2)).toBe("prev");
        expect(pointerAction(click(800), BOX, 1, 1)).toBeNull();
    });

    it("turns the way a sideways pull goes", () => {
        expect(pointerAction({ x: 300, dx: -120, dy: 10 }, BOX, 1, 2)).toBe("next");
        expect(pointerAction({ x: 700, dx: 120, dy: 10 }, BOX, 1, 2)).toBe("prev");
        expect(pointerAction({ x: 700, dx: 30, dy: 120 }, BOX, 1, 2)).toBeNull();
    });

    it("tears the sleeve from a click or a pull anywhere on it", () => {
        expect(sleeveAction({ x: 400, dx: 0, dy: 0 })).toBe("tear");
        expect(sleeveAction({ x: 400, dx: 140, dy: 12 })).toBe("tear");
        expect(sleeveAction({ x: 400, dx: -140, dy: 12 })).toBe("tear");
        expect(sleeveAction({ x: 400, dx: 10, dy: 120 })).toBeNull();
    });
});

describe("collectors turn pose", () => {
    it("swings the leaf on top away on a forward turn and lands it on a turn back", () => {
        expect(turnPose(0, 1)).toEqual({ top: "from", angle: 0 });
        expect(turnPose(1, 1).angle).toBeLessThanOrEqual(-90);
        expect(turnPose(0, -1).top).toBe("to");
        expect(turnPose(0, -1).angle).toBeLessThanOrEqual(-90);
        expect(turnPose(1, -1)).toEqual({ top: "to", angle: 0 });
    });

    it("moves monotonically", () => {
        const a = [0, 0.25, 0.5, 0.75, 1].map((k) => turnPose(k, 1).angle);
        for (let i = 1; i < a.length; i++) expect(a[i]).toBeLessThanOrEqual(a[i - 1]);
    });
});
