import { describe, expect, it } from "vitest";

import { addStop, burst, lazy } from "./theme-decor-loop";

describe("burst", () => {
    it("is active for its length at the start of every period, by the wall clock", () => {
        expect(burst(10_000 * 7 + 1_000, 10_000, 3_000)).toMatchObject({ active: true });
        expect(burst(10_000 * 7 + 5_000, 10_000, 3_000)).toMatchObject({ active: false });
    });

    it("reports how far through the burst it is", () => {
        expect(burst(10_000 * 3 + 1_500, 10_000, 3_000).progress).toBeCloseTo(0.5);
    });

    it("says how long until it starts or stops, so a scene can sleep until then", () => {
        expect(burst(10_000 * 2 + 1_000, 10_000, 3_000).untilChange).toBe(2_000);
        expect(burst(10_000 * 2 + 4_000, 10_000, 3_000).untilChange).toBe(6_000);
    });

    it("shifts by an offset, so several bursts on one period do not line up", () => {
        expect(burst(10_000 * 2 + 4_500, 10_000, 1_000, 4_000)).toMatchObject({ active: true });
        expect(burst(10_000 * 2 + 500, 10_000, 1_000, 4_000)).toMatchObject({ active: false });
    });
});

describe("addStop", () => {
    const strict = () => {
        const stops: [number, string][] = [];
        return {
            stops,
            gradient: {
                addColorStop(offset: number, colour: string) {
                    if (!colour) throw new SyntaxError("could not be parsed as a color");
                    stops.push([offset, colour]);
                },
            } as unknown as CanvasGradient,
        };
    };

    it("adds a stop when the colour is set", () => {
        const { gradient, stops } = strict();
        addStop(gradient, 0.5, "red");
        expect(stops).toEqual([[0.5, "red"]]);
    });

    it("skips a colour that has not resolved yet instead of throwing", () => {
        const { gradient, stops } = strict();
        expect(() => addStop(gradient, 0, "")).not.toThrow();
        expect(stops).toEqual([]);
    });

    it("skips a colour the canvas rejects", () => {
        const { gradient, stops } = strict();
        gradient.addColorStop = () => {
            throw new SyntaxError("bad");
        };
        expect(() => addStop(gradient, 0, "nonsense")).not.toThrow();
        expect(stops).toEqual([]);
    });
});

describe("lazy", () => {
    it("stays null while the colour is empty, then builds once it is set and caches it", () => {
        let colour = "";
        let builds = 0;
        const sprite = lazy(() => {
            if (!colour) return null;
            builds++;
            return { colour };
        });
        expect(sprite()).toBeNull();
        expect(sprite()).toBeNull();
        colour = "red";
        expect(sprite()).toEqual({ colour: "red" });
        colour = "blue";
        expect(sprite()).toEqual({ colour: "red" });
        expect(builds).toBe(1);
    });
});
