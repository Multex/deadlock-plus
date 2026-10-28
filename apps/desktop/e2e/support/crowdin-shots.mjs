// Screenshots of every page and popup of the demo, with a box for each English string on them, for Crowdin.
// Usage, from apps/desktop, after `pnpm demo:build`: node e2e/support/crowdin-shots.mjs [--out <dir>]
// Writes `<name>.png` files and `tags.json`; `scripts/crowdin-screenshots.mjs` uploads them.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { STILL, collectTags, settle, slug, stateOf } from "./crowdin-capture.mjs";
import { buildMatcher, matchText, readSourceStrings } from "./crowdin-strings.mjs";
import { cacheDir, createGameDataCache } from "./game-data-cache.ts";
import { WINDOWS_UA } from "./platform.ts";
import { isDynamic, routePatterns, settingsCategories } from "./routes.ts";

const DESKTOP = fileURLToPath(new URL("../../", import.meta.url));
const option = (name) => {
    const at = process.argv.indexOf(name);
    return at === -1 ? undefined : process.argv[at + 1];
};
const OUT = path.resolve(DESKTOP, option("--out") ?? "test-results/crowdin");
// Not 1420/1421 (`tauri dev`), 4310 (E2E) or 5173 (the website).
const PORT = Number(process.env.DEMO_PORT ?? 4330);
const BASE = `http://127.0.0.1:${PORT}`;
const ALLOWED_HOSTS = ["api.deadlock-api.com", "assets-bucket.deadlock-api.com"];

// Pages that need an id, and pages with nothing to translate (licence texts and contributor names).
const PARAMS = {
    "/builds/view": ["/builds/view?source=local&id=3"],
    "/builds/edit": ["/builds/edit?source=public&id=402117"],
    "/match-history/[id]": ["/match-history/990000056"],
    "/settings/[category=category]": [...settingsCategories(), "discord"].map((id) => `/settings/${id}`),
};
const SKIPPED = new Set(["/onboarding"]);

const LOCALES = path.resolve(DESKTOP, "../../locales");
// The website's strings never show in the app; matching them too would leave shared words like "Download" untagged.
const appAreas = readdirSync(LOCALES).filter((area) => area !== "web");
const matcher = buildMatcher(readSourceStrings(LOCALES, appAreas));
const gameData = createGameDataCache({
    dir: cacheDir(
        path.join(DESKTOP, "e2e/.cache/game-data/"),
        readFileSync(new URL("./game-data.version", import.meta.url), "utf8"),
    ),
    offline: false,
});

const results = [];
const problems = [];
const names = new Set();

async function startServer() {
    const server = spawn(process.execPath, ["e2e/support/demo.mjs", "preview"], {
        cwd: DESKTOP,
        env: { ...process.env, VITE_DEMO: "1", DEMO_PORT: String(PORT), DEMO_LOG_LEVEL: "error" },
        stdio: ["ignore", "ignore", "inherit"],
    });
    for (let i = 0; i < 120; i++) {
        if (server.exitCode !== null)
            throw new Error(`the demo server exited with ${server.exitCode}; run pnpm demo:build first`);
        if (
            await fetch(BASE).then(
                (r) => r.ok,
                () => false,
            )
        )
            return server;
        await new Promise((r) => setTimeout(r, 500));
    }
    server.kill();
    throw new Error(`the demo server did not answer on ${BASE}`);
}

async function newPage(browser, scenario) {
    const context = await browser.newContext({
        viewport: { width: 1480, height: 900 },
        deviceScaleFactor: 1,
        locale: "en-US",
        timezoneId: "UTC",
        colorScheme: "dark",
        reducedMotion: "reduce",
        userAgent: WINDOWS_UA,
    });
    await context.addInitScript((id) => {
        window.__DEADLOCK_PLUS_DEMO__ = { scenario: id };
    }, scenario);
    await context.addInitScript((css) => {
        document.addEventListener("DOMContentLoaded", () => {
            const style = document.createElement("style");
            style.textContent = css;
            document.head.append(style);
        });
    }, STILL);
    // Copy buttons would otherwise ask for clipboard permission.
    await context.addInitScript(() => {
        let copied = null;
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText: async (t) => void (copied = t), readText: async () => copied ?? "" },
        });
    });
    await context.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.protocol === "data:" || url.protocol === "blob:" || url.origin === BASE) return route.continue();
        if (!ALLOWED_HOSTS.includes(url.host) || request.method() !== "GET") return route.abort("blockedbyclient");
        try {
            const entry = await gameData.get(url.href, async () => {
                const response = await route.fetch();
                return { status: response.status(), headers: response.headers(), body: await response.body() };
            });
            const headers = { ...entry.headers, "access-control-allow-origin": "*" };
            return await route.fulfill({ status: entry.status, headers, body: entry.body });
        } catch (error) {
            problems.push(error instanceof Error ? error.message : String(error));
            return route.abort("failed");
        }
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => problems.push(`${scenario}: ${e.message}`));
    return page;
}

