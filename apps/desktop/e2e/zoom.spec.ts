import { test as base, expect, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { cacheDir, createGameDataCache } from "./support/game-data-cache";
import { WINDOWS_UA } from "./support/platform";
import { ROUTE_CALLS, type RouteCalls } from "./support/route-calls";
import { ALLOWED_HOSTS } from "./support/test";

// Every route and open state stays usable at the window's minimum size and at 200% zoom (WCAG 1.4.4, 1.4.10).
// 200% zoom is emulated as half the minimum window in CSS pixels at a device scale of 1: that is what browser
// zoom does to a page (the CSS viewport halves, media queries and vh/vw follow), where CSS `zoom` on the root
// would leave the viewport and media queries at full size and test a layout no user ever sees.

const SIZES = [
    { name: "minimum window", width: 1480, height: 720 },
    { name: "200% zoom", width: 740, height: 360 },
];

/**
 * Regions that may scroll in two directions instead of reflowing, as WCAG 1.4.10 allows for content that needs
 * a two-dimensional layout to be understood.
 */
const SCROLL_2D: { selector: string; reason: string }[] = [
    { selector: "table, [role=table], [role=grid]", reason: "data tables keep their columns" },
    {
        selector: ':has(> [data-testid="editor-bar"])',
        reason: "the build editor is a canvas workspace with its own toolbars and its sequence track; it keeps its size",
    },
];

const STILL = `*, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
}`;

const gameData = createGameDataCache({
    dir: cacheDir(
        fileURLToPath(new URL("./.cache/game-data/", import.meta.url)),
        readFileSync(new URL("./support/game-data.version", import.meta.url), "utf8"),
    ),
    offline: process.env.E2E_OFFLINE === "1",
});

type DemoHook = { scenario?: string; handle?: { set(command: string, handler: () => unknown): void } };

function seed({ scenario, css, changelog }: { scenario: string; css: string; changelog?: string }) {
    let hook: DemoHook | undefined = { scenario };
    if (changelog === undefined) {
        (window as unknown as Record<string, unknown>).__DEADLOCK_PLUS_DEMO__ = hook;
    } else {
        Object.defineProperty(window, "__DEADLOCK_PLUS_DEMO__", {
            configurable: true,
            get: () => hook,
            // The app assigns the running demo here once, right after it starts and before any page code runs.
            set(next: DemoHook | undefined) {
                hook = next;
                next?.handle?.set("changelog", () => changelog);
            },
        });
    }
    document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
    });
}

async function openPage(
    browser: Browser,
    baseURL: string,
    size: (typeof SIZES)[number],
    r: RouteCalls,
    changelog?: string,
) {
    const context = await browser.newContext({
        baseURL,
        viewport: { width: size.width, height: size.height },
        deviceScaleFactor: 1,
        locale: "en-US",
        timezoneId: "UTC",
        colorScheme: "dark",
        reducedMotion: "reduce",
        userAgent: WINDOWS_UA,
    });
    await context.addInitScript(seed, { scenario: r.scenario, css: STILL, changelog });
    const own = new URL(baseURL).host;
    await context.route("**/*", async (request) => {
        const url = new URL(request.request().url());
        if (url.protocol === "data:" || url.protocol === "blob:" || url.host === own) return request.continue();
        if (!ALLOWED_HOSTS.includes(url.host) || request.request().method() !== "GET") {
            return request.abort("blockedbyclient");
        }
        try {
            const entry = await gameData.get(url.href, async () => {
                const response = await request.fetch();
                return { status: response.status(), headers: response.headers(), body: await response.body() };
            });
            const headers = { ...entry.headers, "access-control-allow-origin": "*" };
            return await request.fulfill({ status: entry.status, headers, body: entry.body });
        } catch {
            return request.abort("failed");
        }
    });
    const page = await context.newPage();
    await page.goto(r.path);
    await settle(page);
    return page;
}

async function settle(page: Page) {
    await page.waitForLoadState("networkidle").catch(() => {});
    await page
        .waitForFunction(
            async () => {
                if (!document.querySelector("main")?.childElementCount) return false;
                await document.fonts.ready;
                return !document.querySelector(".animate-pulse");
            },
            undefined,
            { timeout: 10_000 },
        )
        .catch(() => {});
}

/**
 * Everything in `scope` a user cannot get to: controls clipped with no way to scroll them in or covered by
 * something else when scrolled to either edge, scroll containers that scroll sideways where text should reflow,
 * and dialogs or popups larger than the window.
 */
