// Screenshots of every page of the website at phone and desktop width, with a box for each English string of
// `locales/web/en.json` on them, for Crowdin. Lives here because Playwright is a dependency of this app only.
// Usage, from apps/desktop, after `pnpm build` in apps/web: node e2e/support/crowdin-web-shots.mjs [--out <dir>]
// Writes `<name>.png` files and `tags.json`; `scripts/crowdin-screenshots.mjs --dir <dir>` uploads them.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { STILL, collectTags, settle, slug, webShotName } from "./crowdin-capture.mjs";
import { buildMatcher, matchText, readSourceStrings } from "./crowdin-strings.mjs";

const DESKTOP = fileURLToPath(new URL("../../", import.meta.url));
const WEB = path.resolve(DESKTOP, "../web");
const option = (name) => {
    const at = process.argv.indexOf(name);
    return at === -1 ? undefined : process.argv[at + 1];
};
const OUT = path.resolve(DESKTOP, option("--out") ?? "test-results/crowdin-web");
// Not 1420/1421 (`tauri dev`), 4310 (E2E), 4330 (the demo capture) or 5173 (the website's dev server).
const PORT = Number(process.env.WEB_PORT ?? 4340);
const BASE = `http://127.0.0.1:${PORT}`;
const VIEWPORTS = [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
];
// [address, name]. A two-part path is not a referral code, so it reaches the English 404 page.
const PAGES = [
    ["/", "/"],
    ["/features", "/features"],
    ["/download", "/download"],
    ["/faq", "/faq"],
    ["/privacy", "/privacy"],
    ["/transparency", "/transparency"],
    ["/missing/page", "/not-found"],
];
const MAX_SCROLLS = 15;

const entries = readSourceStrings(path.resolve(DESKTOP, "../../locales"), ["web"]);
const matcher = buildMatcher(entries);

const results = [];
const problems = [];
const names = new Set();

async function startServer() {
    const server = spawn(
        process.execPath,
        ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
        { cwd: WEB, stdio: ["ignore", "ignore", "inherit"] },
    );
    for (let i = 0; i < 120; i++) {
        if (server.exitCode !== null)
            throw new Error(`the website preview exited with ${server.exitCode}; run pnpm build in apps/web first`);
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
    throw new Error(`the website preview did not answer on ${BASE}`);
}

async function newPage(browser, viewport) {
    const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        locale: "en-US",
        timezoneId: "UTC",
        colorScheme: "dark",
        reducedMotion: "reduce",
    });
    await context.addInitScript((css) => {
        document.addEventListener("DOMContentLoaded", () => {
            const style = document.createElement("style");
            style.textContent = css;
            document.head.append(style);
        });
    }, STILL);
    // Only the site itself: no analytics beacons, and nothing that differs from run to run.
    await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.protocol === "data:" || url.protocol === "blob:" || url.origin === BASE) return route.continue();
        return route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => problems.push(`${viewport.width}: ${e.message}`));
    return page;
}

async function shot(page, route, extra) {
    const { width } = page.viewportSize();
    let name = webShotName(route, width, extra);
    for (let i = 2; names.has(name); i++) name = webShotName(route, width, [extra, i].filter(Boolean).join("-"));
    names.add(name);
    const file = `${name}.png`;
    await page.mouse.move(0, 0).catch(() => {});
    await page.screenshot({ path: path.join(OUT, file) });
    const tags = await page.evaluate(`(${collectTags})(${matchText}, ${JSON.stringify(matcher)})`);
    results.push({ file, tags });
    console.log(file, tags.length);
}

// The site scrolls the window, so each screen of the page is its own picture.
async function scrollPages(page, route, extra) {
    await shot(page, route, extra);
    for (let i = 2; i <= MAX_SCROLLS; i++) {
        const moved = await page.evaluate(() => {
            const before = scrollY;
            scrollBy(0, innerHeight - 60);
            return scrollY > before + 20;
        });
        if (!moved) break;
        await settle(page);
        await shot(page, route, [extra, `p${i}`].filter(Boolean).join("-"));
    }
    await page.evaluate(() => scrollTo(0, 0));
}

