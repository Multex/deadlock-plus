import { describe, expect, it } from "vitest";

import {
    clampView,
    fitScale,
    fitView,
    isZoomed,
    maxScale,
    panBy,
    pinch,
    READABLE_SCALE,
    toggleZoom,
    zoomAbout,
    zoomStep,
    type Frame,
} from "./zoom";

const phone: Frame = { image: { width: 1480, height: 900 }, stage: { width: 390, height: 700 } };
const tall: Frame = { image: { width: 1480, height: 1500 }, stage: { width: 390, height: 300 } };
const roomy: Frame = { image: { width: 1480, height: 900 }, stage: { width: 2000, height: 1200 } };

/** The image pixel under a point of the stage. */
function imagePointAt(view: { scale: number; x: number; y: number }, p: { x: number; y: number }) {
    return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale };
}

describe("fitScale", () => {
    it("fits the width when the image is wider than the stage", () => {
        expect(fitScale(phone)).toBeCloseTo(390 / 1480);
    });

    it("fits the height when the image is taller than the stage", () => {
        expect(fitScale(tall)).toBeCloseTo(300 / 1500);
    });

    it("never enlarges an image that already fits", () => {
        expect(fitScale(roomy)).toBe(1);
    });

    it("is 1 before the stage has a size", () => {
        expect(fitScale({ image: phone.image, stage: { width: 0, height: 0 } })).toBe(1);
    });
});

describe("maxScale", () => {
    it("goes past one screenshot pixel per CSS pixel", () => {
        expect(maxScale(phone)).toBeGreaterThanOrEqual(1);
        expect(maxScale(phone) / fitScale(phone)).toBeGreaterThanOrEqual(4);
    });
});

describe("fitView", () => {
    it("shows the whole image, centred", () => {
        const view = fitView(phone);
        const height = 900 * view.scale;
        expect(view.x).toBeCloseTo(0);
        expect(view.y).toBeCloseTo((700 - height) / 2);
        expect(1480 * view.scale).toBeLessThanOrEqual(390 + 1e-9);
        expect(height).toBeLessThanOrEqual(700);
    });

    it("centres a tall image sideways", () => {
        const view = fitView(tall);
        expect(view.y).toBeCloseTo(0);
        expect(view.x).toBeCloseTo((390 - 1480 * view.scale) / 2);
    });
});

describe("clampView", () => {
    it("pulls an image dragged off the left and top back to the edges", () => {
        expect(clampView({ scale: 1, x: 200, y: 300 }, phone)).toEqual({ scale: 1, x: 0, y: 0 });
    });

    it("pulls an image dragged off the right and bottom back to the edges", () => {
        expect(clampView({ scale: 1, x: -5000, y: -5000 }, phone)).toEqual({ scale: 1, x: 390 - 1480, y: 700 - 900 });
    });

    it("centres an axis that is smaller than the stage", () => {
        const view = clampView({ scale: 0.5, x: -100, y: 600 }, phone);
        expect(view.x).toBe(-100);
        expect(view.y).toBeCloseTo((700 - 450) / 2);
    });

    it("keeps the scale between fit and the maximum", () => {
        expect(clampView({ scale: 0.01, x: 0, y: 0 }, phone).scale).toBeCloseTo(fitScale(phone));
        expect(clampView({ scale: 99, x: 0, y: 0 }, phone).scale).toBe(maxScale(phone));
    });
});

describe("zoomAbout", () => {
    it("keeps the image pixel under the point where it is", () => {
        const start = { scale: 0.5, x: -100, y: 125 };
        const point = { x: 250, y: 400 };
        const before = imagePointAt(start, point);
        const after = imagePointAt(zoomAbout(start, point, 1, phone), point);
        expect(after.x).toBeCloseTo(before.x);
        expect(after.y).toBeCloseTo(before.y);
    });

    it("clamps when the point is near an edge", () => {
        const view = zoomAbout(fitView(phone), { x: 0, y: 0 }, 1, phone);
        expect(view).toEqual({ scale: 1, x: 0, y: 0 });
    });

    it("stops at the maximum scale", () => {
        expect(zoomAbout(fitView(phone), { x: 195, y: 350 }, 50, phone).scale).toBe(maxScale(phone));
    });
});

