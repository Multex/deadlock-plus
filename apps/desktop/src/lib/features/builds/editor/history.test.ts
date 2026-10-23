import { describe, expect, it } from "vitest";
import { History } from "./history";

describe("History", () => {
    it("undoes and redoes pushes", () => {
        const h = new History("a");
        expect(h.canUndo).toBe(false);
        h.push("b");
        h.push("c");
        expect(h.undo()).toBe("b");
        expect(h.undo()).toBe("a");
        expect(h.canUndo).toBe(false);
        expect(h.canRedo).toBe(true);
        expect(h.redo()).toBe("b");
        expect(h.present).toBe("b");
    });

    it("drops the redo branch on a new push", () => {
        const h = new History("a");
        h.push("b");
        h.undo();
        h.push("c");
        expect(h.canRedo).toBe(false);
        expect(h.undo()).toBe("a");
    });

    it("folds pushes with the same merge key into one step", () => {
        const h = new History(0);
        h.push(1, "drag");
        h.push(2, "drag");
        h.push(3, "drag");
        expect(h.present).toBe(3);
        expect(h.undo()).toBe(0);
    });

    it("starts a new step on a different key, no key, or after an undo", () => {
        const h = new History(0);
        h.push(1, "a");
        h.push(2, "b");
        h.push(3);
        h.push(4);
        expect(h.undo()).toBe(3);
        expect(h.undo()).toBe(2);
        expect(h.undo()).toBe(1);
        h.push(5, "a");
        expect(h.undo()).toBe(1);
    });

    it("leaves the present alone when there is nothing to undo or redo", () => {
        const h = new History("a");
        expect(h.undo()).toBe("a");
        expect(h.redo()).toBe("a");
    });

    it("keeps at most 200 undo steps", () => {
        const h = new History(0);
        for (let i = 1; i <= 250; i++) h.push(i);
        let steps = 0;
        while (h.canUndo) {
            h.undo();
            steps++;
        }
        expect(steps).toBe(200);
        expect(h.present).toBe(50);
    });
});
