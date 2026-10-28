import type { Page } from "@playwright/test";

/** One place Tab stopped, as the walk saw it. */
export interface Stop {
    /** Stable for the life of the element; `body` when nothing has focus. */
    id: string;
    label: string;
    /** The landmark the stop sits in, in the order the shell lays them out. */
    region: string;
    /** Why the stop shows no focus mark, or null when it shows one. */
    unmarked: string | null;
    /** Whether the stop has a size and lies in the window once focused. */
    onScreen: boolean;
}

export interface Walk {
    stops: Stop[];
    /** Elements that take Tab, are shown and were never reached. */
    missed: string[];
    /** Elements with a positive `tabindex`, which jump the order. */
    jumps: string[];
    /** Whether the walk came back round to its first stop. */
    closed: boolean;
    /** Whether the lap went with Shift+Tab, so its stops run from the end of the page to the start. */
    backward: boolean;
}

interface KwWindow {
    __kw?: {
        scan(): void;
        stop(): Stop;
        missed(seen: string[], within?: string): string[];
        jumps(): string[];
    };
}

/** Landmarks in layout order. A stop outside all of them reports "other". */
export const REGIONS = ["titlebar", "sidebar", "main", "statusbar"] as const;

function install() {
    const host = window as unknown as KwWindow;
    if (host.__kw) return;
    let next = 0;
    const unfocused = new Map<string, string[]>();
    // A control that turns up mid-lap, like a notice that loads late, may land behind the walk; only those that
    // were there when it started count as missed.
    const present = new Set<string>();

    const idOf = (element: Element) => {
        if (!element.hasAttribute("data-kw")) element.setAttribute("data-kw", String(next++));
        return element.getAttribute("data-kw")!;
    };
    const label = (element: Element) => {
        const name =
            element.getAttribute("aria-label") ??
            element.getAttribute("title") ??
            element.textContent?.replace(/\s+/g, " ").trim().slice(0, 40) ??
            "";
        const role = element.getAttribute("role") ?? element.tagName.toLowerCase();
        return `${role} "${name}" [${element.getAttribute("data-kw") ?? "?"}]`;
    };
    const region = (element: Element) => {
        if (element.closest("[role=dialog], [role=alertdialog]")) return "dialog";
        if (element.closest("main")) return "main";
        if (element.closest("header")) return "titlebar";
        if (element.closest("aside")) return "sidebar";
        if (element.closest("footer")) return "statusbar";
        return "other";
    };
    const alpha = (colour: string) => {
        if (colour === "transparent") return 0;
        const match = /(?:rgba\([^)]*,\s*|\/\s*)([\d.]+)(%?)\s*\)/.exec(colour);
        if (!match) return 1;
        return parseFloat(match[1]!) / (match[2] ? 100 : 1);
    };
    // The outline and every box shadow with a spread: what a focus ring is drawn with here. A control may draw
    // its ring on a child, as the slider does on its gem, or on the row around it, as a build row does. The
    // nearest ancestors come last, and count only where they change on focus.
    const ANCESTORS = 4;
    const rings = (element: Element) => {
        const ancestors: Element[] = [];
        for (let up = element.parentElement; up && up !== document.body && ancestors.length < ANCESTORS;) {
            ancestors.push(up);
            up = up.parentElement;
        }
        return [element, ...element.children, ...ancestors].map((part) => {
            const style = getComputedStyle(part);
            const marks: string[] = [];
            if (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 && alpha(style.outlineColor) > 0) {
                marks.push(`outline ${style.outlineWidth} ${style.outlineColor} ${style.outlineOffset}`);
            }
            for (const shadow of style.boxShadow.split(/,(?![^(]*\))/)) {
                const colour = /(rgba?|oklch|oklab|lab|lch|color)\([^)]*\)/.exec(shadow)?.[0] ?? "";
                const lengths = shadow.replace(colour, "").match(/-?[\d.]+px/g) ?? [];
                if (lengths.length === 4 && parseFloat(lengths[3]!) > 0 && alpha(colour || "black") > 0) {
                    marks.push(`shadow ${shadow.trim()}`);
                }
            }
            return marks.join(" ");
        });
    };

    const tabbable = () =>
        [
            ...document.querySelectorAll<HTMLElement>(
                "a[href], button, input, select, textarea, summary, [tabindex], [contenteditable=true]",
            ),
        ].filter((element) => {
            if (element.tabIndex < 0 || (element as HTMLButtonElement).disabled) return false;
            if (element instanceof HTMLInputElement && element.type === "hidden") return false;
            if (element.closest("[inert], [aria-hidden=true]")) return false;
            if (!element.checkVisibility({ visibilityProperty: true })) return false;
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.height > 0;
        });

    host.__kw = {
        /** Remembers how every tabbable element looks without focus. */
        scan() {
            for (const element of tabbable()) {
                const id = idOf(element);
                present.add(id);
                if (element === document.activeElement || unfocused.has(id)) continue;
                unfocused.set(id, rings(element));
            }
        },
        stop() {
            const element = document.activeElement;
            if (!element || element === document.body || element === document.documentElement) {
                return {
                    id: "body",
                    label: "body",
                    region: "other",
                    unmarked: "focus is on the body",
                    onScreen: false,
                };
            }
            const id = idOf(element);
            const now = rings(element);
            const before = unfocused.get(id);
            const own = now.slice(0, 1 + element.children.length);
            const changed = before ? now.some((ring, i) => ring !== "" && ring !== before[i]) : own.some(Boolean);
            let unmarked: string | null = null;
            if (!element.matches(":focus-visible")) unmarked = "not :focus-visible";
            else if (!now.some(Boolean)) unmarked = "no outline or ring";
            else if (!changed) unmarked = "no outline or ring that is not there unfocused";
            const box = element.getBoundingClientRect();
            const onScreen =
                box.width > 0 &&
                box.height > 0 &&
                box.bottom > 0 &&
                box.right > 0 &&
                box.top < innerHeight &&
                box.left < innerWidth;
            return { id, label: label(element), region: region(element), unmarked, onScreen };
        },
        missed(seen, within) {
            const reached = new Set(seen);
            const root = within ? document.querySelector(within) : null;
            return tabbable()
                .filter((element) => present.has(idOf(element)) && !reached.has(idOf(element)))
                .filter((element) => !root || root.contains(element))
                .map(label);
        },
        jumps() {
            return [...document.querySelectorAll<HTMLElement>("[tabindex]")]
                .filter((element) => element.tabIndex > 0)
                .map(label);
        },
    };
}

