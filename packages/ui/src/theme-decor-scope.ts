export interface DecorScope {
    /** Where the page's own content lives, for decor that hangs around it; null when the page has none. */
    root: HTMLElement | null;
    /** How far that content has scrolled, so its boxes can be measured from the top of the page. */
    scrollTop(): number;
}

/**
 * A page that hosts decor outside the app's layout marks the box around it with `data-decor-scope`; the decor
 * then reads that box, which the window scrolls. Elsewhere it is the app's `main`, which scrolls by itself.
 */
export function decorScope(
    canvas: { closest(selector: string): Element | null },
    doc: { querySelector(selector: string): Element | null },
    win: { scrollY: number },
): DecorScope {
    const scope = canvas.closest("[data-decor-scope]") as HTMLElement | null;
    if (scope) return { root: scope, scrollTop: () => scope.scrollTop + win.scrollY };
    const main = doc.querySelector("main") as HTMLElement | null;
    return { root: main, scrollTop: () => main?.scrollTop ?? 0 };
}
