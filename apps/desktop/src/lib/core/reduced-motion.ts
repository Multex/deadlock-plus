type Root = Pick<Element, "hasAttribute">;

/**
 * Whether motion is cut. The shell marks the root from the motion setting and the OS preference together, so this
 * honours a user who chose full motion on a system that asks for less, which the media query alone would not.
 */
export function prefersReducedMotion(root: Root = document.documentElement): boolean {
    return root.hasAttribute("data-reduced-motion");
}

/** The `behavior` for a scroll the app starts itself; the stylesheet cannot override one given in script. */
export function smoothScroll(root?: Root): ScrollBehavior {
    return prefersReducedMotion(root) ? "auto" : "smooth";
}
