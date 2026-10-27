import { describe, expect, it, vi } from "vitest";
import { artColours, pixelReader, SAMPLE_H, SAMPLE_W } from "./cover-colour.svelte";
import { dominantColour } from "./backdrop-colour";

const ORANGE = new Uint8ClampedArray([232, 100, 42, 255]);

describe("artColours", () => {
    it("has no colour for a hero until its backdrop is sampled", () => {
        const colours = artColours({ backdrop: async () => "a.png", read: async () => ORANGE });
        expect(colours.get(6)).toBeUndefined();
    });

    it("samples the hero's backdrop once and keeps the colour", async () => {
        const read = vi.fn(async () => ORANGE);
        const backdrop = vi.fn(async () => "abrams.png");
        const colours = artColours({ backdrop, read });
        const [a, b] = await Promise.all([colours.sample(6), colours.sample(6)]);
        expect(a).toBe("#e8642a");
        expect(b).toBe("#e8642a");
        expect(await colours.sample(6)).toBe("#e8642a");
        expect(colours.get(6)).toBe("#e8642a");
        expect(backdrop).toHaveBeenCalledTimes(1);
        expect(read).toHaveBeenCalledWith("abrams.png");
        expect(read).toHaveBeenCalledTimes(1);
    });

    it("samples the backdrop it is handed instead of looking one up", async () => {
        const backdrop = vi.fn(async () => "other.png");
        const read = vi.fn(async () => ORANGE);
        const colours = artColours({ backdrop, read });
        await colours.sample(6, "given.png");
        expect(backdrop).not.toHaveBeenCalled();
        expect(read).toHaveBeenCalledWith("given.png");
    });

    it("settles on no colour when there is no art or it cannot be read", async () => {
        const colours = artColours({
            backdrop: async (id) => (id === 1 ? null : "x.png"),
            read: async () => {
                throw new Error("tainted");
            },
        });
        expect(await colours.sample(1)).toBeNull();
        expect(await colours.sample(2)).toBeNull();
        expect(colours.get(1)).toBeNull();
        expect(colours.get(2)).toBeNull();
    });
});

function fakeCanvas() {
    const data = new Uint8ClampedArray(SAMPLE_W * SAMPLE_H * 4);
    const drawImage = vi.fn();
    const getImageData = vi.fn(() => ({ data }));
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ({ drawImage, getImageData })) };
    return { canvas, drawImage, getImageData };
}

describe("pixelReader", () => {
    it("draws into a small canvas", async () => {
        const fake = fakeCanvas();
        const read = pixelReader({ load: async () => ({}) as CanvasImageSource, makeCanvas: () => fake.canvas });
        await read("a.png");
        expect(fake.canvas.width).toBeLessThanOrEqual(32);
        expect(fake.canvas.height).toBeLessThanOrEqual(18);
        expect(fake.getImageData).toHaveBeenCalledWith(0, 0, fake.canvas.width, fake.canvas.height);
    });

    it("does not touch the canvas again for a url it has read", async () => {
        const fake = fakeCanvas();
        const load = vi.fn(async () => ({}) as CanvasImageSource);
        const makeCanvas = vi.fn(() => fake.canvas);
        const read = pixelReader({ load, makeCanvas });
        const first = await read("a.png");
        const second = await read("a.png");
        expect(second).toBe(first);
        expect(load).toHaveBeenCalledTimes(1);
        expect(makeCanvas).toHaveBeenCalledTimes(1);
        expect(fake.getImageData).toHaveBeenCalledTimes(1);
    });

    it("shares one read between concurrent calls and forgets the oldest url past its bound", async () => {
        const fake = fakeCanvas();
        const load = vi.fn(async () => ({}) as CanvasImageSource);
        const read = pixelReader({ load, makeCanvas: () => fake.canvas, limit: 2 });
        await Promise.all([read("a.png"), read("a.png")]);
        expect(load).toHaveBeenCalledTimes(1);
        await read("b.png");
        await read("c.png");
        await read("a.png");
        expect(load).toHaveBeenCalledTimes(4);
    });

    it("picks the same colour from the small size as from a larger one", () => {
        const big = (w: number, h: number) => {
            const px = new Uint8ClampedArray(w * h * 4);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = (y * w + x) * 4;
                    const burst = x > w * 0.55 && y < h * 0.6;
                    px.set(burst ? [232, 100, 42, 255] : [30, 34, 44, 255], i);
                }
            }
            return px;
        };
        expect(dominantColour(big(SAMPLE_W, SAMPLE_H))).toBe(dominantColour(big(96, 54)));
    });
});
