import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    DEFAULT_ZOOM,
    ZOOM_KEY,
    ZOOM_STEPS,
    loadZoom,
    saveZoom,
    shownZoom,
    stepZoom,
    wheelSteps,
    zoomScale,
} from "./zoom";

describe("zoomScale", () => {
    it("draws at the zoom when the page fits the column", () => {
        expect(zoomScale(0.75, 1.2)).toBe(0.75);
    });

    it("falls back to Fit when the zoom would overflow the column", () => {
        expect(zoomScale(1, 0.6)).toBe(0.6);
        expect(zoomScale("fit", 0.6)).toBe(0.6);
        expect(zoomScale("fit", 1.4)).toBe(1.4);
    });
});

describe("shownZoom", () => {
    it("shows Fit when the zoom is capped", () => {
        expect(shownZoom(1, 0.6)).toBe("fit");
        expect(shownZoom("fit", 2)).toBe("fit");
        expect(shownZoom(0.75, 1)).toBe(0.75);
    });
});

describe("stepZoom", () => {
    it("moves to the next step from the drawn scale", () => {
        expect(stepZoom(0.75, 2, 1)).toBe(ZOOM_STEPS[ZOOM_STEPS.indexOf(0.75) + 1]);
        expect(stepZoom(0.75, 2, -1)).toBe(ZOOM_STEPS[ZOOM_STEPS.indexOf(0.75) - 1]);
    });

    it("steps down from Fit to the largest step below it", () => {
        expect(stepZoom("fit", 0.8, -1)).toBe(0.75);
        expect(stepZoom(1, 0.8, -1)).toBe(0.75);
    });

    it("lands on Fit when the next step up would overflow", () => {
        expect(stepZoom(0.75, 0.8, 1)).toBe("fit");
        expect(stepZoom("fit", 0.8, 1)).toBe("fit");
    });

    it("skips a step that would look the same as Fit", () => {
        expect(stepZoom("fit", 0.901, -1)).toBe(0.75);
        expect(stepZoom(0.75, 0.91, 1)).toBe("fit");
    });

    it("stops at the smallest and largest step", () => {
        const [min] = ZOOM_STEPS;
        const max = ZOOM_STEPS.at(-1)!;
        expect(stepZoom(min, 2, -1)).toBe(min);
        expect(stepZoom(max, 10, 1)).toBe(max);
        expect(stepZoom("fit", 0.3, -1)).toBe("fit");
    });
});

describe("wheelSteps", () => {
    it("turns one mouse notch into one step and collects small trackpad deltas", () => {
        expect(wheelSteps(0, -100)).toEqual({ steps: 1, rest: 0 });
        expect(wheelSteps(0, 100)).toEqual({ steps: -1, rest: 0 });
        const first = wheelSteps(0, -60);
        expect(first.steps).toBe(0);
        expect(wheelSteps(first.rest, -60).steps).toBe(1);
    });
});

describe("loadZoom and saveZoom", () => {
    let data: Map<string, string>;

    beforeEach(() => {
        data = new Map();
        vi.stubGlobal("localStorage", {
            getItem: (k: string) => data.get(k) ?? null,
            setItem: (k: string, v: string) => void data.set(k, v),
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("defaults to 75%", () => {
        expect(DEFAULT_ZOOM).toBe(0.75);
        expect(loadZoom()).toBe(0.75);
    });

    it("remembers the viewer's zoom", () => {
        saveZoom(1);
        expect(loadZoom()).toBe(1);
        saveZoom("fit");
        expect(loadZoom()).toBe("fit");
    });

    it("ignores a stored value that is not a step", () => {
        data.set(ZOOM_KEY, "7");
        expect(loadZoom()).toBe(DEFAULT_ZOOM);
        data.set(ZOOM_KEY, "nope");
        expect(loadZoom()).toBe(DEFAULT_ZOOM);
    });

    it("works without storage", () => {
        const blocked = () => {
            throw new Error("blocked");
        };
        vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked });
        expect(() => saveZoom(1)).not.toThrow();
        expect(loadZoom()).toBe(DEFAULT_ZOOM);
    });
});
