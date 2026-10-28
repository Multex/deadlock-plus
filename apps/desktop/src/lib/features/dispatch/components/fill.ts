import { fitFontSize } from "$lib/features/front-page/paper/fit";

/**
 * True when `el` spills out of its own box, or a no-wrap line inside it runs past its edge. A `data-fit-line` line
 * does not count: `fitLines` shrinks it afterwards.
 */
export function overflows(el: HTMLElement): boolean {
    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) return true;
    for (const child of el.querySelectorAll<HTMLElement>("*")) {
        if (child.clientWidth === 0 || child.closest("[data-fit-line]")) continue;
        const style = getComputedStyle(child);
        if (style.whiteSpace !== "nowrap") continue;
        if (child.scrollWidth > child.clientWidth || (style.textOverflow === "ellipsis" && cut(child, style)))
            return true;
    }
    return false;
}

/**
 * `scrollWidth` is rounded, so text a fraction of a pixel too wide still reads as fitting while the browser draws
 * an ellipsis. Measures the text itself, undoing any scale transform on the way (story mode, export preview).
 */
function cut(el: HTMLElement, style = getComputedStyle(el)): boolean {
    const range = document.createRange();
    range.selectNodeContents(el);
    const scale = el.offsetWidth > 0 ? el.getBoundingClientRect().width / el.offsetWidth : 1;
    const text = range.getBoundingClientRect().width / (scale || 1);
    const room = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return text > room + 0.01;
}

/**
 * Sets `--fit-scale` on `el` to the largest factor in `[min, max]`, in hundredths, at which its content still fits;
 * the components inside multiply their type by it. Returns the factor.
 */
export function fillScale(el: HTMLElement, min: number, max: number, fits = () => !overflows(el)): number {
    const set = (p: number) => el.style.setProperty("--fit-scale", String(p / 100));
    const best = fitFontSize({
        max: Math.round(max * 100),
        min: Math.round(min * 100),
        fits: (p) => {
            set(p);
            return fits();
        },
    });
    set(best);
    return best / 100;
}

/** Shrinks each `data-fit-line` line under `root` through `--line-fit` until it fits its width, down to half. */
export function fitLines(root: HTMLElement): void {
    for (const el of root.querySelectorAll<HTMLElement>("[data-fit-line]")) {
        const fits = (pct: number) => {
            el.style.setProperty("--line-fit", String(pct / 100));
            return el.scrollWidth <= el.clientWidth && !cut(el);
        };
        el.style.setProperty("--line-fit", String(fitFontSize({ max: 100, min: 50, fits }) / 100));
    }
}

/** Spreads the rows inside `el` apart through `--row-gap`, in px, once the type has stopped growing. */
export function fillGap(el: HTMLElement, max: number): void {
    const set = (px: number) => el.style.setProperty("--row-gap", `${px}px`);
    set(
        fitFontSize({
            max,
            min: 0,
            fits: (px) => {
                set(px);
                return !overflows(el);
            },
        }),
    );
}

/** Clears what `fillScale`, `fillGap` and `fitLines` set on and under `el`. */
export function resetFill(el: HTMLElement): void {
    el.style.removeProperty("--fit-scale");
    el.style.removeProperty("--row-gap");
    for (const line of el.querySelectorAll<HTMLElement>("[data-fit-line]")) line.style.removeProperty("--line-fit");
    for (const dl of el.querySelectorAll<HTMLElement>("[data-fit-values]")) dl.style.removeProperty("--v-fit");
}

/** The masthead's name on one line at the largest size that fits, for narrow cards and long names. */
export function fitMasthead(root: HTMLElement, max = 45): void {
    const name = root.querySelector<HTMLElement>(".masthead h1");
    if (!name) return;
    const fits = (size: number) => {
        name.style.fontSize = `${size}px`;
        return name.scrollWidth <= name.clientWidth;
    };
    name.style.fontSize = `${fitFontSize({ max, min: 20, fits })}px`;
}

/**
 * Runs `layout` once the fonts are in and again whenever one of `watch` changes height, so it measures after the
 * kit's own headline fitting has settled.
 */
export function relayout(root: HTMLElement, watch: string, layout: () => void): () => void {
    let frame = 0;
    const schedule = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(layout);
    };
    const heights = new WeakMap<Element, number>();
    const observer = new ResizeObserver((entries) => {
        let changed = false;
        for (const entry of entries) {
            const h = entry.contentRect.height;
            if (heights.get(entry.target) !== h) changed = true;
            heights.set(entry.target, h);
        }
        if (changed) schedule();
    });
    for (const el of root.querySelectorAll(watch)) observer.observe(el);
    schedule();
    void document.fonts?.ready.then(schedule);
    return () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
    };
}
