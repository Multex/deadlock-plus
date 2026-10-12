export const MAX_AUTO_TICKS = 24;

export type SliderRange = { min: number; max: number; step: number };

function decimalPlaces(n: number): number {
    if (Number.isInteger(n)) return 0;
    const [mantissa, exponent] = n.toString().split("e-");
    return (mantissa.split(".")[1]?.length ?? 0) + (exponent ? Number(exponent) : 0);
}

function lastStepIndex({ min, max, step }: SliderRange): number {
    return Math.floor((max - min) / step + 1e-9);
}

function stepValue(index: number, { min, step }: SliderRange): number {
    const factor = 10 ** Math.max(decimalPlaces(step), decimalPlaces(min));
    return Math.round((min + index * step) * factor) / factor;
}

/** The step grid starts at `min`; a `max` that is off the grid is not reachable. */
export function snapValue(value: number, range: SliderRange): number {
    const { min, max, step } = range;
    if (!Number.isFinite(value) || max <= min) return min;
    const clamped = Math.min(max, Math.max(min, value));
    if (!(step > 0)) return clamped;
    // Half-way values go to the lower step.
    const index = Math.ceil((clamped - min) / step - 0.5);
    return stepValue(Math.min(lastStepIndex(range), Math.max(0, index)), range);
}

export function valuePercent(value: number, min: number, max: number): number {
    if (!(max > min) || !Number.isFinite(value)) return 0;
    return (Math.min(max, Math.max(min, value)) - min) * (100 / (max - min));
}

export function tickValues(ticks: boolean | readonly number[] | undefined, range: SliderRange): number[] {
    const { min, max, step } = range;
    if (!ticks) return [];
    if (ticks === true) {
        if (!(step > 0) || !(max > min)) return [];
        const count = lastStepIndex(range) + 1;
        if (count > MAX_AUTO_TICKS) return [];
        return Array.from({ length: count }, (_, i) => stepValue(i, range));
    }
    const inRange = ticks.filter((v) => Number.isFinite(v) && v >= min && v <= max);
    return [...new Set(inRange)].sort((a, b) => a - b);
}

/** PageUp and PageDown move a tenth of the range, at least one step. */
export function pageValue(key: string, value: number, range: SliderRange): number | null {
    const direction = key === "PageUp" ? 1 : key === "PageDown" ? -1 : 0;
    if (direction === 0) return null;
    if (!(range.step > 0)) return snapValue(value + (direction * (range.max - range.min)) / 10, range);
    const pageSteps = Math.max(1, Math.round(lastStepIndex(range) / 10));
    return snapValue(value + direction * pageSteps * range.step, range);
}
