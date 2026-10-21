export const SNAP_KEY = "deadlock-plus:builds-editor-snap";

/** Holding Alt during a resize flips the toolbar's Snap setting for that drag. */
export function freeResize(snap: boolean, alt: boolean): boolean {
    return snap === alt;
}

export function loadSnap(): boolean {
    try {
        return localStorage.getItem(SNAP_KEY) !== "off";
    } catch {
        return true;
    }
}

export function saveSnap(snap: boolean): void {
    try {
        localStorage.setItem(SNAP_KEY, snap ? "on" : "off");
    } catch {
        // Storage can be unavailable; the setting just won't persist.
    }
}
