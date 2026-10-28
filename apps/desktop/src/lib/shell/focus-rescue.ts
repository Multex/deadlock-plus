import { focusPageHeading } from "./route-focus";

const CONTROLS = "a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, [tabindex]";

function tabbable(root: Element): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>(CONTROLS)].filter(
        (el) => el.tabIndex >= 0 && !el.closest("[inert]") && el.getClientRects().length > 0,
    );
}

/**
 * When the focused control is removed, as a deleted row's menu button is, the browser drops focus to the body
 * and the next Tab starts over at the title bar. Focus goes back to the control nearest where it was, in the
 * closest part of the page that is still there, else to the page heading. Anything that moves focus itself in
 * the meantime, like a closing dialog handing it back, wins.
 */
export function startFocusRescue(): () => void {
    let last: { el: HTMLElement; ancestors: Element[]; top: number } | null = null;
    let pending = false;

    const onfocusin = (e: FocusEvent) => {
        if (!(e.target instanceof HTMLElement)) return;
        const ancestors: Element[] = [];
        for (let up = e.target.parentElement; up && up !== document.body; up = up.parentElement) ancestors.push(up);
        last = { el: e.target, ancestors, top: e.target.getBoundingClientRect().top };
    };

    const dropped = () => {
        const active = document.activeElement;
        return last !== null && !last.el.isConnected && (active === null || active === document.body);
    };

    const rescue = () => {
        pending = false;
        if (!last || !dropped()) return;
        const home = last.ancestors.find((el) => el.isConnected);
        const { top } = last;
        const near = home
            ? tabbable(home).sort(
                  (a, b) =>
                      Math.abs(a.getBoundingClientRect().top - top) - Math.abs(b.getBoundingClientRect().top - top),
              )[0]
            : undefined;
        if (near) near.focus({ preventScroll: true });
        else focusPageHeading();
    };

    // Two frames: a dialog's focus scope hands focus back as it unmounts, after the removal itself.
    const observer = new MutationObserver(() => {
        if (pending || !dropped()) return;
        pending = true;
        requestAnimationFrame(() => requestAnimationFrame(rescue));
    });

    document.addEventListener("focusin", onfocusin);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
        document.removeEventListener("focusin", onfocusin);
        observer.disconnect();
    };
}
