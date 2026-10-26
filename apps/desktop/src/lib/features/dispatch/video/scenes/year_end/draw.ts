export type Ctx = OffscreenCanvasRenderingContext2D;

/** The Year-End cover and poster inks (their oklch tokens, in sRGB). */
export const INK = {
    room: "#060504",
    black: "#0d0b07",
    band: "#120f0b",
    gold: "#deb866",
    goldDeep: "#9d712d",
    goldInk: "#795209",
    goldFill: "#bd9033",
    cream: "#f4eee0",
    paper: "#eee7d8",
    ink: "#181611",
    inkSoft: "#484137",
} as const;

export interface TextStyle {
    family: string;
    weight: number;
    px: number;
    italic?: boolean;
    /** Letter spacing in em. */
    track?: number;
    fill?: string | CanvasGradient;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    /** The text shrinks to fit this width. */
    maxW?: number;
}

export function setFont(ctx: Ctx, s: TextStyle, px = s.px): void {
    ctx.font = `${s.italic ? "italic " : ""}${s.weight} ${px}px "${s.family}"`;
    ctx.letterSpacing = `${(s.track ?? 0) * px}px`;
}

/** The size `s` must drop to for `text` to fit `s.maxW`. */
export function fitPx(ctx: Ctx, text: string, s: TextStyle): number {
    setFont(ctx, s);
    if (!s.maxW) return s.px;
    const w = ctx.measureText(text).width;
    return w > s.maxW ? (s.px * s.maxW) / w : s.px;
}

/** Draws one line; returns its width and the size it was set at. */
export function text(ctx: Ctx, str: string, x: number, y: number, s: TextStyle): { w: number; px: number } {
    const px = fitPx(ctx, str, s);
    setFont(ctx, s, px);
    ctx.textAlign = s.align ?? "left";
    ctx.textBaseline = s.baseline ?? "middle";
    ctx.fillStyle = s.fill ?? INK.ink;
    // Spacing trails the last letter; centred text would sit half a gap left of centre.
    const trail = (s.track ?? 0) * px;
    const shift = ctx.textAlign === "center" ? trail / 2 : ctx.textAlign === "right" ? trail : 0;
    ctx.fillText(str, x + shift, y);
    const w = ctx.measureText(str).width;
    ctx.letterSpacing = "0px";
    return { w, px };
}

export function goldGradient(ctx: Ctx, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "#fff6d0");
    g.addColorStop(0.34, INK.gold);
    g.addColorStop(0.52, "#ad7b2f");
    g.addColorStop(0.68, "#eed592");
    g.addColorStop(1, INK.goldDeep);
    return g;
}

/** A gold that reads on paper: the poster's darker foil. */
export function inkGoldGradient(ctx: Ctx, y0: number, y1: number): CanvasGradient {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, "#c89e41");
    g.addColorStop(1, INK.goldInk);
    return g;
}

export function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let x = s;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

/** A hit's shake, `dt` seconds after it: a quick decaying wobble. */
export function shake(dt: number, amp: number, seed: number): [number, number] {
    if (dt < 0 || dt > 0.6) return [0, 0];
    const k = amp * Math.exp(-dt / 0.12);
    return [k * Math.sin(dt * 71 + seed), k * Math.cos(dt * 59 + seed * 1.7)];
}

