import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Browser, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { A11Y_RAW, type PageResult } from "./support/a11y-report";
import { cacheDir, createGameDataCache } from "./support/game-data-cache";
import { WINDOWS_UA } from "./support/platform";
import { ROUTE_CALLS, type RouteCalls } from "./support/route-calls";
import { ALLOWED_HOSTS } from "./support/test";

// Runs axe on every route under every theme, since contrast differs per theme, and on a few open states.
// It records what it finds and passes; `A11Y_STRICT=1` makes any violation fail its test.

const STRICT = process.env.A11Y_STRICT === "1";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const THEMES: string[] = JSON.parse(
    readFileSync(new URL("../../../packages/ui/src/themes.json", import.meta.url), "utf8"),
).themes.map((theme: { id: string }) => theme.id);

const STILL = `*, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
}`;

const gameData = createGameDataCache({
    dir: cacheDir(
        fileURLToPath(new URL("./.cache/game-data/", import.meta.url)),
        readFileSync(new URL("./support/game-data.version", import.meta.url), "utf8"),
    ),
    offline: process.env.E2E_OFFLINE === "1",
});

/** Starts the demo on `scenario` and saves `theme` before the settings read it. */
function seed({ scenario, theme, css }: { scenario: string; theme: string; css: string }) {
    let hook: unknown = { scenario };
    Object.defineProperty(window, "__DEADLOCK_PLUS_DEMO__", {
        configurable: true,
        get: () => hook,
        set(value) {
            hook = value;
            value?.handle?.invoke("kv_set", { store: "app-settings", key: "theme", value: theme });
        },
    });
    document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
    });
}

async function openPage(browser: Browser, baseURL: string, scenario: string, theme: string, at: string) {
    const context = await browser.newContext({
        baseURL,
        viewport: { width: 1480, height: 900 },
        locale: "en-US",
        timezoneId: "UTC",
        colorScheme: "dark",
        reducedMotion: "reduce",
        userAgent: WINDOWS_UA,
    });
    await context.addInitScript(seed, { scenario, theme, css: STILL });
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
    // A theme that did not apply would check the default theme's contrast under another name.
    await expect(page.locator(":root")).toHaveAttribute("data-theme", theme);
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

async function check(page: Page, result: Omit<PageResult, "violations">, include?: string) {
    let builder = new AxeBuilder({ page }).withTags(TAGS);
    if (include) builder = builder.include(include);
    const { violations } = await builder.analyze();
    const record: PageResult = {
        ...result,
        violations: violations.map((v) => ({
            id: v.id,
            impact: v.impact ?? null,
            help: v.help,
            helpUrl: v.helpUrl,
            nodes: v.nodes.map((node) => ({ target: node.target.join(" "), html: node.html.slice(0, 200) })),
        })),
    };
    const file = `${result.route}--${result.state}--${result.theme}.json`.replace(/[^\w.-]+/g, "_");
    writeFileSync(path.join(A11Y_RAW, file), JSON.stringify(record));
    if (STRICT) {
        expect(record.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
    }
}

const test = base.extend<{ open: (scenario: string, theme: string, at: string) => Promise<Page> }>({
    open: async ({ browser, baseURL }, use) => {
        const pages: Page[] = [];
        await use(async (scenario, theme, at) => {
            const page = await openPage(browser, baseURL!, scenario, theme, at);
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
    /** The open part alone is checked; the page under it has its own test. */
    include?: string;
    reach(page: Page): Promise<void>;
}

const OPEN_STATES: OpenState[] = [
    {
        name: "confirm-dialog",
        route: route("server-picker"),
        include: "[role=alertdialog]",
        async reach(page) {
            await page.getByRole("button", { name: /^Unblock all/ }).click();
            await expect(page.getByRole("alertdialog")).toBeVisible();
        },
    },
    {
        name: "command-palette",
        route: route("home"),
        include: "[role=dialog]",
        async reach(page) {
            await page.keyboard.press("Control+k");
            await expect(page.getByRole("dialog", { name: "Quick search" })).toBeVisible();
        },
    },
    {
        name: "reading-room",
        route: route("dispatch"),
        async reach(page) {
            await page.locator("[data-copy]:not([aria-disabled=true])").first().click();
            await expect(page.getByRole("button", { name: "Export" })).toBeEnabled();
        },
    },
    {
        name: "share-sheet",
        route: route("dispatch"),
        include: "[role=dialog]",
        async reach(page) {
            await page.locator("[data-copy]:not([aria-disabled=true])").first().click();
            await page.getByRole("button", { name: "Export" }).click();
            await expect(page.getByRole("dialog")).toBeVisible();
        },
    },
];

// axe takes seconds on the build pages and three workers share the machine, so the default 30s ran out.
test.describe.configure({ timeout: 90_000 });

for (const theme of THEMES) {
    test.describe(theme, () => {
        for (const r of ROUTE_CALLS) {
            test(r.name, async ({ open }) => {
                const page = await open(r.scenario, theme, r.path);
                await check(page, { route: r.name, path: r.path, theme, state: "page" });
            });
        }
        for (const state of OPEN_STATES) {
            test(`${state.route.name} with the ${state.name} open`, async ({ open }) => {
                const page = await open(state.route.scenario, theme, state.route.path);
                await state.reach(page);
                await settle(page);
                await check(
                    page,
                    { route: state.route.name, path: state.route.path, theme, state: state.name },
                    state.include,
                );
            });
        }
    });
}