async function shot(page, state, { hover = false } = {}) {
    let name = `desktop-${state}`;
    for (let i = 2; names.has(name); i++) name = `desktop-${state}-${i}`;
    names.add(name);
    const file = `${name}.png`;
    if (hover) await page.waitForTimeout(400);
    else await page.mouse.move(0, 0).catch(() => {});
    await page.screenshot({ path: path.join(OUT, file) });
    const tags = await page.evaluate(`(${collectTags})(${matchText}, ${JSON.stringify(matcher)})`);
    results.push({ file, tags });
    console.log(file, tags.length);
}

async function scrollPages(page, state, max) {
    await shot(page, state);
    for (let i = 2; i <= max; i++) {
        const moved = await page.evaluate(() => {
            const main = [...document.querySelectorAll("main, [data-scroll], .overflow-y-auto, .overflow-auto")]
                .filter((e) => e.scrollHeight > e.clientHeight + 40)
                .sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0];
            if (!main) return false;
            const before = main.scrollTop;
            main.scrollTop += main.clientHeight - 60;
            return main.scrollTop > before + 20;
        });
        if (!moved) break;
        await page.waitForTimeout(300);
        await settle(page);
        await shot(page, `${state}-p${i}`);
    }
    await page.evaluate(() =>
        document.querySelectorAll("*").forEach((e) => {
            if (e.scrollTop) e.scrollTop = 0;
        }),
    );
}

// One shot per popup trigger (select menus, dropdowns) and per tab in the page's main area.
async function openStates(page, state, route, limit = 6) {
    let done = 0;
    for (const trigger of await page.locator("main [aria-haspopup]:visible").all()) {
        if (done >= limit) break;
        const name = slug(
            (await trigger.getAttribute("aria-label")) || (await trigger.innerText().catch(() => "")) || "menu",
        );
        try {
            await trigger.click({ timeout: 2000 });
            await page.waitForTimeout(300);
            if (await page.locator("[role=menu]:visible,[role=listbox]:visible,[role=dialog]:visible").count()) {
                await shot(page, `${state}-menu-${name}`);
                done++;
            }
            await page.keyboard.press("Escape");
            await page.waitForTimeout(150);
            const url = new URL(page.url());
            if (url.pathname + url.search !== route) {
                await page.goto(BASE + route);
                await settle(page);
            }
        } catch {}
    }
    for (const tab of (await page.locator("main [role=tab][aria-selected=false]:visible").all()).slice(0, 6)) {
        const name = slug((await tab.innerText().catch(() => "")) || "tab");
        try {
            await tab.click({ timeout: 2000 });
            await settle(page);
            await shot(page, `${state}-tab-${name}`);
        } catch {}
    }
}

async function clickIf(page, locator) {
    try {
        await locator.first().click({ timeout: 3000 });
        await settle(page);
        return true;
    } catch {
        return false;
    }
}

async function visit(page, route) {
    await page.goto(BASE + route);
    await settle(page);
}