describe("zoomStep", () => {
    it("zooms in and out about the middle of the stage", () => {
        const start = { scale: 0.6, x: -249, y: 80 };
        const centre = { x: 195, y: 350 };
        const before = imagePointAt(start, centre);
        const zoomedIn = zoomStep(start, 1, phone);
        expect(zoomedIn.scale).toBeGreaterThan(start.scale);
        expect(imagePointAt(zoomedIn, centre).x).toBeCloseTo(before.x);
        expect(zoomStep(zoomedIn, -1, phone).scale).toBeCloseTo(start.scale);
    });

    it("lands exactly on fit when zooming out past it", () => {
        expect(zoomStep(fitView(phone), -1, phone)).toEqual(fitView(phone));
    });
});

describe("panBy", () => {
    it("moves a zoomed image", () => {
        expect(panBy({ scale: 1, x: -500, y: -100 }, 40, -30, phone)).toEqual({ scale: 1, x: -460, y: -130 });
    });

    it("cannot move the image off the stage", () => {
        expect(panBy({ scale: 1, x: -10, y: -10 }, 400, 400, phone)).toEqual({ scale: 1, x: 0, y: 0 });
    });

    it("does nothing at fit", () => {
        expect(panBy(fitView(phone), 120, -80, phone)).toEqual(fitView(phone));
    });
});

describe("pinch", () => {
    const start = { scale: 0.5, x: -100, y: 125 };
    const from = { a: { x: 150, y: 300 }, b: { x: 250, y: 400 } };

    it("scales by how far the fingers spread, around the point between them", () => {
        const to = { a: { x: 100, y: 250 }, b: { x: 300, y: 450 } };
        const view = pinch(start, from, to, phone);
        const middle = { x: 200, y: 350 };
        expect(view.scale).toBeCloseTo(1);
        expect(imagePointAt(view, middle).x).toBeCloseTo(imagePointAt(start, middle).x);
        expect(imagePointAt(view, middle).y).toBeCloseTo(imagePointAt(start, middle).y);
    });

    it("follows the fingers when they move together", () => {
        const to = { a: { x: 130, y: 320 }, b: { x: 230, y: 420 } };
        expect(pinch(start, from, to, phone)).toEqual({ scale: 0.5, x: -120, y: 125 });
    });

    it("cannot shrink below fit", () => {
        const to = { a: { x: 199, y: 349 }, b: { x: 201, y: 351 } };
        expect(pinch(start, from, to, phone)).toEqual(fitView(phone));
    });

    it("ignores fingers that started on the same spot", () => {
        const same = { a: { x: 10, y: 10 }, b: { x: 10, y: 10 } };
        expect(pinch(start, same, from, phone).scale).toBe(0.5);
    });
});

describe("toggleZoom", () => {
    it("goes from fit to a readable scale centred on the tap", () => {
        const tap = { x: 300, y: 340 };
        const fit = fitView(phone);
        const view = toggleZoom(fit, tap, phone);
        expect(view.scale).toBe(READABLE_SCALE);
        const target = imagePointAt(fit, tap);
        const centre = imagePointAt(view, { x: 195, y: 350 });
        expect(centre.x).toBeCloseTo(target.x);
        expect(centre.y).toBeCloseTo(target.y);
    });

    it("keeps the image on the stage when the tap is in a corner", () => {
        const view = toggleZoom(fitView(phone), { x: 2, y: 232 }, phone);
        expect(view.x).toBe(0);
        expect(view.y).toBe(0);
    });

    it("goes back to fit from any zoom", () => {
        expect(toggleZoom({ scale: 0.8, x: -300, y: 0 }, { x: 10, y: 10 }, phone)).toEqual(fitView(phone));
    });
});

describe("isZoomed", () => {
    it("is false at fit and true past it", () => {
        expect(isZoomed(fitView(phone), phone)).toBe(false);
        expect(isZoomed({ scale: 1, x: 0, y: 0 }, phone)).toBe(true);
    });
});
