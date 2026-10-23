type Wheel = Pick<WheelEvent, "deltaX" | "deltaY" | "deltaMode">;

const LINE = 16;
const ZONE = 48;
const MAX_SPEED = 14;

/** Pixels a wheel event scrolls a one-row track sideways; `page` is the track's visible width. */
export function sidewaysWheel(event: Wheel, page: number): number {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (event.deltaMode === 1) return delta * LINE;
    if (event.deltaMode === 2) return delta * page;
    return delta;
}

/** Pixels per frame a drag near (or past) an edge of `box` scrolls the track; 0 away from the edges. */
export function edgeSpeed(x: number, box: { left: number; right: number }): number {
    const fromLeft = x - box.left;
    const fromRight = box.right - x;
    // At least 1 px: a smaller step may not move `scrollLeft` at all, which ends the auto-scroll loop.
    if (fromLeft < ZONE) return -Math.max(1, MAX_SPEED * Math.min(1, (ZONE - fromLeft) / ZONE));
    if (fromRight < ZONE) return Math.max(1, MAX_SPEED * Math.min(1, (ZONE - fromRight) / ZONE));
    return 0;
}

/**
 * The `scrollLeft` one auto-scroll frame moves to. Scrolling right stops once `end` (content x where the
 * steps end) is in view: past it are only empty slots, and the drop caret would scroll out of sight.
 */
export function dragScroll(view: { scrollLeft: number; width: number }, speed: number, end: number): number {
    const next = view.scrollLeft + speed;
    if (speed > 0) return Math.max(view.scrollLeft, Math.min(next, end - view.width));
    return Math.max(0, next);
}

/** The smallest change to `scrollLeft` that shows `start..end` (content coordinates). */
export function reveal(view: { scrollLeft: number; width: number }, start: number, end: number): number {
    if (start < view.scrollLeft) return Math.max(0, start);
    if (end > view.scrollLeft + view.width) return Math.max(0, end - view.width);
    return view.scrollLeft;
}