async function defaultScenario(browser) {
    const page = await newPage(browser, "default");
    const routes = routePatterns()
        .filter((p) => !SKIPPED.has(p))
        .flatMap((p) => PARAMS[p] ?? (isDynamic(p) ? [] : [p]));
    for (const route of routes) {
        const state = stateOf(route);
        try {
            await visit(page, route);
            await scrollPages(page, state, state.startsWith("match-history-") ? 6 : 4);
            await openStates(page, state, route);
        } catch (e) {
            problems.push(`${route}: ${e.message}`);
        }
    }

    await visit(page, "/");
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(400);
    await shot(page, "command-palette");
    await page.keyboard.type("set");
    await page.waitForTimeout(300);
    await shot(page, "command-palette-search");
    await page.keyboard.press("Escape");

    await clickIf(page, page.getByRole("navigation").getByRole("button", { name: "Tools", exact: true }));
    await shot(page, "sidebar-tools-open");
    await clickIf(page, page.getByRole("button", { name: "Collapse sidebar" }));
    await shot(page, "sidebar-collapsed");
    await clickIf(page, page.getByRole("button", { name: "Expand sidebar" }));

    const dialogs = [
        ["/server-picker", /^Unblock all \(/, "confirm-unblock-all"],
        ["/presence", "Reset everything", "confirm-presence-reset"],
        ["/voice-bans", /^Unmute/, "confirm-unmute"],
        ["/settings/storage", /^Clear /, "confirm-storage-clear"],
        ["/server-picker", "Presets", "server-picker-presets"],
        ["/server-picker", "Import", "server-picker-import"],
    ];
    for (const [route, name, state] of dialogs) {
        await visit(page, route);
        if (await clickIf(page, page.getByRole("button", { name, exact: typeof name === "string" })))
            await shot(page, state);
        await page.keyboard.press("Escape");
    }

    await visit(page, "/builds/edit?source=public&id=402117");
    if (await clickIf(page, page.getByTestId("copy-for-game"))) await shot(page, "build-editor-copy-for-game");
    await clickIf(page, page.getByTestId("paste-steps").getByRole("button", { name: "Done" }));
    if (await clickIf(page, page.getByRole("button", { name: "Tag 1: empty" })))
        await shot(page, "build-editor-tag-menu");
    await page.keyboard.press("Escape");
    if (await clickIf(page, page.getByRole("button", { name: /layout issue/ })))
        await shot(page, "build-editor-layout-issues");
    await page.keyboard.press("Escape");

    await visit(page, "/builds");
    if (await clickIf(page, page.getByTestId("paste-build-code"))) await shot(page, "builds-paste-code");
    await page.keyboard.press("Escape");

    await visit(page, "/builds/view?source=local&id=3");
    try {
        await page.locator("main [data-item-id], main [data-item], main button img").first().hover({ timeout: 3000 });
        await shot(page, "build-view-item-tooltip", { hover: true });
    } catch {}

    await visit(page, "/match-history/990000056");
    if (await clickIf(page, page.getByRole("button", { name: /^Share|^Export|^Save image/ })))
        await shot(page, "match-detail-share");
    await page.keyboard.press("Escape");

    for (const route of ["/", "/stats"]) {
        await visit(page, route);
        const triggers = await page
            .locator(
                "main [data-state='closed'][aria-describedby], main [data-tooltip-trigger], main [data-slot='tooltip-trigger']",
            )
            .all();
        for (const t of triggers.slice(0, 2)) {
            try {
                await t.hover({ timeout: 2000 });
                await shot(page, `tooltip-${stateOf(route)}`, { hover: true });
            } catch {}
        }
    }
    await page.context().close();
}

const SCENARIOS = [
    ["live-match", ["/live", "/", "/presence", "/overlay"]],
    ["update-available", ["/", "/settings/about"]],
    ["unelevated", ["/server-picker", "/settings/startup"]],
    ["offline", ["/", "/stats", "/match-history"]],
];

async function otherScenarios(browser) {
    for (const [scenario, routes] of SCENARIOS) {
        const page = await newPage(browser, scenario);
        for (const route of routes) {
            const state = `${scenario}-${stateOf(route)}`;
            try {
                await visit(page, route);
                const live = route === "/live";
                await scrollPages(page, state, live ? 6 : 3);
                if (live) await openStates(page, state, route);
            } catch (e) {
                problems.push(`${scenario} ${route}: ${e.message}`);
            }
        }
        await page.context().close();
    }
}

async function onboarding(browser) {
    const page = await newPage(browser, "new-user");
    await page.goto(BASE + "/");
    await page.waitForURL("**/onboarding").catch(() => {});
    await settle(page);
    for (let step = 0; step <= 6; step++) {
        await shot(page, `onboarding-step${step}`);
        if (
            step === 4 &&
            (await clickIf(page, page.getByRole("main").getByRole("button", { name: "Share my matches" })))
        ) {
            await shot(page, "onboarding-step4-sharing-on");
        }
        if (!(await clickIf(page, page.getByRole("button", { name: "Next", exact: true })))) break;
    }
    await page.context().close();
}

mkdirSync(OUT, { recursive: true });
const server = await startServer();
try {
    const browser = await chromium.launch({
        channel: process.env.E2E_CHANNEL ?? (process.platform === "win32" ? "msedge" : "chrome"),
        args: ["--disable-gpu"],
    });
    try {
        await defaultScenario(browser);
        await otherScenarios(browser);
        await onboarding(browser);
    } finally {
        await browser.close();
    }
} finally {
    server.kill();
}

writeFileSync(path.join(OUT, "tags.json"), `${JSON.stringify(results, null, 1)}\n`);
const tagged = new Set(
    results.flatMap((r) => r.tags.filter((t) => !t.ambiguous).map((t) => `${t.source}#${t.identifier}`)),
);
console.log(`${results.length} screenshots, ${tagged.size} strings tagged, written to ${OUT}`);
for (const problem of new Set(problems)) console.warn(`problem: ${problem}`);
if (!results.length) process.exit(1);
