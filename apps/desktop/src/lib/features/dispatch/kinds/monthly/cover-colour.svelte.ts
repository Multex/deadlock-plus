import { SvelteMap } from "svelte/reactivity";
import { coverBackdrop } from "../../art";
import { dominantColour } from "./backdrop-colour";

/** The size the backdrop is drawn down to before sampling: enough for its colour areas, cheap to read. */
const SAMPLE_W = 96;
const SAMPLE_H = 54;

interface Sources {
    backdrop: (heroId: number) => Promise<string | null>;
    read: (src: string) => Promise<ArrayLike<number> | null>;
}

/**
 * The colour each hero's backdrop art reads as, sampled once per hero and app run. `get` is reactive: a cover that
 * reads it repaints when the sample lands. Undefined means not sampled yet; null means the art gave no colour.
 */
export function artColours({ backdrop, read }: Sources) {
    const colours = new SvelteMap<number, string | null>();
    const pending = new Map<number, Promise<string | null>>();

    async function run(heroId: number, src: string | null | undefined): Promise<string | null> {
        let colour: string | null = null;
        try {
            const url = src === undefined ? await backdrop(heroId) : src;
            const pixels = url ? await read(url) : null;
            colour = pixels ? dominantColour(pixels) : null;
        } catch {
            colour = null;
        }
        colours.set(heroId, colour);
        return colour;
    }

    return {
        get: (heroId: number) => colours.get(heroId),
        /** `src` is the backdrop when the caller already has it. */
        sample(heroId: number, src?: string | null): Promise<string | null> {
            let job = pending.get(heroId);
            if (!job) {
                job = run(heroId, src);
                pending.set(heroId, job);
            }
            return job;
        },
    };
}

/** `crossOrigin` keeps the canvas readable: both `asset:` art and the API's images send CORS headers. */
async function readPixels(src: string): Promise<Uint8ClampedArray | null> {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_W;
    canvas.height = SAMPLE_H;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(img, 0, 0, SAMPLE_W, SAMPLE_H);
    return context.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
}

const shared = artColours({ backdrop: coverBackdrop, read: readPixels });

export const artColour = shared.get;
export const sampleArtColour = shared.sample;
