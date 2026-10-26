import { easeOutCubic } from "./ease";

/**
 * A number counting up from zero between `start` and `end` seconds, racing first and settling last. Whole steps of
 * `1 / steps`, so a share counts in whole percent with `steps = 100`.
 */
export function countUp(value: number, t: number, start: number, end: number, steps = 1): number {
    if (t >= end) return value;
    if (t <= start) return 0;
    return Math.round(value * easeOutCubic((t - start) / (end - start)) * steps) / steps;
}
