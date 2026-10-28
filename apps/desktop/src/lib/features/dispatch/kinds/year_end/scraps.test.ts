import { describe, expect, it } from "vitest";
import { BURST_Y, drawScraps, makeScraps, scrapAt, scrapPose, TORN_EDGES } from "./scraps";

describe("makeScraps", () => {
    it("is the same burst for the same seed and a different one for another", () => {
        expect(makeScraps(40, 7)).toEqual(makeScraps(40, 7));
        expect(makeScraps(40, 7)).not.toEqual(makeScraps(40, 8));
    });

    it("mixes gold foil, black, tape and newsprint, some in front of the copy and some behind", () => {
        const scraps = makeScraps(150, 2026);
        expect(scraps).toHaveLength(150);
        expect(new Set(scraps.map((s) => s.kind))).toEqual(new Set(["foil", "black", "tape", "newsprint"]));
        const front = scraps.filter((s) => s.front).length;
        expect(front).toBeGreaterThan(40);
        expect(front).toBeLessThan(130);
    });

    it("throws mostly upwards", () => {
        const up = makeScraps(150, 3).filter((s) => s.vy < 0).length;
        expect(up).toBe(150);
    });
});

describe("scrapAt", () => {
    const s = makeScraps(1, 11)[0];

    it("starts at the burst point", () => {
        const p = scrapAt(s, 0);
        expect(p.x).toBeCloseTo(0, 6);
        expect(p.y).toBeCloseTo(0, 6);
    });

    it("rises first and falls later", () => {
        expect(scrapAt(s, 0.15).y).toBeLessThan(0);
        expect(scrapAt(s, 3).y).toBeGreaterThan(scrapAt(s, 1.5).y);
    });
});

describe("scrapPose", () => {
    it("places the burst at the stage's centre line, in pixels scaled by the stage height", () => {
        const s = makeScraps(1, 5)[0];
        const pose = scrapPose(s, 0, { width: 1000, height: 800 }, 1);
        expect(pose.x).toBeCloseTo(500, 6);
        expect(pose.y).toBeCloseTo(800 * BURST_Y, 6);
        expect(pose.w).toBeCloseTo(s.w, 6);
    });

    it("never shrinks a scrap below 60 % on a small copy", () => {
        const s = makeScraps(1, 5)[0];
        expect(scrapPose(s, 0, { width: 400, height: 300 }, 0.2).w).toBeCloseTo(s.w * 0.6, 6);
    });
});

describe("drawScraps", () => {
    function fakeContext() {
        const calls: string[] = [];
        const gradient = { addColorStop: () => {} };
        const ctx = new Proxy(
            {},
            {
                get: (_, key: string) =>
                    key === "createLinearGradient" ? () => gradient : (..._args: unknown[]) => calls.push(key),
                set: () => true,
            },
        );
        return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
    }

    it("paints only the scraps on its own side of the copy", () => {
        const scraps = makeScraps(60, 9);
        const { ctx, calls } = fakeContext();
        drawScraps(ctx, scraps, { t: 0.5, stage: { width: 800, height: 600 }, scale: 1, alpha: 1, front: true });
        const front = scraps.filter((s) => s.front).length;
        expect(calls.filter((c) => c === "save")).toHaveLength(front);
        const { ctx: none, calls: noCalls } = fakeContext();
        drawScraps(none, scraps, { t: 0.5, stage: { width: 800, height: 600 }, scale: 1, alpha: 0, front: true });
        expect(noCalls.filter((c) => c === "fill" || c === "fillRect")).toHaveLength(0);
    });

    it("tears the newsprint along one of the fixed edges", () => {
        expect(TORN_EDGES.length).toBeGreaterThan(1);
        for (const edge of TORN_EDGES)
            for (const [x, y] of edge) expect(x >= 0 && x <= 1 && y >= 0 && y <= 1).toBe(true);
    });
});
