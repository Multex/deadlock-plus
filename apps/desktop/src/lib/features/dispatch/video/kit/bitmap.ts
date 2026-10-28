import type { Bitmap, Ctx } from "./types";

const baked = new WeakMap<object, Record<string, Bitmap>>();

/** Draws `img` through `paint` once and keeps the result: filters and masks cost too much to redo every frame. */
export function bake(img: Bitmap, key: string, paint: (c: Ctx, img: Bitmap) => void): Bitmap {
    const slot = baked.get(img) ?? {};
    if (slot[key]) return slot[key];
    if (typeof OffscreenCanvas === "undefined") return img;
    const canvas = new OffscreenCanvas(img.width, img.height);
    const c = canvas.getContext("2d");
    if (!c) return img;
    paint(c, img);
    slot[key] = canvas;
    baked.set(img, slot);
    return canvas;
}

/** The portrait card is a bust cut off at its edges: fade those cuts out. */
export function feathered(img: Bitmap): Bitmap {
    return bake(img, "feather", (c, i) => {
        c.drawImage(i, 0, 0);
        c.globalCompositeOperation = "destination-in";
        const v = c.createLinearGradient(0, 0, 0, i.height);
        v.addColorStop(0.7, "#000");
        v.addColorStop(0.97, "rgb(0 0 0 / 0)");
        c.fillStyle = v;
        c.fillRect(0, 0, i.width, i.height);
        const hz = c.createLinearGradient(0, 0, i.width, 0);
        hz.addColorStop(0, "rgb(0 0 0 / 0)");
        hz.addColorStop(0.14, "#000");
        hz.addColorStop(0.86, "#000");
        hz.addColorStop(1, "rgb(0 0 0 / 0)");
        c.fillStyle = hz;
        c.fillRect(0, 0, i.width, i.height);
    });
}
