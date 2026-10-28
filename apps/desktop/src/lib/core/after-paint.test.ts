import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { afterNextPaint } from "./after-paint";

let frames: Map<number, FrameRequestCallback>;

beforeEach(() => {
    vi.useFakeTimers();
    frames = new Map();
    let next = 1;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
        frames.set(next, cb);
        return next++;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

function runFrame() {
    const due = [...frames.values()];
    frames.clear();
    for (const cb of due) cb(0);
}

describe("afterNextPaint", () => {
    it("waits for the next frame and then for the paint after it", () => {
        const run = vi.fn();
        afterNextPaint(run);
        vi.runAllTimers();
        expect(run).not.toHaveBeenCalled();
        runFrame();
        expect(run).not.toHaveBeenCalled();
        vi.runAllTimers();
        expect(run).toHaveBeenCalledOnce();
    });

    it("never runs once cancelled before the frame", () => {
        const run = vi.fn();
        const cancel = afterNextPaint(run);
        cancel();
        runFrame();
        vi.runAllTimers();
        expect(run).not.toHaveBeenCalled();
    });

    it("never runs once cancelled between the frame and the paint", () => {
        const run = vi.fn();
        const cancel = afterNextPaint(run);
        runFrame();
        cancel();
        vi.runAllTimers();
        expect(run).not.toHaveBeenCalled();
    });
});
