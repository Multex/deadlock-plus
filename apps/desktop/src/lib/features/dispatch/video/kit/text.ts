import type { Ctx } from "./types";

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

const DEFAULT_FILL = "#181611";

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
    ctx.fillStyle = s.fill ?? DEFAULT_FILL;
    // Spacing trails the last letter; centred text would sit half a gap left of centre.
    const trail = (s.track ?? 0) * px;
    const shift = ctx.textAlign === "center" ? trail / 2 : ctx.textAlign === "right" ? trail : 0;
    ctx.fillText(str, x + shift, y);
    const w = ctx.measureText(str).width;
    ctx.letterSpacing = "0px";
    return { w, px };
}

/** Words onto lines no wider than `max`, in the context's current font. */
export function wrap(ctx: Ctx, str: string, max: number): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of str.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > max) {
            lines.push(line);
            line = word;
        } else line = next;
    }
    if (line) lines.push(line);
    return lines;
}