async function visit(page, address) {
    await page.goto(BASE + address);
    await settle(page);
}

// Every menu trigger, and the first picture viewer: the others all show the same viewer copy. A menu every page
// has, like the language menu, is shot once per width.
async function openStates(page, address, route, opened) {
    const triggers = await page.locator("[aria-haspopup=menu]:visible").all();
    const viewer = page.locator("[aria-haspopup=dialog]:visible").first();
    if (await viewer.count()) triggers.push(viewer);
    for (const trigger of triggers) {
        const label = (await trigger.getAttribute("aria-label")) || (await trigger.innerText().catch(() => ""));
        if (opened.has(label)) continue;
        opened.add(label);
        try {
            await trigger.scrollIntoViewIfNeeded({ timeout: 2000 });
            await trigger.click({ timeout: 2000 });
            await page.waitForTimeout(400);
            const open = page.locator("[role=menu]:visible,[role=dialog]:visible");
            if (await open.count()) {
                await settle(page);
                const kind = (await open.first().getAttribute("role")) === "dialog" ? "dialog" : "menu";
                await shot(page, route, `${kind}-${slug(label || kind)}`);
            }
            await page.keyboard.press("Escape");
            await page.waitForTimeout(200);
            if (new URL(page.url()).pathname !== address) await visit(page, address);
        } catch (e) {
            problems.push(`${address} ${label}: ${e.message.split("\n")[0]}`);
        }
    }
}

async function tabs(page, address, route) {
    const count = await page.locator("main [role=tab]").count();
    for (let i = 1; i < count; i++) {
        const tab = page.locator("main [role=tab]").nth(i);
        const name = slug((await tab.innerText().catch(() => "")) || `tab-${i}`);
        try {
            await tab.click({ timeout: 2000 });
            await settle(page);
            await scrollPages(page, route, `tab-${name}`);
        } catch (e) {
            problems.push(`${address} tab ${name}: ${e.message.split("\n")[0]}`);
        }
    }
}

async function capture(browser, viewport) {
    const page = await newPage(browser, viewport);
    const opened = new Set();
    for (const [address, route] of PAGES) {
        try {
            await visit(page, address);
            await scrollPages(page, route);
            await openStates(page, address, route, opened);
            await tabs(page, address, route);
        } catch (e) {
            problems.push(`${address}: ${e.message.split("\n")[0]}`);
        }
    }
    await page.context().close();

    // An English browser on a translated page is offered English, in English.
    const offer = await newPage(browser, viewport);
    try {
        await visit(offer, "/de");
        await offer
            .getByRole("link", { name: /English/ })
            .first()
            .waitFor({ timeout: 5000 });
        await shot(offer, "/", "language-offer");
    } catch (e) {
        problems.push(`language offer: ${e.message.split("\n")[0]}`);
    }
    await offer.context().close();
}

mkdirSync(OUT, { recursive: true });
const server = await startServer();
try {
    const browser = await chromium.launch({
        channel: process.env.E2E_CHANNEL ?? (process.platform === "win32" ? "msedge" : "chrome"),
        args: ["--disable-gpu"],
    });
    try {
        for (const viewport of VIEWPORTS) await capture(browser, viewport);
    } finally {
        await browser.close();
    }
} finally {
    server.kill();
}

writeFileSync(path.join(OUT, "tags.json"), `${JSON.stringify(results, null, 1)}\n`);
const total = new Set(entries.map((e) => e.identifier));
const tagged = new Set(results.flatMap((r) => r.tags.filter((t) => !t.ambiguous).map((t) => t.identifier)));
console.log(`${results.length} screenshots, ${tagged.size} of ${total.size} strings tagged, written to ${OUT}`);
for (const problem of new Set(problems)) console.warn(`problem: ${problem}`);
if (!results.length) process.exit(1);
