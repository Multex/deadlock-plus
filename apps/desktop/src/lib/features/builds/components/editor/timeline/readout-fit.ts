import { readoutPlacement, type ReadoutPlacementOptions } from "../../../editor/timeline";
import type { TipSide } from "../../shop/item-tips";

export interface ReadoutFitOptions extends ReadoutPlacementOptions {
    /** How far the item tooltip's ALT column reaches past the readout's body (`tip.width`); 0 without one. */
    details: number;
}

/**
 * {@link readoutPlacement} for a readout whose item tooltip has an ALT column beside its body, with the side that
 * column opens on. `left` is the left edge of the whole readout, column included, and the whole of it stays inside
 * the strip. Above the strip the body keeps its place over the anchor and the column opens on the side with room;
 * beside the anchor the column opens away from the icon so neither half covers it.
 */
export function readoutFit(options: ReadoutFitOptions): { left: number; top: number; side: TipSide } {
    const { anchor, tip, track, bounds, gap, details } = options;
    const body = readoutPlacement(options);
    if (details <= 0) return { ...body, side: "right" };

    const full = tip.width + details;
    const maxLeft = Math.max(0, track.width - full);
    const above = track.top - gap - tip.height >= bounds.top;
    if (!above) {
        const wide = readoutPlacement({ ...options, tip: { width: full, height: tip.height } });
        return { left: wide.left, top: body.top, side: wide.left > anchor ? "right" : "left" };
    }

    const roomRight = track.width - body.left - tip.width;
    const roomLeft = body.left;
    const side: TipSide =
        details <= roomRight ? "right" : details <= roomLeft ? "left" : roomLeft > roomRight ? "left" : "right";
    const start = side === "right" ? body.left : body.left - details;
    return { left: Math.min(Math.max(start, 0), maxLeft), top: body.top, side };
}
