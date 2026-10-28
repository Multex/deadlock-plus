import { test as base, expect, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { cacheDir, createGameDataCache } from "./support/game-data-cache";
import { WINDOWS_UA } from "./support/platform";
import { ROUTE_CALLS } from "./support/route-calls";
import { ALLOWED_HOSTS } from "./support/test";

// With the OS asking for reduced motion, nothing on screen keeps moving once a page has drawn: no CSS animation
// or transition, no Web Animation, no playing video and no requestAnimationFrame loop. Unlike the other specs
// this one does not inject a stylesheet that stills the page; the app's own handling is what is under test.

const THEMES: string[] = JSON.parse(
    readFileSync(new URL("../../../packages/ui/src/themes.json", import.meta.url), "utf8"),
).themes.map((theme: { id: string }) => theme.id);

/** How long the page is watched once it has drawn. */
const WATCH_MS = 1200;
/** A loop runs about 60 frames a second; a few one-off frames (layout reads, focus) are not motion. */
const MAX_FRAMES = 6;
/** An animation over sooner than one frame jumps to its end without drawing anything in between. */
const FRAME_MS = 1000 / 60;

const gameData = createGameDataCache({
    dir: cacheDir(
        fileURLToPath(new URL("./.cache/game-data/", import.meta.url)),
        readFileSync(new URL("./support/game-data.version", import.meta.url), "utf8"),
    ),
    offline: process.env.E2E_OFFLINE === "1",
});

function seed({ scenario, theme }: { scenario: string; theme: string | null }) {
    let hook: unknown = { scenario };
    Object.defineProperty(window, "__DEADLOCK_PLUS_DEMO__", {
        configurable: true,
        get: () => hook,
        set(value) {
            hook = value;
            if (theme) value?.handle?.invoke("kv_set", { store: "app-settings", key: "theme", value: theme });
        },
    });
    const w = window as unknown as { __frames: number };
    w.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    // Callbacks run in the same frame share its timestamp, so several parts measuring at once count as one frame.
    let frame = -1;
    window.requestAnimationFrame = (callback) =>
        raf((now) => {
            if (now !== frame) {
                frame = now;
                w.__frames++;
            }
            callback(now);
        });
}

async function openPage(browser: Browser, baseURL: string, scenario: string, at: string, theme: string | null) {
    const context = await browser.newContext({
        baseURL,
        viewport: { width: 1480, height: 900 },
        locale: "en-US",
        timezoneId: "UTC",
        colorScheme: "dark",
        reducedMotion: "reduce",
        userAgent: WINDOWS_UA,
    });
    await context.addInitScript(seed, { scenario, theme });
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
    await page.goto(at);
    await settle(page);
    if (theme) await expect(page.locator(":root")).toHaveAttribute("data-theme", theme);
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

/** Everything still moving across the watch window, described well enough to find in the source. */
async function motion(page: Page): Promise<string[]> {
    return page.evaluate(
        async ({ watchMs, maxFrames, frameMs }) => {
            const name = (el: Element | null) => {
                if (!el) return "?";
                const cls =
                    typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 4).join(".") : "";
                return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls ? `.${cls}` : ""}`;
            };
            const describe = (a: Animation) => {
                const target = (a.effect as KeyframeEffect | null)?.target ?? null;
                const kind =
                    a instanceof CSSAnimation
                        ? `animation ${a.animationName}`
                        : a instanceof CSSTransition
                          ? `transition ${a.transitionProperty}`
                          : "web animation";
                return `${kind} on ${name(target)}`;
            };
            // Reduced motion cuts every CSS animation to a single 0.01ms run, but one that starts during the watch,
            // like a spinner mounting, still reads as running until the browser draws its first frame.
            const moves = (a: Animation) => Number(a.effect?.getComputedTiming().activeDuration) >= frameMs;
            const found = new Set<string>();
            const w = window as unknown as { __frames: number };
            const startFrames = w.__frames;
            const until = performance.now() + watchMs;
            while (performance.now() < until) {
                for (const a of document.getAnimations())
                    if (a.playState === "running" && moves(a)) found.add(describe(a));
                for (const v of document.querySelectorAll("video"))
                    if (!v.paused) found.add(`playing video ${name(v)}`);
                await new Promise((r) => setTimeout(r, 150));
            }
            const frames = w.__frames - startFrames;
            if (frames > maxFrames) found.add(`${frames} animation frames in ${watchMs}ms`);
            return [...found];
        },
        { watchMs: WATCH_MS, maxFrames: MAX_FRAMES, frameMs: FRAME_MS },
    );
}

const test = base.extend<{ open: (scenario: string, at: string, theme?: string) => Promise<Page> }>({
    open: async ({ browser, baseURL }, use) => {
        const pages: Page[] = [];
        await use(async (scenario, at, theme) => {
            const page = await openPage(browser, baseURL!, scenario, at, theme ?? null);
            pages.push(page);
            return page;
        });
        for (const page of pages) await page.context().close();
    },
});

test.describe.configure({ timeout: 60_000 });

test("the app marks the root as reduced motion when the OS asks for it", async ({ open }) => {
    const page = await open("default", "/");
    await expect(page.locator(":root")).toHaveAttribute("data-reduced-motion", "");
});

for (const r of ROUTE_CALLS) {
    test(`nothing moves on ${r.name}`, async ({ open }) => {
        const page = await open(r.scenario, r.path);
        expect(await motion(page)).toEqual([]);
    });
}

// Theme decor moves on its own; home is enough to bring every theme's decor up.
for (const theme of THEMES) {
    test(`nothing moves on home under the ${theme} theme`, async ({ open }) => {
        const page = await open("default", "/", theme);
        expect(await motion(page)).toEqual([]);
    });
}

const route = (name: string) => ROUTE_CALLS.find((r) => r.name === name)!;

test("nothing moves once a Dispatch copy is picked up", async ({ open }) => {
    const r = route("dispatch");
    const page = await open(r.scenario, r.path);
    await page.locator("[data-copy]:not([aria-disabled=true])").first().click();
    await expect(page.getByRole("button", { name: "Export" })).toBeEnabled();
    expect(await motion(page)).toEqual([]);
});

// A printed monthly has a video, the sheet opens on it, and an idle video preview plays by itself.
test("the share sheet's video preview holds still", async ({ open }) => {
    const r = route("dispatch");
    const page = await open(r.scenario, r.path);
    await page
        .getByRole("button", { name: /^Monthly, .*, New$/ })
        .first()
        .click();
    await expect(page.getByRole("button", { name: "Export" })).toBeEnabled();
    await page.getByRole("button", { name: "Export" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const canvases = page.getByRole("dialog").locator("canvas");
    await expect(canvases.first()).toBeVisible();
    await expect.poll(() => canvases.evaluateAll((all) => all.every((c) => c.dataset.frame === "ready"))).toBe(true);
    expect(await motion(page)).toEqual([]);
});

test("nothing moves with the command palette open", async ({ open }) => {
    const page = await open("default", "/");
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Quick search" })).toBeVisible();
    expect(await motion(page)).toEqual([]);
});

test.describe("the watch", () => {
    test("several parts measuring in the same frame are one frame, not a loop", async ({ open }) => {
        const page = await open("default", "/");
        await page.evaluate(() =>
            setTimeout(() => {
                for (let i = 0; i < 8; i++) requestAnimationFrame(() => {});
            }, 300),
        );
        expect(await motion(page)).toEqual([]);
    });

    test("a spinner that mounts while the page is watched is not motion", async ({ open }) => {
        const page = await open("default", "/");
        await page.evaluate(() => {
            let mounted = 0;
            const timer = setInterval(() => {
                const spinner = document.createElement("div");
                spinner.className = "animate-spin size-4";
                document.querySelector("main")!.append(spinner);
                if (++mounted === 10) clearInterval(timer);
            }, 97);
        });
        expect(await motion(page)).toEqual([]);
    });

    test("an animation and a frame loop that ignore reduced motion are both caught", async ({ open }) => {
        const page = await open("default", "/");
        await page.evaluate(() => {
            const el = document.createElement("div");
            document.querySelector("main")!.append(el);
            el.animate([{ opacity: 1 }, { opacity: 0.5 }], { duration: 2000, iterations: Infinity });
            const loop = () => requestAnimationFrame(loop);
            loop();
        });
        expect(await motion(page)).toEqual(["web animation on div", expect.stringMatching(/animation frames in/)]);
    });
});