async function problems(page: Page, scope: string): Promise<string[]> {
    return page.evaluate(
        ({ scope, scroll2d }) => {
            const found: string[] = [];
            const name = (el: Element) => {
                const label =
                    el.getAttribute("aria-label") ?? (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
                const cls =
                    typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
                return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""} "${label}"`;
            };
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const inRegion = (el: Element) => scroll2d.some((s) => el.closest(s));
            // A scroller may scroll sideways when everything sticking out of it sits in a two-dimensional region.
            const allowed2d = (sc: Element) => {
                if (inRegion(sc)) return true;
                const edge = sc.getBoundingClientRect().left + sc.clientLeft + sc.clientWidth;
                for (const d of sc.querySelectorAll("*")) {
                    const r = d.getBoundingClientRect();
                    if (r.width === 0 || r.right <= edge + 1 || inRegion(d)) continue;
                    let clipped = false;
                    for (let a = d.parentElement; a && a !== sc; a = a.parentElement) {
                        if (getComputedStyle(a).overflowX !== "visible") clipped = true;
                    }
                    if (!clipped) return false;
                }
                return true;
            };

            if (document.documentElement.scrollWidth > vw + 1) {
                found.push(`the page scrolls sideways: ${document.documentElement.scrollWidth}px in ${vw}px`);
            }

            // The newest of several open dialogs is the one on top, and the only one a user can reach.
            const roots = [...document.querySelectorAll(scope)].slice(-1);
            for (const root of roots) {
                for (const el of [root, ...root.querySelectorAll("*")]) {
                    const cs = getComputedStyle(el);
                    if (
                        (cs.overflowX === "auto" || cs.overflowX === "scroll") &&
                        el.scrollWidth > el.clientWidth + 1 &&
                        el.clientWidth > 0 &&
                        !allowed2d(el)
                    ) {
                        found.push(`${name(el)} scrolls sideways: ${el.scrollWidth}px in ${el.clientWidth}px`);
                    }
                }
                if (root.matches("[role=dialog], [role=alertdialog], [role=listbox], [role=menu]")) {
                    const r = root.getBoundingClientRect();
                    if (r.top < -1 || r.left < -1 || r.bottom > vh + 1 || r.right > vw + 1) {
                        found.push(
                            `${name(root)} does not fit the window: ${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)}`,
                        );
                    }
                }
            }

            const CONTROLS =
                "a[href], button, [role=button], [role=link], [role=tab], [role=combobox], [role=switch], [role=checkbox], [role=radio], [role=menuitem], [role=option], input:not([type=hidden]), select, textarea, summary";
            const scrollers = (el: Element) => {
                const list: Element[] = [];
                for (let a = el.parentElement; a; a = a.parentElement) {
                    const s = getComputedStyle(a);
                    if (/(auto|scroll)/.test(s.overflowX + s.overflowY)) list.push(a);
                }
                list.push(document.scrollingElement ?? document.documentElement);
                return list;
            };
            const visibleRect = (el: Element) => {
                const r = el.getBoundingClientRect();
                let [l, t, rr, b] = [r.left, r.top, r.right, r.bottom];
                let [roomW, roomH] = [vw, vh];
                for (let a = el.parentElement; a; a = a.parentElement) {
                    const s = getComputedStyle(a);
                    if (s.overflowX !== "visible" || s.overflowY !== "visible") {
                        const ar = a.getBoundingClientRect();
                        roomW = Math.min(roomW, a.clientWidth || ar.width);
                        roomH = Math.min(roomH, a.clientHeight || ar.height);
                        l = Math.max(l, ar.left);
                        t = Math.max(t, ar.top);
                        rr = Math.min(rr, ar.right);
                        b = Math.min(b, ar.bottom);
                    }
                    if (s.position === "fixed") break;
                }
                l = Math.max(l, 0);
                t = Math.max(t, 0);
                rr = Math.min(rr, vw);
                b = Math.min(b, vh);
                return { l, t, w: rr - l, h: b - t, full: r, roomW, roomH };
            };
            // Controls that show on hover or focus of their row cannot be hit until then; their place still counts.
            const revealedLater = (el: Element) => {
                if (getComputedStyle(el).pointerEvents === "none") return true;
                for (let a: Element | null = el; a; a = a.parentElement) {
                    if (getComputedStyle(a).opacity === "0") return true;
                }
                return false;
            };
            // `scrollIntoView` also scrolls `overflow: hidden` boxes, which no wheel or scrollbar can, so those
            // are put back to where the page left them.
            const scrollTo = (el: Element) => {
                const fixed: [Element, number, number][] = [];
                for (let a = el.parentElement; a; a = a.parentElement) {
                    const s = getComputedStyle(a);
                    const x = /(auto|scroll)/.test(s.overflowX);
                    const y = /(auto|scroll)/.test(s.overflowY);
                    if (!x || !y) fixed.push([a, x ? -1 : a.scrollLeft, y ? -1 : a.scrollTop]);
                }
                el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
                for (const [a, left, top] of fixed) {
                    if (left >= 0) a.scrollLeft = left;
                    if (top >= 0) a.scrollTop = top;
                }
            };
            const hits = (el: Element, v: { l: number; t: number; w: number; h: number }) => {
                const points: [number, number][] = [];
                for (const fx of [0.5, 0.2, 0.8]) {
                    for (const fy of [0.5, 0.2, 0.8]) points.push([v.l + v.w * fx, v.t + v.h * fy]);
                }
                // A tab or label that sticks out of its control is part of what the user clicks.
                for (const child of el.querySelectorAll("*")) {
                    const r = child.getBoundingClientRect();
                    const x = r.left + r.width / 2;
                    const y = r.top + r.height / 2;
                    if (r.width >= 4 && r.height >= 4 && x >= 0 && y >= 0 && x <= vw && y <= vh) points.push([x, y]);
                }
                let last: Element | null = null;
                for (const [x, y] of points) {
                    const hit = document.elementFromPoint(x, y);
                    if (!hit || el.contains(hit) || hit.contains(el) || (hit as HTMLLabelElement).control === el) {
                        return null;
                    }
                    last ??= hit;
                }
                return last;
            };
            const reachable = (el: Element) => {
                scrollTo(el);
                const v = visibleRect(el);
                if (v.w < 1 || v.h < 1) return "clipped with no way to scroll to it";
                // A control larger than the box that clips it only needs to fill that box.
                const needW = Math.min(v.full.width, v.roomW);
                const needH = Math.min(v.full.height, v.roomH);
                if (v.w < needW - 2 || v.h < needH - 2) {
                    return `only ${Math.round(v.w)}x${Math.round(v.h)} of ${Math.round(v.full.width)}x${Math.round(v.full.height)} can be shown`;
                }
                if (revealedLater(el)) return null;
                const hit = hits(el, v);
                if (!hit) return null;
                // Marks plotted at a data position (a map, a timeline) overlap when the data does, at any size.
                const plotted = el instanceof HTMLElement && (el.style.left || el.style.top);
                if (plotted && el.parentElement?.contains(hit)) return null;
                return `covered by ${name(hit)}`;
            };

            for (const root of roots) {
                for (const el of root.querySelectorAll(CONTROLS)) {
                    if (el.closest("[aria-hidden=true], [inert]")) continue;
                    if (el.getClientRects().length === 0) continue;
                    const shut = el.closest("details:not([open])");
                    if (shut && el.parentElement !== shut) continue;
                    const cs = getComputedStyle(el);
                    if (cs.visibility !== "visible" || cs.opacity === "0") continue;
                    const r = el.getBoundingClientRect();
                    // A screen-reader-only control is a 1px square on purpose.
                    if (r.width <= 1 && r.height <= 1) continue;
                    if (r.width < 1 || r.height < 1) {
                        found.push(`${name(el)} has no size: ${r.width}x${r.height}`);
                        continue;
                    }
                    const chain = scrollers(el);
                    let problem: string | null = null;
                    for (const end of ["start", "end"] as const) {
                        for (const s of chain) {
                            s.scrollTop = end === "start" ? 0 : s.scrollHeight;
                            s.scrollLeft = end === "start" ? 0 : s.scrollWidth;
                        }
                        problem = reachable(el);
                        if (problem) break;
                    }
                    if (problem) found.push(`${name(el)}: ${problem}`);
                }
                for (const s of [root, ...root.querySelectorAll("*")]) {
                    s.scrollTop = 0;
                    s.scrollLeft = 0;
                }
            }
            return [...new Set(found)];
        },
        { scope, scroll2d: SCROLL_2D.map((s) => s.selector) },
    );
}

const test = base.extend<{
    open: (size: (typeof SIZES)[number], r: RouteCalls, changelog?: string) => Promise<Page>;
}>({
    open: async ({ browser, baseURL }, use) => {
        const pages: Page[] = [];
        await use(async (size, r, changelog) => {
            const page = await openPage(browser, baseURL!, size, r, changelog);
            pages.push(page);
            return page;
        });
        for (const page of pages) await page.context().close();
    },
});

const route = (name: string) => ROUTE_CALLS.find((r) => r.name === name)!;

interface OpenState {
    name: string;
    route: RouteCalls;
    /** What is checked once the state is open; the page under it has its own test. */
    scope: string;
    reach(page: Page): Promise<void>;
}

const OPEN_STATES: OpenState[] = [
    {
        name: "confirm dialog",
        route: route("server-picker"),
        scope: "[role=alertdialog]",
        async reach(page) {
            await page.getByRole("button", { name: /^Unblock all/ }).click();
            await expect(page.getByRole("alertdialog")).toBeVisible();
        },
    },
    {
        name: "command palette",
        route: route("home"),
        scope: "[role=dialog]",
        async reach(page) {
            await page.keyboard.press("Control+k");
            await expect(page.getByRole("dialog", { name: "Quick search" })).toBeVisible();
        },
    },
    {
        name: "reading room",
        route: route("dispatch"),
        scope: "body",
        async reach(page) {
            await page.locator("[data-copy]:not([aria-disabled=true])").first().click();
            await expect(page.getByRole("button", { name: "Export" })).toBeEnabled();
        },
    },
    {
        name: "share sheet",
        route: route("dispatch"),
        scope: "[role=dialog]",
        async reach(page) {
            await page.locator("[data-copy]:not([aria-disabled=true])").first().click();
            await page.getByRole("button", { name: "Export" }).click();
            await expect(page.getByRole("dialog")).toBeVisible();
        },
    },
    {
        name: "paste code dialog",
        route: route("builds"),
        scope: "[role=dialog]",
        async reach(page) {
            await page.getByRole("button", { name: "Paste code" }).click();
            await expect(page.getByRole("dialog")).toBeVisible();
        },
    },
    {
        name: "select menu",
        route: route("match-history"),
        scope: "[role=listbox]",
        async reach(page) {
            await page.getByRole("combobox", { name: "Hero", exact: true }).click();
            await expect(page.getByRole("listbox")).toBeVisible();
        },
    },
];

/** Unreleased notes with more section headings than a strip of them fits in one row of a narrow window. */
const MANY_SECTIONS = [
    "# Changelog",
    "## [Unreleased]",
    "### Added",
    "- A loose addition that opens the General section.",
    ...Array.from({ length: 12 }, (_, i) => [
        `#### Feature with a longer name ${i + 1}`,
        `- The feature's opening line ${i + 1}.`,
        "- A point about it.",
    ]).flat(),
    "### Changed",
    "- A change.",
    "### Fixed",
    "#### Keyboard and screen readers",
    "- A fix.",
    "#### Small windows and zoom",
    "- Another fix.",
].join("\n\n");

