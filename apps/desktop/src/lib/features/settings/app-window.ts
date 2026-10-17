// The backend clamps to the same range when it applies the zoom at startup.
export const UI_SCALE_RANGE = { min: 80, max: 150, step: 10 };
export const DEFAULT_UI_SCALE = 100;

export function resolveUiScale(stored: unknown): number {
    if (typeof stored !== "number" || !Number.isFinite(stored)) return DEFAULT_UI_SCALE;
    const { min, max, step } = UI_SCALE_RANGE;
    const snapped = min + Math.round((stored - min) / step) * step;
    return Math.min(max, Math.max(min, snapped));
}

export function resolveHardwareAcceleration(stored: unknown): boolean {
    return stored !== false;
}
