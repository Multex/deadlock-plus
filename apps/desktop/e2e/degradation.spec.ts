import { test as base, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { cacheDir, createGameDataCache } from "./support/game-data-cache";
import { WINDOWS_UA } from "./support/platform";
import { ROUTE_CALLS, SHELL_API, SHELL_COMMANDS, type RouteCalls } from "./support/route-calls";
import { isDynamic, matches, routePatterns, settingsCategories } from "./support/routes";
import { ALLOWED_HOSTS } from "./support/test";

// One fault per case, applied while a route loads. A case passes when the fault stays in its own region:
// no uncaught error, no crash report, the sidebar still navigates and no spinner is left behind.
// `E2E_DEGRADATION_EXTRA=1` adds the `@shapes` (command answers null) and `@art` (all art missing) cases.

// The demo's fault shape (`packages/demo/src/faults.ts`), restated: importing it pulls the demo's sources into
// this folder's type check, which targets an older library.
type Fault =
    | { command: string; mode: "throw" | "null" | "hang" | "garbage" }
    | { api: string; mode: "503" | "429" | "drop" | "garbage" | "slow" }
    | { art: "missing" };

const EXTRA = process.env.E2E_DEGRADATION_EXTRA === "1";
// Routes faulted with the shell's own commands and API paths; every other route reuses the same shell.
const SHELL_ROUTES = ["home", "settings-about"];
const ART_ROUTES = [
    "home",
    "stats",
    "match-history",
    "match-detail",
    "dispatch",
    "live",
    "builds",
    "build-view-public",
    "build-edit",
    "whats-new",
];
// Pages that are no route of the main window.
const NOT_SWEPT = ["/overlay"];
const SETTLE_MS = 3000;

// Known offenders: the exact failure seen. The fix that cures one removes its entry.
const ABILITY_BAR_SPINS =
    "1 spinner left: the ability bar skeleton (bar-frame.svelte) keeps aria-busy when item data fails (audit: Builds > Ability order, spinner forever)";
const KNOWN: Record<string, string> = {
    "builds api:/v1/assets/items:503": ABILITY_BAR_SPINS,
    "builds-mine api:/v1/assets/items:503": ABILITY_BAR_SPINS,
    "builds-mine api::503": ABILITY_BAR_SPINS,
    "builds-mine api::429": ABILITY_BAR_SPINS,
    "builds-mine api::drop": ABILITY_BAR_SPINS,
    "build-view-local api:/v1/assets/items:503": ABILITY_BAR_SPINS,
    "build-view-local api::503": ABILITY_BAR_SPINS,
    "build-view-local api::429": ABILITY_BAR_SPINS,
    "build-view-local api::drop": ABILITY_BAR_SPINS,
    "build-view-public api:/v1/assets/items:503": ABILITY_BAR_SPINS,
    "live command:start_network_monitor:throw":
        "uncaught error: Object, unhandled rejection common.internal (audit: Live > Monitor, rejection, nothing visible)",
};

const gameData = createGameDataCache({
    dir: cacheDir(
        fileURLToPath(new URL("./.cache/game-data/", import.meta.url)),
        readFileSync(new URL("./support/game-data.version", import.meta.url), "utf8"),
    ),
    offline: process.env.E2E_OFFLINE === "1",
});

interface Observation {
    calls: string[];
    api: string[];
    rejections: string[];
    regions: { name: string; state: string | null }[];
    mainChildren: number;
    spinners: number;
    navLinks: string[];
}

/** Wraps the demo's IPC and fetch right after `startDemo`, and starts it on `faults`. */
function watch({ scenario, faults }: { scenario: string; faults: Fault[] }) {
    const w = window as unknown as Record<string, any>;
    let hook: unknown = { scenario, faults };
    const log = { calls: [] as string[], api: [] as string[], rejections: [] as string[] };
    w.__degradation = log;
    window.addEventListener("unhandledrejection", (event) => {
        const reason = event.reason;
        log.rejections.push(reason instanceof Error ? reason.message : JSON.stringify(reason));
    });
    Object.defineProperty(window, "__DEADLOCK_PLUS_DEMO__", {
        configurable: true,
        get: () => hook,
        set(value) {
            hook = value;
            const internals = w.__TAURI_INTERNALS__;
            if (!internals || internals.__degradationWrapped) return;
            internals.__degradationWrapped = true;
            const invoke = internals.invoke.bind(internals);
            internals.invoke = (command: string, args: unknown, options: unknown) => {
                log.calls.push(command);
                return invoke(command, args, options);
            };
            const fetch = window.fetch;
            window.fetch = (input, init) => {
                const url = new URL(input instanceof Request ? input.url : String(input), location.href);
                if (url.hostname === "api.deadlock-api.com") log.api.push(url.pathname);
                return fetch(input, init);
            };
        },
    });
}

async function openContext(browser: Browser, baseURL: string, route: RouteCalls, faults: Fault[]) {
    const context = await browser.newContext({
        baseURL,
        viewport: { width: 1480, height: 900 },
        locale: "en-US",
        timezoneId: "UTC",
        colorScheme: "dark",
        reducedMotion: "reduce",
        userAgent: WINDOWS_UA,
    });
    await context.addInitScript(watch, { scenario: route.scenario, faults });
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
    return context;
}

async function load(context: BrowserContext, route: RouteCalls, pageErrors: string[]): Promise<[Page, Observation]> {
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(route.path);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(SETTLE_MS);
    const observation = await page.evaluate(() => {
        const visible = (el: Element) => (el as HTMLElement).offsetWidth > 0 || el.getClientRects().length > 0;
        const log = (window as unknown as { __degradation: Pick<Observation, "calls" | "api" | "rejections"> })
            .__degradation;
        return {
            ...log,
            regions: [...document.querySelectorAll("[data-region]")].map((el) => ({
                name: el.getAttribute("data-region")!,
                state: el.getAttribute("data-region-state"),
            })),
            mainChildren: document.querySelector("main")?.childElementCount ?? 0,
            spinners: [...document.querySelectorAll("[aria-busy=true], .animate-spin")].filter(visible).length,
            navLinks: [...document.querySelectorAll("nav a[href^='/']")]
                .filter(visible)
                .map((a) => a.getAttribute("href")!),
        };
    });
    return [page, observation];
}

// The regions and sidebar of each route without a fault, measured once per worker.
const baselines = new Map<string, Promise<Observation>>();

function baseline(browser: Browser, baseURL: string, route: RouteCalls): Promise<Observation> {
    let pending = baselines.get(route.name);
    if (!pending) {
        pending = (async () => {
            const context = await openContext(browser, baseURL, route, []);
            try {
                return (await load(context, route, []))[1];
            } finally {
                await context.close();
            }
        })();
        baselines.set(route.name, pending);
    }
    return pending;
}

function describeFault(fault: Fault): string {
    if ("command" in fault) return `command:${fault.command}:${fault.mode}`;
    if ("api" in fault) return `api:${fault.api}:${fault.mode}`;
    return "art:missing";
}

/** What went wrong while `route` loaded under `faults`; empty when the fault stayed in its region. */
async function problems(browser: Browser, baseURL: string, route: RouteCalls, faults: Fault[]): Promise<string[]> {
    const before = faults.length ? await baseline(browser, baseURL, route) : undefined;
    const context = await openContext(browser, baseURL, route, faults);
    const pageErrors: string[] = [];
    try {
        const [page, seen] = await load(context, route, pageErrors);
        const found = [
            ...pageErrors.map((message) => `uncaught error: ${message}`),
            ...seen.rejections.map((reason) => `unhandled rejection: ${reason}`),
        ];
        if (seen.calls.includes("report_webview_crash")) found.push("reported a crash");
        if (!seen.mainChildren) found.push("main is empty");
        if (seen.spinners) found.push(`${seen.spinners} spinner(s) left after the page settled`);
        // A region may show its error, busy or empty state, but it may not vanish.
        const present = new Set(seen.regions.map((region) => region.name));
        for (const region of before?.regions ?? []) {
            if (!present.has(region.name)) found.push(`region ${region.name} is gone`);
        }
        const expectsNav = (before ?? seen).navLinks.length > 0;
        if (expectsNav) {
            const here = new URL(page.url()).pathname;
            const target =
                seen.navLinks.find((href) => href === "/whats-new" && here !== href) ??
                seen.navLinks.find((href) => href !== here && href !== "/");
            if (!target) found.push("the sidebar has no link to follow");
            else {
                await page.locator(`nav a[href="${target}"]`).first().click({ timeout: 5000 });
                const moved = await page
                    .waitForURL((url) => url.pathname === target, { timeout: 5000 })
                    .then(
                        () => true,
                        () => false,
                    );
                if (!moved) found.push(`a sidebar click on ${target} did not navigate`);
                else if (!(await page.locator("main > *").count())) found.push(`${target} rendered nothing`);
            }
        }
        if (!faults.length) {
            const commands = new Set([...SHELL_COMMANDS, ...route.commands, "report_webview_crash"]);
            const api = [...SHELL_API, ...route.api];
            for (const command of new Set(seen.calls)) {
                if (!commands.has(command)) found.push(`calls ${command}, which route-calls.ts does not list`);
            }
            for (const path of new Set(seen.api)) {
                if (!api.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
                    found.push(`requests ${path}, which route-calls.ts does not list`);
                }
            }
        }
        return [...new Set(found)];
    } finally {
        await context.close();
    }
}

const test = base.extend<{ sweep: (route: RouteCalls, faults: Fault[]) => Promise<string[]> }>({
    sweep: async ({ browser, baseURL }, use) => use((route, faults) => problems(browser, baseURL!, route, faults)),
});

function declare(route: RouteCalls, fault: Fault, tag?: string) {
    const label = describeFault(fault);
    const key = `${route.name} ${label}`;
    test(`${key}${tag ? ` ${tag}` : ""}`, async ({ sweep }) => {
        test.fixme(key in KNOWN, KNOWN[key]);
        expect(await sweep(route, [fault]), `?fault=${label} on ${route.path}`).toEqual([]);
    });
}

test("route-calls.ts covers every page of the main window", () => {
    const swept = ROUTE_CALLS.map((route) => new URL(route.path, "http://x").pathname);
    const pages = routePatterns().filter((pattern) => !NOT_SWEPT.includes(pattern));
    const settings = settingsCategories().map((category) => `/settings/${category}`);
    expect(pages.filter((pattern) => !swept.some((path) => matches(pattern, path)))).toEqual([]);
    expect(settings.filter((path) => !swept.includes(path))).toEqual([]);
    expect(pages.filter(isDynamic).every((pattern) => swept.some((path) => matches(pattern, path)))).toBe(true);
});

for (const route of ROUTE_CALLS) {
    test(`${route.name} loads clean and calls only what route-calls.ts lists`, async ({ sweep }) => {
        const key = `${route.name} clean`;
        test.fixme(key in KNOWN, KNOWN[key]);
        expect(await sweep(route, [])).toEqual([]);
    });

    const commands = SHELL_ROUTES.includes(route.name) ? [...SHELL_COMMANDS, ...route.commands] : route.commands;
    for (const command of commands) declare(route, { command, mode: "throw" });

    const api = SHELL_ROUTES.includes(route.name) ? [...SHELL_API, ...route.api] : route.api;
    for (const prefix of api) declare(route, { api: prefix, mode: "503" });
    for (const mode of ["503", "429", "drop"] as const) declare(route, { api: "", mode });

    if (!EXTRA) continue;
    for (const command of commands) declare(route, { command, mode: "null" }, "@shapes");
    if (ART_ROUTES.includes(route.name)) declare(route, { art: "missing" }, "@art");
}