/** `ZOOM_SHOTS=<dir>` keeps a picture of every page as checked, to compare a fix by eye. */
async function shoot(page: Page, size: (typeof SIZES)[number], name: string) {
    const dir = process.env.ZOOM_SHOTS;
    if (dir) await page.screenshot({ path: `${dir}/${size.width}x${size.height}-${name.replaceAll(" ", "-")}.png` });
}

test.describe.configure({ timeout: 90_000 });

for (const size of SIZES) {
    test.describe(`${size.name} (${size.width}x${size.height})`, () => {
        for (const r of ROUTE_CALLS) {
            test(r.name, async ({ open }) => {
                const page = await open(size, r);
                const found = await problems(page, "body");
                await shoot(page, size, r.name);
                expect(found).toEqual([]);
            });
        }
        test("whats-new for a release with many sections", async ({ open }) => {
            const page = await open(size, { ...route("whats-new"), path: "/whats-new?preview=9.9.9" }, MANY_SECTIONS);
            await expect(page.getByRole("navigation", { name: "In this update" }).getByRole("button")).toHaveCount(16);
            const found = await problems(page, "body");
            await shoot(page, size, "whats-new-many-sections");
            expect(found).toEqual([]);
        });
        for (const state of OPEN_STATES) {
            test(`${state.route.name} with the ${state.name} open`, async ({ open }) => {
                const page = await open(size, state.route);
                await state.reach(page);
                await settle(page);
                const found = await problems(page, state.scope);
                await shoot(page, size, `${state.route.name}-${state.name}`);
                expect(found).toEqual([]);
            });
        }
    });
}
