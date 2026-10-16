import { currentWindow } from "./tauri";

export const MAIN_WINDOW = "main";

/** A plain browser has no Tauri window; it runs the app as the main window. */
export function readWindowLabel(current: () => { label: string }): string {
    try {
        return current().label;
    } catch {
        return MAIN_WINDOW;
    }
}

export const windowLabel = (): string => readWindowLabel(currentWindow);
