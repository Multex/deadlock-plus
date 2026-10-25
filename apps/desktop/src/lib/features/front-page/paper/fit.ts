export interface FitOptions {
    max: number;
    min: number;
    fits: (size: number) => boolean;
}

/** The largest whole font size in `[min, max]` that `fits`, or `min` when none does. */
export function fitFontSize({ max, min, fits }: FitOptions): number {
    if (fits(max)) return max;
    let lo = min;
    let hi = max - 1;
    let best = min;
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (fits(mid)) {
            best = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return best;
}

/**
 * Shrinks a banner's font until it fits its box in `lines` lines without a word running past the edge,
 * so long German or Russian headlines stay on the page; past `min` the CSS line clamp cuts the rest.
 */
export function fitText(el: HTMLElement, { max, min, lines }: { max: number; min: number; lines: number }): void {
    const fits = (size: number) => {
        el.style.fontSize = `${size}px`;
        const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || size;
        return el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= lineHeight * lines + 1;
    };
    el.style.webkitLineClamp = "none";
    el.style.overflowWrap = "";
    const size = fitFontSize({ max, min, fits });
    el.style.fontSize = `${size}px`;
    // A single word wider than the page even at `min` (German compounds) breaks rather than being cut off.
    if (el.scrollWidth > el.clientWidth + 1) el.style.overflowWrap = "anywhere";
    el.style.webkitLineClamp = String(lines);
}