async function at(page: Page): Promise<Stop> {
    return page.evaluate(() => (window as unknown as KwWindow).__kw!.stop());
}

/**
 * Presses Tab until focus comes back round to the first stop, recording every stop on the way. The browser's
 * own UI sits between the last stop and the first, which a page sees as focus on the body once per lap.
 * `within` narrows the "never reached" check to one part of the page, such as an open dialog.
 */
export async function walk(
    page: Page,
    { key = "Tab", max = 800, within }: { key?: string; max?: number; within?: string } = {},
): Promise<Walk> {
    await page.evaluate(install);
    await page.evaluate(() => (window as unknown as KwWindow).__kw!.scan());
    const stops: Stop[] = [];
    let closed = false;
    for (let presses = 0; presses < max; presses++) {
        await page.keyboard.press(key);
        const stop = await at(page);
        const first = stops.find((s) => s.id !== "body");
        if (first && stop.id === first.id) {
            closed = true;
            break;
        }
        stops.push(stop);
    }
    const seen = stops.map((stop) => stop.id);
    const missed = await page.evaluate(
        ([ids, root]) => (window as unknown as KwWindow).__kw!.missed(ids as string[], root as string | undefined),
        [seen, within] as const,
    );
    const jumps = await page.evaluate(() => (window as unknown as KwWindow).__kw!.jumps());
    return { stops, missed, jumps, closed, backward: key.startsWith("Shift") };
}

/** The stops that are not the browser's wrap-around. */
export const real = (stops: Stop[]): Stop[] => stops.filter((stop) => stop.id !== "body");

/** Problems with one lap of Tab, one line each; empty when the lap is clean. */
export function problemsOf(walk: Walk): string[] {
    const problems: string[] = [];
    if (!walk.closed) problems.push(`Tab never came back round to the first stop (a trap, or over the limit)`);
    // A lap that starts on a stop leaves the page first, so a leading body is that wrap, not a drop.
    const start = walk.stops.findIndex((stop) => stop.id !== "body");
    const bodies = walk.stops.slice(Math.max(start, 0)).filter((stop) => stop.id === "body").length;
    if (bodies > 1) problems.push(`focus fell to the body ${bodies} times in one lap`);
    const stops = real(walk.stops);
    // A page that puts focus somewhere first starts the lap midway; the wrap marks where the page begins.
    const wrap = walk.stops.indexOf(walk.stops.find((stop, i) => i > start && stop.id === "body")!);
    const lap = wrap > 0 ? real([...walk.stops.slice(wrap), ...walk.stops.slice(0, wrap)]) : stops;
    let inOrder = walk.backward ? [...lap].reverse() : lap;
    const rank = (stop: Stop) => REGIONS.indexOf(stop.region as (typeof REGIONS)[number]);
    // Chrome sometimes takes Shift+Tab off the first control straight to the last, never through the body. A lap
    // in order then steps back to an earlier landmark exactly once, at the wrap, so the page begins there.
    if (wrap <= 0) {
        const ranked = inOrder.filter((stop) => rank(stop) >= 0);
        const drop = ranked.findIndex((stop, i) => i > 0 && rank(stop) < rank(ranked[i - 1]!));
        if (drop > 0 && rank(ranked[0]!) >= rank(ranked.at(-1)!)) {
            const at = inOrder.indexOf(ranked[drop]!);
            inOrder = [...inOrder.slice(at), ...inOrder.slice(0, at)];
        }
    }
    const seen = new Set<string>();
    for (const stop of stops) {
        if (seen.has(stop.id)) problems.push(`${stop.label} is reached twice in one lap`);
        seen.add(stop.id);
        if (stop.unmarked) problems.push(`${stop.label} in ${stop.region}: ${stop.unmarked}`);
        if (!stop.onScreen) problems.push(`${stop.label} in ${stop.region}: off screen or zero size when focused`);
    }
    const order = inOrder.map(rank);
    for (let i = 1; i < order.length; i++) {
        if (order[i]! >= 0 && order[i - 1]! >= 0 && order[i]! < order[i - 1]!) {
            const [now, before] = [inOrder[i]!, inOrder[i - 1]!];
            problems.push(`${now.label} in ${now.region} comes after ${before.label} in ${before.region}`);
        }
    }
    for (const label of walk.missed) problems.push(`${label} takes Tab but was never reached`);
    for (const label of walk.jumps) problems.push(`${label} has a positive tabindex`);
    return problems;
}
