export const slug = (s) =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40);

export const stateOf = (route) => slug(route.split("?")[0]) || "home";

export const webShotName = (route, width, extra) =>
    [`web-${stateOf(route)}`, extra, width].filter((part) => part !== undefined && part !== "").join("-");

export const STILL = `*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; scroll-behavior: auto !important; }`;

export async function settle(page) {
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page
        .waitForFunction(
            async () => {
                await document.fonts.ready;
                return [...document.images].every((i) => i.complete) && !document.querySelector(".animate-pulse");
            },
            null,
            { timeout: 10000 },
        )
        .catch(() => {});
    await page.waitForTimeout(250);
}

// Runs in the page from its source, so it only uses its arguments.
export function collectTags(match, matcher) {
    const norm = (s) => s.replace(/\s+/g, " ").trim();
    const find = (text) => match(matcher, text);
    const visible = (el) => {
        for (let e = el; e; e = e.parentElement) {
            const s = getComputedStyle(e);
            if (s.display === "none" || s.visibility !== "visible" || parseFloat(s.opacity) === 0) return false;
        }
        return true;
    };
    // A string scrolled out of its container is not on the picture.
    const box = (el, r) => {
        let { left, top, right, bottom } = r;
        for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
            const s = getComputedStyle(e);
            if (s.overflowX === "visible" && s.overflowY === "visible") continue;
            const a = e.getBoundingClientRect();
            left = Math.max(left, a.left);
            top = Math.max(top, a.top);
            right = Math.min(right, a.right);
            bottom = Math.min(bottom, a.bottom);
        }
        const x = Math.max(0, left);
        const y = Math.max(0, top);
        const x2 = Math.min(innerWidth, right);
        const y2 = Math.min(innerHeight, bottom);
        if (x2 - x < 2 || y2 - y < 2) return null;
        return { x: Math.round(x), y: Math.round(y), width: Math.round(x2 - x), height: Math.round(y2 - y) };
    };
    const tags = [];
    const seen = new Set();
    const add = (el, rect, candidates) => {
        if (!candidates || !visible(el)) return;
        const b = box(el, rect);
        if (!b) return;
        for (const c of candidates) {
            const sig = `${c.file}#${c.identifier}@${b.x},${b.y}`;
            if (seen.has(sig)) continue;
            seen.add(sig);
            tags.push({
                identifier: c.identifier,
                source: c.file,
                ...b,
                ...(candidates.length > 1 ? { ambiguous: true } : {}),
            });
        }
    };
    const matched = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const candidates = find(node.nodeValue ?? "");
        if (!candidates) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        add(node.parentElement, range.getBoundingClientRect(), candidates);
        matched.add(node.parentElement);
    }
    // Strings split over several nodes by an interpolated value or markup.
    for (const el of document.body.querySelectorAll("*")) {
        if (matched.has(el) || !el.children.length || ["SCRIPT", "STYLE", "svg"].includes(el.tagName)) continue;
        const text = el.textContent ?? "";
        if (text.length > 400) continue;
        const candidates = find(text);
        if (!candidates) continue;
        if ([...el.querySelectorAll("*")].some((d) => matched.has(d) && norm(d.textContent ?? "") === norm(text)))
            continue;
        add(el, el.getBoundingClientRect(), candidates);
        matched.add(el);
    }
    const attrs = ["aria-label", "placeholder", "title", "alt", "aria-description"];
    for (const el of document.body.querySelectorAll(attrs.map((a) => `[${a}]`).join(","))) {
        for (const attr of attrs) {
            const value = el.getAttribute(attr);
            if (value) add(el, el.getBoundingClientRect(), find(value));
        }
    }
    return tags;
}
