export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export const easeOutCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3;

export const easeInOut = (x: number) => {
    const k = clamp01(x);
    return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
};

/** Overshoots before it settles: the "slam". The default `c` overshoots by about 10%. */
export const easeOutBack = (x: number, c = 1.70158) => {
    const k = clamp01(x) - 1;
    return 1 + (c + 1) * k ** 3 + c * k ** 2;
};

export function lerp(a: number, b: number, k: number): number {
    return a + (b - a) * k;
}
