/**
 * SvelteKit leaves focus on the body after a page change, so the next Tab would start over at the title bar.
 * Focus goes to the new page's heading instead, or to the page itself when it has none yet. A page that put
 * focus somewhere on purpose keeps it.
 */
export function focusPageHeading(): void {
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const main = document.querySelector("main");
    const target = main?.querySelector<HTMLElement>("h1") ?? main;
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
    target.dataset.routeFocus = "";
    target.focus({ preventScroll: true });
}
