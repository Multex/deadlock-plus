import { describe, expect, it } from "vitest";
import { sceneFrame } from "./frame";

describe("sceneFrame", () => {
    it("keeps the 9:16 content square in the band clear of the app UI", () => {
        const f = sceneFrame(1080, 1920);
        expect(f.u).toBe(1);
        expect(f.box.x).toBe(0);
        expect(f.box.w).toBe(1080);
        expect(f.box.y).toBeGreaterThanOrEqual(240);
        expect(f.box.y + f.box.h).toBeLessThanOrEqual(1360);
    });

    it("gives 9:16 the band key text may use, and the whole height elsewhere", () => {
        expect(sceneFrame(1080, 1920).safe).toEqual({ top: 240, bottom: 1360 });
        expect(sceneFrame(1440, 1440).safe).toEqual({ top: 0, bottom: 1440 });
        expect(sceneFrame(1920, 1080).safe).toEqual({ top: 0, bottom: 1080 });
    });

    it("fills the square and centres the 16:9 box", () => {
        expect(sceneFrame(1440, 1440).box).toEqual({ x: 0, y: 0, w: 1440, h: 1440 });
        expect(sceneFrame(1920, 1080).box).toEqual({ x: 420, y: 0, w: 1080, h: 1080 });
    });
});
