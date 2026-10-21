import { gameColors, type GameColor } from "./colors";

/**
 * The browser alpha that matches a Panorama alpha. Panorama blends in linear light, so a colour at alpha `a`
 * over another looks like the browser's blend at the sRGB encoding of `a`: `#ffffff50` over black shows as
 * `#989898`, not `#505050`.
 */
export function panoramaAlpha(alpha: number): number {
    const a = Math.min(Math.max(alpha, 0), 1);
    return a <= 0.0031308 ? a * 12.92 : 1.055 * a ** (1 / 2.4) - 0.055;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * A Panorama colour as CSS, its alpha through {@link panoramaAlpha}. Takes `#rgb`, `#rrggbb`, `#rrggbbaa` or a
 * {@link GameColor} name, each optionally followed by Panorama's `&xx` hex alpha: `offWhite&90`, `#000000&60`.
 */
export function panoramaColor(value: string): string {
    const [base, suffix, ...rest] = value.split("&");
    const hex = base in gameColors ? gameColors[base as GameColor] : base;
    if (!HEX.test(hex) || rest.length > 0 || (suffix !== undefined && !/^[0-9a-f]{2}$/i.test(suffix))) {
        throw new Error(`not a Panorama colour: ${value}`);
    }
    let digits = hex.slice(1).toLowerCase();
    if (digits.length === 3) digits = [...digits].map((d) => d + d).join("");
    if (digits.length === 8 && suffix !== undefined) throw new Error(`two alphas in Panorama colour: ${value}`);

    const alphaHex = suffix ?? digits.slice(6, 8);
    const rgb = digits.slice(0, 6);
    if (alphaHex === "" || alphaHex.toLowerCase() === "ff") return `#${rgb}`;

    const [r, g, b] = [0, 2, 4].map((i) => parseInt(rgb.slice(i, i + 2), 16));
    const alpha = Math.round(panoramaAlpha(parseInt(alphaHex, 16) / 255) * 1000) / 1000;
    return `rgb(${r} ${g} ${b} / ${alpha})`;
}

/** Panorama px in CSS px, for an app that draws the game's panels at its own `uiScale`. */
export function scale(px: number, uiScale = 1): number {
    return px * uiScale;
}
