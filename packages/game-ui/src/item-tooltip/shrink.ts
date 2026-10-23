import { shrinkFont } from "./view";

/**
 * Panorama's `text-overflow: shrink` on a one-line label: the font size steps down until the text fits the
 * label's width. Measured in the page, since the label's font follows the locale and no glyph table covers it.
 * The label needs `white-space: nowrap` and `overflow: hidden` so its scroll width is the text's width.
 */
export function shrinkToFit(node: HTMLElement, text: string) {
    let live = true;

    function fit(current: string) {
        node.style.fontSize = "";
        const width = node.clientWidth;
        const natural = node.scrollWidth;
        if (width === 0 || natural <= width) return;
        const base = parseFloat(getComputedStyle(node).fontSize);
        const size = shrinkFont(current, width, base, { measure: (_, at) => (natural * at) / base });
        node.style.fontSize = `${size}px`;
    }

    fit(text);
    // A web font that loads later changes the text's width.
    if (typeof document !== "undefined" && document.fonts) {
        void document.fonts.ready.then(() => {
            if (live) fit(text);
        });
    }

    return {
        update(next: string) {
            text = next;
            fit(next);
        },
        destroy() {
            live = false;
        },
    };
}
