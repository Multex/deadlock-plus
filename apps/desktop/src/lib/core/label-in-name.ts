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

/** Every `tag` element in server-rendered `html` carrying `attr`, with its `aria-label` and inner html. */
export function labelledElements(html: string, tag: string, attr = "aria-label"): { name: string; inner: string }[] {
    const opener = new RegExp(`<(${tag}) ([^>]*\\b${attr}\\b[^>]*)>`, "g");
    return [...html.matchAll(opener)].map((open) => {
        const name = open[1];
        const from = open.index + open[0].length;
        let depth = 1;
        let close = html.length;
        for (const m of html.slice(from).matchAll(new RegExp(`<${name}[ >]|</${name}>`, "g"))) {
            depth += m[0].startsWith("</") ? -1 : 1;
            if (depth === 0) {
                close = from + m.index;
                break;
            }
        }
        return { name: open[2].match(/aria-label="([^"]*)"/)?.[1] ?? "", inner: html.slice(from, close) };
    });
}
