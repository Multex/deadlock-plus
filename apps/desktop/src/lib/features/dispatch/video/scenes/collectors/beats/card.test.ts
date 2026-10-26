import { describe, expect, it } from "vitest";
import { sceneFrame } from "../../../kit/frame";
import type { CopyRef } from "../data";
import {
    CARD,
    burstSlot,
    cardStage,
    dealPose,
    flipPose,
    lineId,
    pileSlot,
    rarityOf,
    say,
    settle,
    stackDepth,
    type Deck,
} from "./card";

const ref = (key: string, params: Record<string, string> = {}, count?: number): CopyRef =>
    count === undefined ? { key, params } : { key, params, count };

describe("flipPose", () => {
    it("is face down and flat before the flip and face up and flat after it", () => {
        for (const p of [flipPose(-1, 0, 0.4), flipPose(0, 0, 0.4)]) {
            expect(p.angle).toBe(0);
            expect(p.faceUp).toBe(false);
            expect(p.scaleX).toBe(1);
            expect(p.shade).toBe(0);
            expect(p.lift).toBe(1);
            expect(p.skew).toBeCloseTo(0, 12);
        }
        for (const p of [flipPose(0.4, 0, 0.4), flipPose(9, 0, 0.4)]) {
            expect(p.angle).toBeCloseTo(Math.PI, 12);
            expect(p.faceUp).toBe(true);
            expect(p.scaleX).toBeCloseTo(1, 12);
            expect(p.shade).toBeCloseTo(0, 12);
            expect(p.lift).toBeCloseTo(1, 12);
        }
    });

    it("turns one way only, edge on at the midpoint, and shows the face from the midpoint on", () => {
        let last = -1;
        for (let t = 0; t <= 0.4; t += 0.004) {
            const p = flipPose(t, 0, 0.4);
            expect(p.angle).toBeGreaterThanOrEqual(last);
            last = p.angle;
            expect(p.faceUp).toBe(p.angle > Math.PI / 2);
            expect(p.scaleX).toBeCloseTo(Math.max(0.015, Math.abs(Math.cos(p.angle))), 12);
        }
        const mid = flipPose(0.2, 0, 0.4);
        expect(mid.angle).toBeCloseTo(Math.PI / 2, 6);
        expect(mid.shade).toBeGreaterThan(0.4);
        expect(mid.lift).toBeGreaterThan(1.05);
    });

    it("never squashes the card to zero width, so the transform stays invertible", () => {
        for (let t = 0; t <= 0.4; t += 0.0005) expect(flipPose(t, 0, 0.4).scaleX).toBeGreaterThan(0.01);
    });

    it("leans the near edge out on the way up and back on the way down", () => {
        expect(flipPose(0.1, 0, 0.4).skew).toBeGreaterThan(0);
        expect(flipPose(0.3, 0, 0.4).skew).toBeLessThan(0);
    });
});

describe("settle", () => {
    it("starts at 0, overshoots once and comes to rest at 1", () => {
        expect(settle(-0.1)).toBe(0);
        expect(settle(0)).toBe(0);
        const peak = Math.max(...Array.from({ length: 200 }, (_, i) => settle(i / 200)));
        expect(peak).toBeGreaterThan(1.02);
        expect(peak).toBeLessThan(1.25);
        expect(settle(2)).toBeCloseTo(1, 3);
    });
});

describe("dealPose", () => {
    const from = { x: 0, y: 900, rot: -0.4, scale: 0.5, alpha: 0 };
    const to = { x: 100, y: 0, rot: 0, scale: 1, alpha: 1 };

    it("holds `from` before the deal and lands on `to` after it", () => {
        expect(dealPose(0.5, 1, 0.5, from, to)).toEqual(from);
        const end = dealPose(9, 1, 0.5, from, to);
        expect(end.x).toBeCloseTo(100, 6);
        expect(end.y).toBeCloseTo(0, 6);
        expect(end.rot).toBeCloseTo(0, 3);
        expect(end.scale).toBeCloseTo(1, 3);
        expect(end.alpha).toBe(1);
    });

    it("moves continuously", () => {
        let prev = dealPose(1, 1, 0.5, from, to);
        for (let t = 1.002; t <= 1.6; t += 0.002) {
            const p = dealPose(t, 1, 0.5, from, to);
            expect(Math.abs(p.y - prev.y)).toBeLessThan(40);
            prev = p;
        }
    });
});

