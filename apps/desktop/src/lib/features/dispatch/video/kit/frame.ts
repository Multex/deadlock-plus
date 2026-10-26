import type { Rect } from "./types";

/**
 * The content square, sized from the shorter side so every aspect is designed rather than cropped. In 9:16 it sits
 * above centre, and `safe` is the band key text keeps to: short-video apps lay their captions and buttons over the
 * lower part and their tabs over the top.
 */
export function sceneFrame(w: number, h: number): { u: number; box: Rect; safe: { top: number; bottom: number } } {
    const s = Math.min(w, h);
    const tall = h > w;
    const cy = tall ? h * 0.42 : h / 2;
    const y = Math.round(Math.min(h - s, Math.max(0, cy - s / 2)));
    return {
        u: s / 1080,
        box: { x: Math.round((w - s) / 2), y, w: s, h: s },
        safe: tall ? { top: Math.round(h * 0.125), bottom: Math.round(h * 0.7084) } : { top: 0, bottom: h },
    };
}