/** Gold sparks thrown from a point by a hit, `dt` seconds after it. */
export function sparks(ctx: Ctx, x: number, y: number, dt: number, u: number, seed: number, count = 12): void {
    if (dt < 0 || dt > 0.7) return;
    const r = rng(seed);
    const fade = 1 - dt / 0.7;
    ctx.fillStyle = INK.gold;
    for (let i = 0; i < count; i++) {
        const a = r() * Math.PI * 2;
        const v = (260 + r() * 420) * u;
        const d = (v * (1 - Math.exp(-5 * dt))) / 5;
        const size = (3 + r() * 5) * u * fade;
        ctx.globalAlpha = fade;
        ctx.fillRect(x + Math.cos(a) * d - size / 2, y + Math.sin(a) * d + 120 * u * dt * dt - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
}

interface Mote {
    x: number;
    y: number;
    speed: number;
    size: number;
    phase: number;
    rate: number;
}

const MOTES: Mote[] = (() => {
    const r = rng(1172);
    return Array.from({ length: 70 }, () => ({
        x: r(),
        y: r(),
        speed: 0.012 + r() * 0.03,
        size: 1.5 + r() * 3,
        phase: r() * Math.PI * 2,
        rate: 1 + r() * 3,
    }));
})();

/** Gold dust rising through a dark room; `drift` speeds it up (the riser). */
export function dust(ctx: Ctx, w: number, h: number, t: number, u: number, alpha: number, drift = 0): void {
    if (alpha <= 0) return;
    ctx.fillStyle = INK.gold;
    for (const m of MOTES) {
        const y = (((m.y - t * m.speed * (1 + drift)) % 1) + 1) % 1;
        const glint = 0.25 + 0.75 * Math.abs(Math.sin(t * m.rate + m.phase));
        ctx.globalAlpha = alpha * glint * 0.7;
        const s = m.size * u;
        ctx.fillRect(m.x * w, y * h, s, s);
    }
    ctx.globalAlpha = 1;
}

/** An image filling a box, cropped to it, anchored at (`ax`, `ay`) as fractions. */
export function coverImage(
    ctx: Ctx,
    img: CanvasImageSource & { width: number; height: number },
    x: number,
    y: number,
    w: number,
    h: number,
    ax = 0.5,
    ay = 0.5,
): void {
    const k = Math.max(w / img.width, h / img.height);
    const sw = w / k;
    const sh = h / k;
    ctx.drawImage(img, (img.width - sw) * ax, (img.height - sh) * ay, sw, sh, x, y, w, h);
}

/** An image fitting inside a box, centred on x and sat on the box's bottom. */
export function containImage(
    ctx: Ctx,
    img: CanvasImageSource & { width: number; height: number },
    x: number,
    y: number,
    w: number,
    h: number,
): void {
    const k = Math.min(w / img.width, h / img.height);
    ctx.drawImage(img, x + (w - img.width * k) / 2, y + h - img.height * k, img.width * k, img.height * k);
}

type Bitmap = CanvasImageSource & { width: number; height: number };
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

/** The cover's sepia-gold wash over the hero's backdrop collage. */
export function tinted(img: Bitmap): Bitmap {
    return bake(img, "tint", (c, i) => {
        c.filter = "grayscale(1) sepia(1) saturate(1.7) hue-rotate(-6deg) brightness(0.8) contrast(1.15)";
        c.drawImage(i, 0, 0);
    });
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

/** Paper's grain and light: a soft vignette and a sheen across it. */
export function paper(ctx: Ctx, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = INK.paper;
    ctx.fillRect(x, y, w, h);
    const r = Math.max(w, h);
    const v = ctx.createRadialGradient(x + w / 2, y + h * 0.4, r * 0.3, x + w / 2, y + h * 0.4, r * 0.8);
    v.addColorStop(0, "rgb(120 100 60 / 0)");
    v.addColorStop(1, "rgb(120 100 60 / 0.16)");
    ctx.fillStyle = v;
    ctx.fillRect(x, y, w, h);
    const s = ctx.createLinearGradient(x, y, x + w, y + h);
    s.addColorStop(0, "rgb(255 255 255 / 0.2)");
    s.addColorStop(0.3, "rgb(255 255 255 / 0)");
    s.addColorStop(0.7, "rgb(255 255 255 / 0)");
    s.addColorStop(1, "rgb(255 255 255 / 0.1)");
    ctx.fillStyle = s;
    ctx.fillRect(x, y, w, h);
}

/** A dark room lit from the middle. */
export function room(ctx: Ctx, w: number, h: number, light: number): void {
    ctx.fillStyle = INK.room;
    ctx.fillRect(0, 0, w, h);
    if (light <= 0) return;
    const r = Math.max(w, h);
    const g = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, r * 0.7);
    g.addColorStop(0, `rgb(70 52 24 / ${0.55 * light})`);
    g.addColorStop(1, "rgb(70 52 24 / 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
}

export function lerp(a: number, b: number, k: number): number {
    return a + (b - a) * k;
}
