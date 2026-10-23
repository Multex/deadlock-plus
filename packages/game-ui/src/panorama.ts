import { gameColors, type GameColor } from "./colors";

type Rgb = [number, number, number];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function decode(channel: number): number {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function encode(light: number): number {
    const l = Math.min(Math.max(light, 0), 1);
    return 255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055);
}

function clamp(alpha: number): number {
    return Math.min(Math.max(alpha, 0), 1);
}

/** `#rgb`, `#rrggbb`, `#rrggbbaa` or a {@link GameColor} name, with an optional `&xx` alpha. */
function parse(value: string): { rgb: Rgb; alpha: string | null } {
    const [base, suffix, ...rest] = value.split("&");
    const hex = base in gameColors ? gameColors[base as GameColor] : base;
    if (!HEX.test(hex) || rest.length > 0 || (suffix !== undefined && !/^[0-9a-f]{2}$/i.test(suffix))) {
        throw new Error(`not a Panorama colour: ${value}`);
    }
    let digits = hex.slice(1).toLowerCase();
    if (digits.length === 3) digits = [...digits].map((d) => d + d).join("");
    if (digits.length === 8 && suffix !== undefined) throw new Error(`two alphas in Panorama colour: ${value}`);
    const alpha = suffix ?? digits.slice(6, 8);
    const rgb = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as Rgb;
    return { rgb, alpha: alpha === "" || alpha.toLowerCase() === "ff" ? null : alpha };
}

function opaque(value: string): Rgb {
    const { rgb, alpha } = parse(value);
    if (alpha !== null) throw new Error(`a backdrop must be opaque: ${value}`);
    return rgb;
}

function blend(color: Rgb, alpha: number, under: Rgb): Rgb {
    return color.map((c, i) => encode(alpha * decode(c) + (1 - alpha) * decode(under[i]))) as Rgb;
}

/**
 * What Panorama draws for `color` at `alpha` over the opaque `under`, as hex. Panorama blends in linear light:
 * `#00000066` over `#5c5783` is `#484568` in the game where the browser's own blend gives `#37344f`.
 */
export function panoramaBlend(color: string, alpha: number, under: string): string {
    const out = blend(parse(color).rgb, clamp(alpha), opaque(under));
    return `#${out.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The browser alpha that draws `color` over `under` the way Panorama draws it at `alpha`. The browser blends
 * sRGB values, so the match depends on both colours: a black overlay comes out near `1 - (1 - a)^(1/2.2)` over
 * any background, a faint white one over near-black several times stronger than `a`. Over textured art, pass
 * the art's typical colour. The alpha keeps the worst channel's error smallest.
 */
export function panoramaAlpha(alpha: number, color: string, under: string): number {
    const a = clamp(alpha);
    const [c, u] = [parse(color).rgb, opaque(under)];
    const target = blend(c, a, u);
    if (a === 0 || a === 1 || c.every((v, i) => v === u[i])) return a;
    // The worst channel's error is convex in the browser alpha, so a ternary search finds its minimum.
    const worst = (x: number) => Math.max(...c.map((v, i) => Math.abs(x * v + (1 - x) * u[i] - target[i])));
    let [lo, hi] = [0, 1];
    for (let i = 0; i < 60; i++) {
        const m1 = lo + (hi - lo) / 3;
        const m2 = hi - (hi - lo) / 3;
        if (worst(m1) <= worst(m2)) hi = m2;
        else lo = m1;
    }
    return (lo + hi) / 2;
}

/**
 * A Panorama colour as CSS. Takes `#rgb`, `#rrggbb`, `#rrggbbaa` or a {@link GameColor} name, each optionally
 * followed by Panorama's `&xx` hex alpha: `offWhite&90`, `#000000&60`. A translucent colour needs the opaque
 * colour it sits on, `under`, for {@link panoramaAlpha}.
 */
export function panoramaColor(value: string, under?: string): string {
    const { rgb, alpha } = parse(value);
    const hex = `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
    if (alpha === null) return hex;
    if (under === undefined) throw new Error(`a translucent Panorama colour needs its backdrop: ${value}`);
    const a = Math.round(panoramaAlpha(parseInt(alpha, 16) / 255, hex, under) * 1000) / 1000;
    return `rgb(${rgb.join(" ")} / ${a})`;
}

/** Panorama px in CSS px, for an app that draws the game's panels at its own `uiScale`. */
export function scale(px: number, uiScale = 1): number {
    return px * uiScale;
}
