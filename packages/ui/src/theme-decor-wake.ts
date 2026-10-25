export interface Pointer {
    x: number;
    y: number;
    vx: number;
    vy: number;
}

export interface Body {
    x: number;
    y: number;
    vx: number;
    vy: number;
}

export interface Wake {
    radius: number;
    /** How strongly the wake drags bodies along with the cursor, per second. */
    drag: number;
    /** How hard a moving cursor pushes nearby bodies aside, px/s². */
    part: number;
    /** Share of the cursor's speed that curls into an eddy behind it. */
    swirl: number;
    /** Cursor speed, px/s, at which the wake reaches full strength. A resting cursor does nothing. */
    fullStir: number;
}

/** Stirs a body the way moving air would: `weight` (0..1) scales how much this body feels it. */
export function applyWake(body: Body, pointer: Pointer | null, step: number, wake: Wake, weight = 1): void {
    if (!pointer) return;
    const dx = body.x - pointer.x;
    const dy = body.y - pointer.y;
    const distance = Math.hypot(dx, dy);
    const speed = Math.hypot(pointer.vx, pointer.vy);
    if (distance >= wake.radius || speed === 0) return;

    const stir = Math.min(1, speed / wake.fullStir);
    const reach = (1 - distance / wake.radius) ** 2 * weight;
    const pull = Math.min(1, reach * stir * wake.drag * step);
    body.vx += (pointer.vx - body.vx) * pull;
    body.vy += (pointer.vy - body.vy) * pull;
    const nx = dx / (distance + 1);
    const ny = dy / (distance + 1);
    const curl = Math.sign(pointer.vx * dy - pointer.vy * dx) * speed * wake.swirl;
    body.vx += (nx * wake.part - ny * curl) * reach * stir * step;
    body.vy += (ny * wake.part + nx * curl) * reach * stir * step;
}
