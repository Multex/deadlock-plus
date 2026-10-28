import { describe, expect, it } from "vitest";
import { hexToAccent } from "@deadlock-plus/ui/accent";
import { dominantColour } from "./backdrop-colour";

type Fill = [hex: string, pixels: number, alpha?: number];

function pixels(...fills: Fill[]): Uint8ClampedArray {
    const total = fills.reduce((n, [, count]) => n + count, 0);
    const out = new Uint8ClampedArray(total * 4);
    let i = 0;
    for (const [hex, count, alpha = 255] of fills) {
        const v = parseInt(hex.slice(1), 16);
        for (let k = 0; k < count; k++, i += 4) out.set([(v >> 16) & 255, (v >> 8) & 255, v & 255, alpha], i);
    }
    return out;
}

const hueOf = (hex: string) => hexToAccent(hex).hue;
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b) % 360, 360 - (Math.abs(a - b) % 360));

describe("dominantColour", () => {
    it("picks the vivid hue over a larger muddy area", () => {
        // Abrams' backdrop: mostly dark slate, with a bright orange burst.
        const hex = dominantColour(pixels(["#2b3a42", 6000], ["#e8642a", 1500]));
        expect(hex).not.toBeNull();
        expect(hueGap(hueOf(hex!), hueOf("#e8642a"))).toBeLessThan(12);
    });

    it("returns the dominant hue's own colour, not the average of every hue", () => {
        const hex = dominantColour(pixels(["#2f6fe0", 3000], ["#e03a2f", 1000]));
        expect(hueGap(hueOf(hex!), hueOf("#2f6fe0"))).toBeLessThan(12);
    });

    it("ignores the transparent hole where the hero stands", () => {
        const hex = dominantColour(pixels(["#1f5fff", 9000, 0], ["#c0302a", 500]));
        expect(hueGap(hueOf(hex!), hueOf("#c0302a"))).toBeLessThan(12);
    });

    it("counts near hues as one colour, so a gradient beats a flat patch of another hue", () => {
        const hex = dominantColour(pixels(["#d04a2a", 700], ["#d4602c", 700], ["#d8742e", 700], ["#3a8f4a", 1200]));
        expect(hueGap(hueOf(hex!), hueOf("#d4602c"))).toBeLessThan(15);
    });

    it("gives no colour for grey art, so the caller falls back", () => {
        expect(dominantColour(pixels(["#3a3a3a", 4000], ["#d8d8d8", 2000], ["#101010", 2000]))).toBeNull();
    });

    it("gives no colour when a vivid hue is only a speck", () => {
        expect(dominantColour(pixels(["#404244", 9900], ["#ff2020", 20]))).toBeNull();
    });

    it("gives no colour for an empty or fully transparent image", () => {
        expect(dominantColour(new Uint8ClampedArray())).toBeNull();
        expect(dominantColour(pixels(["#ff0000", 100, 0]))).toBeNull();
    });
});
