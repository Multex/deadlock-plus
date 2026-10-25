/** The axis-aligned box a `w`×`h` sheet covers once rotated by `deg`. */
export function rotatedBox(w: number, h: number, deg: number): { w: number; h: number } {
    const r = (Math.abs(deg) * Math.PI) / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    return { w: w * cos + h * sin, h: w * sin + h * cos };
}

/**
 * The largest scale at which the tilted sheet, with `pad` on every side for its drop shadow, fits the stage.
 * Capped at `max` so a 1440p window does not blow the type up past print size; 0 until the stage is measured.
 */
export function fitScale(
    stageW: number,
    stageH: number,
    paper: { width: number; height: number },
    angle: number,
    pad: number,
    max = 1.35,
): number {
    if (stageW <= 0 || stageH <= 0) return 0;
    const box = rotatedBox(paper.width, paper.height, angle);
    return Math.max(0.1, Math.min(max, (stageW - pad * 2) / box.w, (stageH - pad * 2) / box.h));
}
