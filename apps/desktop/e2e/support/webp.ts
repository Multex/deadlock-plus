/** The whole window, or the tight crop a phone shows. */
export type Kind = "full" | "detail";

export function shotFile(name: string, kind: Kind): string {
    return kind === "detail" ? `${name}-mobile.webp` : `${name}.webp`;
}

/**
 * Canvas quality for the picture, from 0 to 1. Measured against the PNG: both look the same at full size.
 * The window's text is small, so it softens sooner than the crop's, which is drawn three times larger.
 * Chromium writes lossless WebP at 1, which is barely smaller than the PNG.
 */
export function webpQuality(kind: Kind): number {
    return kind === "detail" ? 0.8 : 0.86;
}
