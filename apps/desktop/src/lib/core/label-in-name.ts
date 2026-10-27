const words = (text: string) =>
    text
        .replace(/<!--.*?-->/gs, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#39;|&apos;/g, "'")
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);

/**
 * WCAG 2.5.3 as axe checks it: the words a control shows must appear, in order and unbroken, in its
 * accessible name, ignoring case and punctuation. `visibleHtml` is the control's rendered content.
 */
export function labelInName(name: string, visibleHtml: string): boolean {
    const have = words(name);
    const shown = words(visibleHtml);
    if (shown.length === 0) return true;
    for (let i = 0; i + shown.length <= have.length; i++) {
        if (shown.every((w, j) => have[i + j] === w)) return true;
    }
    return false;
}
