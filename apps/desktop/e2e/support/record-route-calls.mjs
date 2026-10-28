// Writes route-calls.ts: the commands and Deadlock API path prefixes each route uses while it loads.
// Usage, from apps/desktop, with a demo server running (node e2e/support/demo.mjs build preview):
//   node e2e/support/record-route-calls.mjs
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import process from "node:process";
import { WINDOWS_UA } from "./platform.ts";

const BASE = `http://127.0.0.1:${process.env.E2E_PORT ?? process.env.DEMO_PORT ?? 4310}`;
const ALLOWED = [new URL(BASE).host, "api.deadlock-api.com", "assets-bucket.deadlock-api.com"];
const OUT = new URL("./route-calls.ts", import.meta.url);
// Timers fire at different moments from one load to the next, so each route is recorded more than once.
const RUNS = 3;
const SETTINGS = [
    "appearance",
    "language",
    "startup",
    "notifications",
    "overlay",
    "privacy",
    "sharing",
    "storage",
    "diagnostics",
    "about",
];

/** [name, path, scenario] */
const ROUTES = [
    ["home", "/", "default"],
    ["alerts", "/alerts", "default"],
    ["builds", "/builds", "default"],
    ["builds-mine", "/builds?tab=mine", "default"],
    ["build-view-local", "/builds/view?source=local&id=3", "default"],
    ["build-view-public", "/builds/view?source=public&id=372846", "default"],
    ["build-edit", "/builds/edit?source=public&id=402117", "default"],
    ["demos", "/demos", "default"],
    ["dispatch", "/dispatch", "dispatch"],
    ["live", "/live", "live-match"],
    ["match-history", "/match-history", "default"],
    ["match-detail", "/match-history/990000060", "default"],
    ["performance", "/performance", "default"],
    ["presence", "/presence", "default"],
    ["server-picker", "/server-picker", "default"],
    ["stats", "/stats", "default"],
    ["voice-bans", "/voice-bans", "default"],
    ["whats-new", "/whats-new", "default"],
    ["onboarding", "/onboarding", "new-user"],
    ...SETTINGS.map((category) => [`settings-${category}`, `/settings/${category}`, "default"]),
];

// Commands a load never faults: `report_webview_crash` is what the sweep asserts is never called.
const NOT_FAULTED = new Set(["report_webview_crash"]);

/**
 * The path up to its first id segment, at most three segments: `/v1/players/123/match-history` is
 * `/v1/players`, `/v1/analytics/hero-stats` stays whole.
 */
export function apiPrefix(pathname) {
    const kept = [];
    for (const segment of pathname.split("/").filter(Boolean)) {
        if (/\d/.test(segment) && !/^v\d+$/.test(segment)) break;
        kept.push(segment);
        if (kept.length === 3) break;
    }
    return `/${kept.join("/")}`;
}

/** Same recorder as the degradation spec's: wraps the demo's IPC and fetch right after `startDemo`. */
function recordCalls(scenario) {
    let hook = { scenario };
    const log = { calls: [], api: [] };
    window.__degradation = log;
    Object.defineProperty(window, "__DEADLOCK_PLUS_DEMO__", {
        configurable: true,
        get: () => hook,
        set(value) {
            hook = value;
            const internals = window.__TAURI_INTERNALS__;
            if (!internals || internals.__degradationWrapped) return;
            internals.__degradationWrapped = true;
            const invoke = internals.invoke.bind(internals);
            internals.invoke = (command, args, options) => {
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

async function record(browser, [name, path, scenario]) {
    const calls = new Set();
    const api = new Set();
    for (let run = 0; run < RUNS; run++) {
        const context = await browser.newContext({
            viewport: { width: 1480, height: 900 },
            locale: "en-US",
            userAgent: WINDOWS_UA,
        });
        await context.addInitScript(recordCalls, scenario);
        await context.route("**/*", (route) =>
            ALLOWED.includes(new URL(route.request().url()).host) ? route.continue() : route.abort("blockedbyclient"),
        );
        const page = await context.newPage();
        await page.goto(`${BASE}${path}`);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(3000);
        const log = await page.evaluate(() => window.__degradation);
        await context.close();
        for (const command of log.calls) if (!NOT_FAULTED.has(command)) calls.add(command);
        for (const pathname of log.api) api.add(apiPrefix(pathname));
    }
    return { name, path, scenario, calls: [...calls].sort(), api: [...api].sort() };
}

const browser = await chromium.launch({ channel: process.platform === "win32" ? "msedge" : "chrome" });
const recorded = [];
for (let i = 0; i < ROUTES.length; i += 4) {
    recorded.push(...(await Promise.all(ROUTES.slice(i, i + 4).map((route) => record(browser, route)))));
}
await browser.close();

// What nearly every route calls belongs to the app shell; the sweep faults those on two routes only.
const nearlyAll = (lists) =>
    [...new Set(lists.flat())]
        .filter((item) => lists.filter((list) => list.includes(item)).length >= lists.length - 3)
        .sort();
const shell = nearlyAll(recorded.map((route) => route.calls));
const shellApi = nearlyAll(recorded.map((route) => route.api));
const routes = recorded.map(({ calls, api, ...route }) => ({
    ...route,
    commands: calls.filter((command) => !shell.includes(command)),
    api: api.filter((prefix) => !shellApi.includes(prefix)),
}));

const json = (value) => JSON.stringify(value, null, 4);
writeFileSync(
    OUT,
    `// Generated by record-route-calls.mjs; run it again instead of editing this file.

export interface RouteCalls {
    name: string;
    /** Path and query the route is opened at. */
    path: string;
    scenario: string;
    /** Commands this route calls on load, beyond the shell's. */
    commands: string[];
    /** Deadlock API path prefixes this route requests on load, beyond the shell's. */
    api: string[];
}

/** Commands the app shell calls on (nearly) every route. */
export const SHELL_COMMANDS: string[] = ${json(shell)};

/** Deadlock API path prefixes the app shell requests on (nearly) every route. */
export const SHELL_API: string[] = ${json(shellApi)};

export const ROUTE_CALLS: RouteCalls[] = ${json(routes)};
`,
);
console.log(`${routes.length} routes, ${shell.length} shell commands, ${shellApi.length} shell API prefixes`);