describe("cardStage", () => {
    it("fills the 9:16 safe band with the card, one card unit per pixel at 1080 wide", () => {
        const s = cardStage({ w: 1080, h: 1920 });
        const f = sceneFrame(1080, 1920);
        expect(s.aspect).toBe("tall");
        expect(s.scale).toBeCloseTo(1, 6);
        expect(s.card.y - (CARD.h / 2) * s.scale).toBeGreaterThanOrEqual(f.safe.top - 1e-6);
        expect(s.card.y + (CARD.h / 2) * s.scale).toBeLessThanOrEqual(f.safe.bottom + 1e-6);
        expect(s.card.x).toBe(540);
    });

    for (const [w, h, aspect] of [
        [1440, 1440, "square"],
        [1920, 1080, "wide"],
    ] as const) {
        it(`keeps the card inside the ${aspect} frame with room for the pile beside it`, () => {
            const s = cardStage({ w, h });
            expect(s.aspect).toBe(aspect);
            const half = { w: (CARD.w / 2) * s.scale, h: (CARD.h / 2) * s.scale };
            expect(s.card.y - half.h).toBeGreaterThan(0);
            expect(s.card.y + half.h).toBeLessThan(h);
            expect(s.card.x + half.w).toBeLessThan(w);
            expect(s.pile.x).toBeLessThan(s.card.x - half.w);
        });
    }

    it("sets the card no smaller than 85% of its 9:16 size, measured on the 1080 short side", () => {
        for (const [w, h] of [
            [1440, 1440],
            [1920, 1080],
        ]) {
            const s = cardStage({ w, h });
            expect(s.scale / (Math.min(w, h) / 1080)).toBeGreaterThanOrEqual(0.85);
        }
    });
});

describe("burstSlot", () => {
    it("fans the cards evenly and symmetrically above the pack", () => {
        const n = 5;
        const slots = Array.from({ length: n }, (_, i) => burstSlot(i, n));
        expect(slots[2].x).toBeCloseTo(0, 9);
        expect(slots[2].rot).toBeCloseTo(0, 9);
        for (let i = 0; i < n; i++) {
            expect(slots[i].x).toBeCloseTo(-slots[n - 1 - i].x, 9);
            expect(slots[i].rot).toBeCloseTo(-slots[n - 1 - i].rot, 9);
            expect(slots[i].y).toBeLessThan(0);
        }
        for (let i = 1; i < n; i++) expect(slots[i].x).toBeGreaterThan(slots[i - 1].x);
    });

    it("puts a single card straight up", () => {
        expect(burstSlot(0, 1)).toEqual({ x: 0, y: expect.any(Number), rot: 0 });
    });
});

describe("pileSlot", () => {
    it("gives each dealt card its own spot and turn, the same every time", () => {
        const a = Array.from({ length: 6 }, (_, i) => pileSlot(i, "tall"));
        expect(new Set(a.map((p) => `${p.x},${p.y}`)).size).toBe(6);
        expect(a).toEqual(Array.from({ length: 6 }, (_, i) => pileSlot(i, "tall")));
    });
});

describe("stackDepth", () => {
    it("counts the cards still face down under the top one, the chase included", () => {
        expect(stackDepth(0, 4, true)).toBe(4);
        expect(stackDepth(3, 4, true)).toBe(1);
        expect(stackDepth(3, 4, false)).toBe(0);
    });
});

describe("rarityOf", () => {
    it("gives each rarity more pips and a richer foil than the one below", () => {
        const order = ["common", "uncommon", "rare", "gold", "holo"] as const;
        for (let i = 1; i < order.length; i++) {
            expect(rarityOf(order[i]).pips).toBeGreaterThan(rarityOf(order[i - 1]).pips);
            expect(rarityOf(order[i]).shine).toBeGreaterThan(rarityOf(order[i - 1]).shine);
        }
    });
});

describe("lineId and say", () => {
    it("tells apart two refs with one key but other counts or params", () => {
        const ids = [ref("k_1", { a: "1" }, 3), ref("k_1", { a: "2" }, 3), ref("k_1", { a: "1" }, 2)].map(lineId);
        expect(new Set(ids).size).toBe(3);
    });

    it("reads the translated line, and nothing for a missing ref", () => {
        const deck = { lines: { [lineId(ref("k_1"))]: "Hello" } } as unknown as Deck;
        expect(say(deck, ref("k_1"))).toBe("Hello");
        expect(say(deck, ref("k_2"))).toBe("");
        expect(say(deck, undefined)).toBe("");
    });
});
