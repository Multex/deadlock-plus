import { describe, expect, it, vi } from "vitest";
import { artColours } from "./cover-colour.svelte";

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
