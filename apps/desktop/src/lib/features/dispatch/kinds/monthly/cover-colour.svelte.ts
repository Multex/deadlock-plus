import { SvelteMap } from "svelte/reactivity";
import { coverBackdrop } from "../../art";
import { dominantColour } from "./backdrop-colour";

/** The size the backdrop is drawn down to before sampling: enough for its colour areas, cheap to read. */
export const SAMPLE_W = 96;
export const SAMPLE_H = 54;
const READ_CACHE_LIMIT = 64;

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

interface SampleCanvas {
    width: number;
    height: number;
    getContext(id: "2d", options?: CanvasRenderingContext2DSettings): SampleContext | null;
}

interface SampleContext {
    drawImage(img: CanvasImageSource, x: number, y: number, w: number, h: number): void;
    getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> };
}

interface ReaderDeps {
    load: (src: string) => Promise<CanvasImageSource>;
    makeCanvas: () => SampleCanvas;
    limit?: number;
}

/** Reads a downscaled copy of each image's pixels once per url; the cache drops its oldest url past `limit`. */
export function pixelReader({ load, makeCanvas, limit = READ_CACHE_LIMIT }: ReaderDeps) {
    const cache = new Map<string, Promise<ArrayLike<number> | null>>();
    let canvas: ReturnType<typeof makeCanvas> | null = null;

    async function read(src: string): Promise<ArrayLike<number> | null> {
        const img = await load(src);
        canvas ??= makeCanvas();
        canvas.width = SAMPLE_W;
        canvas.height = SAMPLE_H;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return null;
        context.drawImage(img, 0, 0, SAMPLE_W, SAMPLE_H);
        const data = context.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
        if ("close" in img) img.close();
        return data;
    }

    return (src: string) => {
        let job = cache.get(src);
        if (!job) {
            job = read(src);
            cache.set(src, job);
            job.catch(() => cache.delete(src));
            if (cache.size > limit) cache.delete(cache.keys().next().value!);
        }
        return job;
    };
}

/**
 * `crossOrigin` keeps the canvas readable: both `asset:` art and the API's images send CORS headers. The resize is
 * done by `createImageBitmap` off the main thread: drawing the 2048x1156 art into a canvas and reading it back
 * instead blocks the main thread for about 75 ms per hero, whatever the canvas size.
 */
async function loadImage(src: string): Promise<CanvasImageSource> {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    await img.decode();
    return createImageBitmap(img, { resizeWidth: SAMPLE_W, resizeHeight: SAMPLE_H, resizeQuality: "medium" });
}

const readPixels = pixelReader({ load: loadImage, makeCanvas: () => document.createElement("canvas") });

const shared = artColours({ backdrop: coverBackdrop, read: readPixels });

export const artColour = shared.get;
export const sampleArtColour = shared.sample;
