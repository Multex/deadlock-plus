import { describe, expect, it } from "vitest";
import { CLOSED, flapAngles, foldFit, frameAt, OPEN, PANEL, REVEAL, scrapFade } from "./reveal";

describe("frameAt", () => {
    it("starts closed with the room dimming, no flash", () => {
        const f = frameAt(0);
        expect(f.right).toBe(0);
        expect(f.left).toBe(0);
        expect(f.flash).toBe(0);
        expect(f.light).toBe(1);
        expect(frameAt(REVEAL.flashAt - 80).light).toBeLessThan(0.7);
    });

    it("fires the flashbulb at full strength at flashAt, then lets it fade and the lights come back", () => {
        expect(frameAt(REVEAL.flashAt).flash).toBe(1);
        expect(frameAt(REVEAL.flashAt).light).toBe(1);
        expect(frameAt(REVEAL.flashAt + 600).flash).toBeLessThan(0.05);
    });

    it("swings the cover before the inside flap", () => {
        const mid = (REVEAL.right[0] + REVEAL.right[1]) / 2;
        expect(frameAt(mid).right).toBeCloseTo(0.5, 5);
        expect(frameAt(mid).left).toBe(0);
        expect(frameAt(REVEAL.right[1]).right).toBe(1);
        expect(frameAt(REVEAL.left[1]).left).toBe(1);
    });

    it("never moves a flap backwards", () => {
        let last = frameAt(0);
        for (let t = 0; t <= REVEAL.end; t += 16) {
            const f = frameAt(t);
            expect(f.right).toBeGreaterThanOrEqual(last.right);
            expect(f.left).toBeGreaterThanOrEqual(last.left);
            last = f;
        }
    });

    it("ends exactly in the open state", () => {
        expect(frameAt(REVEAL.end)).toEqual(OPEN);
    });
});

describe("flapAngles", () => {
    it("lays both flaps over the centre when closed and leaves a slight fold when open", () => {
        expect(flapAngles(CLOSED, 0)).toEqual({ left: 180, right: -180 });
        expect(flapAngles(OPEN, 0)).toEqual({ left: 7, right: -7 });
    });

    it("lifts the cover by the hover peek", () => {
        expect(flapAngles(CLOSED, 14).right).toBe(-166);
    });
});

describe("foldFit", () => {
    it("fits the closed copy, its stacked edges included, by height on a tall stage", () => {
        const fit = foldFit(CLOSED, { width: 1200, height: 700 });
        expect(fit.width).toBe(PANEL.w + 12);
        expect(fit.scale).toBeCloseTo((700 - 80) / (PANEL.h + 12), 5);
        expect(fit.shift).toBe(0);
    });

    it("fits the open poster, three panels wide, by width", () => {
        const fit = foldFit(OPEN, { width: 1000, height: 900 });
        expect(fit.width).toBe(PANEL.w * 3);
        expect(fit.scale).toBeCloseTo((1000 - 80) / 1800, 5);
    });

    it("caps the scale so a huge window does not blow the type up", () => {
        expect(foldFit(CLOSED, { width: 4000, height: 3000 }).scale).toBe(1.2);
    });

    it("keeps the half-open copy centred: cover open, inside flap still shut", () => {
        expect(foldFit({ ...CLOSED, right: 1 }, { width: 1000, height: 800 }).shift).toBe(-PANEL.w / 2);
    });

    it("is 0 until the stage is measured", () => {
        expect(foldFit(OPEN, { width: 0, height: 0 }).scale).toBe(0);
    });
});

describe("scrapFade", () => {
    it("keeps the scraps solid, then fades them out before the reveal ends", () => {
        expect(scrapFade(REVEAL.burstAt + 100)).toBe(1);
        expect(scrapFade(REVEAL.end - 350)).toBeCloseTo(0.5, 5);
        expect(scrapFade(REVEAL.end)).toBe(0);
    });
});
