import { radioTarget } from "./radio-group";

export const PICKER_OPTIONS = 8;
const CENTER = 4;

export type PickerCell<T> = { kind: "option"; option: T; index: number } | { kind: "center" };

/** A 3x3 grid read row by row; the middle cell is not an option. */
export function pickerCells<T>(options: readonly T[]): PickerCell<T>[] {
    if (options.length !== PICKER_OPTIONS) {
        throw new Error(`a position picker takes ${PICKER_OPTIONS} options, got ${options.length}`);
    }
    const cells: PickerCell<T>[] = options.map((option, index) => ({ kind: "option", option, index }));
    cells.splice(CENTER, 0, { kind: "center" });
    return cells;
}

export function tabStop<T>(values: readonly T[], value: T): number {
    return Math.max(0, values.indexOf(value));
}

export function pickerTarget<T>(key: string, values: readonly T[], value: T): number | null {
    return radioTarget(key, tabStop(values, value), values.length);
}
