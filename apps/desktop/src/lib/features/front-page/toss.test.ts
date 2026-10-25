import { describe, expect, it } from "vitest";
import {
    MAX_ANGLE,
    MAX_DX,
    MAX_DY,
    pickLanding,
    restTransform,
    TOSS_KINDS,
    tossMotion,
    type Landing,
    type TossKind,
} from "./toss";

/** Hands out `values` in turn, then repeats the last one. */
function sequence(...values: number[]) {
    let i = 0;
    return () => values[Math.min(i++, values.length - 1)];
}

describe("pickLanding", () => {
    it("reaches every toss over the range of random values", () => {
        const seen = new Set<string>();
        for (let r = 0; r < 1; r += 0.01) seen.add(pickLanding(() => r, null, false).kind);
        expect([...seen].sort()).toEqual([...TOSS_KINDS].sort());
    });

    it("never repeats the last toss", () => {
        for (const last of TOSS_KINDS) {
            const seen = new Set<string>();
            for (let r = 0; r < 1; r += 0.01) seen.add(pickLanding(() => r, last, false).kind);
            expect(seen.has(last)).toBe(false);
            expect(seen.size).toBe(TOSS_KINDS.length - 1);
        }
    });

    it("keeps the resting angle and offset within bounds", () => {
        for (const r of [0, 0.25, 0.5, 0.999999]) {
            const l = pickLanding(() => r, null, false);
            expect(Math.abs(l.angle)).toBeLessThanOrEqual(MAX_ANGLE);
            expect(Math.abs(l.dx)).toBeLessThanOrEqual(MAX_DX);
            expect(Math.abs(l.dy)).toBeLessThanOrEqual(MAX_DY);
        }
        const low = pickLanding(sequence(0, 0, 0, 0, 0, 0), null, false);
        const high = pickLanding(sequence(0.999999), null, false);
        expect(low.angle).toBeCloseTo(-MAX_ANGLE, 3);
        expect(high.angle).toBeCloseTo(MAX_ANGLE, 3);
        expect(low.dx).not.toBeCloseTo(high.dx, 0);
    });

    it("fades in place with reduced motion", () => {
        const l = pickLanding(() => 0.3, null, true);
        expect(l.kind).toBe("fade");
        expect(tossMotion(l, 800).impactAt).toBeUndefined();
    });
});

describe("tossMotion", () => {
    const landing = (kind: TossKind): Landing => ({ kind, angle: -3.2, dx: 12, dy: -7, sideX: 1, sideY: -1 });

    it.each(TOSS_KINDS)("%s ends exactly at the resting place", (kind) => {
        const l = landing(kind);
        const { keyframes, duration } = tossMotion(l, 800);
        const last = keyframes[keyframes.length - 1];
        expect(String(last.transform).startsWith(restTransform(l))).toBe(true);
        expect(last.opacity ?? 1).toBe(1);
        expect(keyframes[0].transform).not.toBe(last.transform);
        expect(duration).toBeGreaterThanOrEqual(500);
        expect(duration).toBeLessThanOrEqual(900);
    });

    it("jolts the table only when the paper is slapped down", () => {
        const slap = tossMotion(landing("slap"), 800);
        expect(slap.impactAt).toBeGreaterThan(0);
        expect(slap.impactAt).toBeLessThan(slap.duration);
        for (const kind of TOSS_KINDS.filter((k) => k !== "slap")) {
            expect(tossMotion(landing(kind), 800).impactAt).toBeUndefined();
        }
    });
});
