// Runtime numbers for the demo build: cold start, sidebar route switches, long tasks per flow, JS heap.
// Usage, from apps/desktop (Deadlock must not be running):
//   DEMO_ID=perf node perf/build.mjs
//   DEMO_ID=perf DEMO_PORT=4391 node e2e/support/demo.mjs preview      (in another shell)
//   PERF_PORT=4391 node perf/measure.mjs [--runs 5] [--only cold,switch,flows] [--json out.json] [--check]
// Every number is the median of the runs. `--check` exits 1 when one goes over perf/budgets.json.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { cacheDir, createGameDataCache } from "../e2e/support/game-data-cache.ts";
import { sourceMaps } from "./source-map.mjs";

const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : fallback;
};
const PORT = Number(process.env.PERF_PORT ?? 4391);
const BASE = `http://127.0.0.1:${PORT}`;
const RUNS = Number(arg("runs", 5));
const ONLY = arg("only", "cold,switch,flows").split(",");
const ROUNDS = Number(arg("rounds", 3));

const gameData = createGameDataCache({
    dir: cacheDir(
        fileURLToPath(new URL("../e2e/.cache/game-data/", import.meta.url)),
        readFileSync(new URL("../e2e/support/game-data.version", import.meta.url), "utf8"),
    ),
    offline: process.env.E2E_OFFLINE === "1",
});

// Runs in the page before any app code. `readyAt` is the first frame since the last click at which the page
// at `target` has content, no skeleton, loaded fonts and images; it resets whenever that stops holding.
function probe() {
    const perf = (window.__perf = { longtasks: [], events: [], clickAt: 0, readyAt: null, target: null });
    new PerformanceObserver((list) => {
        for (const e of list.getEntries()) perf.longtasks.push({ start: e.startTime, duration: e.duration });
    }).observe({ type: "longtask", buffered: true });
    new PerformanceObserver((list) => {
        for (const e of list.getEntries()) perf.events.push({ name: e.name, start: e.startTime, duration: e.duration });
    }).observe({ type: "event", durationThreshold: 16, buffered: true });
    document.addEventListener(
        "click",
        (event) => {
            perf.clickAt = event.timeStamp;
            perf.readyAt = null;
        },
        true,
    );
    const ready = () => {
        if (perf.target && !new RegExp(perf.target).test(location.pathname + location.search)) return false;
        if (!document.querySelector("main")?.childElementCount) return false;
        if (document.fonts.status !== "loaded" || document.querySelector(".animate-pulse")) return false;
        for (const image of document.images) if (!image.complete) return false;
        return true;
    };
    const frame = (now) => {
        if (!ready()) perf.readyAt = null;
        else if (perf.readyAt === null) perf.readyAt = now;
        requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
}

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? "msedge" });

async function newPage(scenario = "default") {
    const context = await browser.newContext({
        viewport: { width: 1600, height: 1000 },
        deviceScaleFactor: 1,
        locale: "en-US",
        timezoneId: "UTC",
        colorScheme: "dark",
    });
    await context.addInitScript((id) => (window.__DEADLOCK_PLUS_DEMO__ = { scenario: id }), scenario);
    await context.addInitScript(probe);
    await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.host === `127.0.0.1:${PORT}` || url.protocol === "data:" || url.protocol === "blob:")
            return route.continue();
        if (route.request().method() !== "GET") return route.abort("blockedbyclient");
        try {
            const entry = await gameData.get(url.href, async () => {
                const response = await route.fetch();
                return { status: response.status(), headers: response.headers(), body: await response.body() };
            });
            return await route.fulfill({
                status: entry.status,
                headers: { ...entry.headers, "access-control-allow-origin": "*" },
                body: entry.body,
            });
        } catch {
            return route.abort("failed");
        }
    });
    const page = await context.newPage();
    return { page, context, close: () => context.close() };
}

/** Waits for the page to settle and returns the window since the last click (or navigation start). */
async function settle(page) {
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => window.__perf.readyAt !== null, null, { timeout: 30_000 });
    await page.waitForTimeout(300);
    await page.waitForFunction(() => window.__perf.readyAt !== null, null, { timeout: 30_000 });
    return page.evaluate(() => {
        const p = window.__perf;
        return { from: p.clickAt, readyAt: p.readyAt, now: performance.now() };
    });
}

/** Long tasks and slow input events between `from` and `to`, in ms of the page clock. */
async function tasksBetween(page, from, to) {
    return page.evaluate(
        ([a, b]) => {
            const p = window.__perf;
            const tasks = p.longtasks.filter((t) => t.start >= a && t.start <= b);
            const events = p.events.filter((e) => e.start >= a && e.start <= b);
            return {
                longest: Math.max(0, ...tasks.map((t) => t.duration)),
                count: tasks.length,
                tbt: tasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0),
                slowestEvent: Math.max(0, ...events.map((e) => e.duration)),
            };
        },
        [from, to],
    );
}

const PROFILE = process.argv.includes("--profile");
const OUTPUT = fileURLToPath(
    new URL(`../build-${process.env.DEMO_ID ? `demo-${process.env.DEMO_ID}` : "demo"}/`, import.meta.url),
);
const resolve = sourceMaps();
const profiles = {};

async function startProfile(page) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
    await cdp.send("Profiler.start");
    return async () => {
        const { profile } = await cdp.send("Profiler.stop");
        await cdp.detach();
        return profile;
    };
}

function frameName(callFrame) {
    const { url, functionName, lineNumber, columnNumber } = callFrame;
    if (!url.startsWith(BASE)) return { key: functionName || "(anonymous)", file: functionName || "(native)" };
    const original = resolve(OUTPUT + new URL(url).pathname.slice(1), lineNumber, columnNumber);
    if (!original) return { key: `${new URL(url).pathname}:${lineNumber + 1}`, file: new URL(url).pathname };
    return {
        key: `${original.source}:${original.line} ${original.name ?? functionName ?? ""}`.trim(),
        file: original.source,
    };
}

/** Adds a CPU profile's self time per source function and inclusive time per source file to `profiles[name]`. */
function addProfile(name, profile) {
    const entry = (profiles[name] ??= { runs: 0, self: {}, files: {} });
    entry.runs++;
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const parent = new Map();
    for (const n of profile.nodes) for (const child of n.children ?? []) parent.set(child, n.id);
    const names = new Map(profile.nodes.map((n) => [n.id, frameName(n.callFrame)]));
    profile.samples.forEach((id, i) => {
        const ms = (profile.timeDeltas[i + 1] ?? 0) / 1000;
        const leaf = names.get(id);
        if (leaf.key === "(idle)" || leaf.key === "(program)") return;
        entry.self[leaf.key] = (entry.self[leaf.key] ?? 0) + ms;
        const seen = new Set();
        for (let at = id; at !== undefined; at = parent.get(at)) {
            const file = names.get(at).file;
            if (!seen.has(file) && byId.get(at).callFrame.url.startsWith(BASE)) {
                seen.add(file);
                entry.files[file] = (entry.files[file] ?? 0) + ms;
            }
        }
    });
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Clicks `locator`, waits until `target` (a regex source over path+search, or null) has settled. */
async function step(page, locator, target, { linger = 0 } = {}, profileAs = null) {
    await page.evaluate((t) => (window.__perf.target = t), target);
    const profiler = PROFILE && profileAs ? await startProfile(page) : null;
    await locator.click();
    if (linger) await page.waitForTimeout(linger);
    const { from, readyAt, now } = await settle(page);
    if (profiler) addProfile(profileAs, await profiler());
    const tasks = await tasksBetween(page, from, now);
    return { ms: target ? readyAt - from : null, ...tasks };
}

async function heapMB(page) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("HeapProfiler.collectGarbage");
    await cdp.send("HeapProfiler.collectGarbage");
    const { usedSize } = await cdp.send("Runtime.getHeapUsage");
    await cdp.detach();
    return usedSize / 1024 / 1024;
}

const median = (values) => {
    const sorted = values.filter((v) => v !== null && v !== undefined).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const collect = (runs) => {
    const keys = Object.keys(runs[0] ?? {});
    return Object.fromEntries(keys.map((k) => [k, median(runs.map((r) => r[k]))]));
};

const results = {};

async function cold() {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
        const { page, close } = await newPage();
        const profiler = PROFILE ? await startProfile(page) : null;
        await page.goto(`${BASE}/`);
        const { readyAt, now } = await settle(page);
        if (profiler) addProfile("cold start", await profiler());
        const timing = await page.evaluate(() => {
            const paint = Object.fromEntries(performance.getEntriesByType("paint").map((e) => [e.name, e.startTime]));
            const nav = performance.getEntriesByType("navigation")[0];
            return {
                fp: paint["first-paint"],
                fcp: paint["first-contentful-paint"],
                dcl: nav.domContentLoadedEventEnd,
            };
        });
        const tasks = await tasksBetween(page, 0, now);
        runs.push({ ...timing, interactive: readyAt, longest: tasks.longest, tbt: tasks.tbt });
        await close();
    }
    results.cold = collect(runs);
}

async function sidebarLinks(page) {
    return page
        .getByRole("navigation")
        .getByRole("link")
        .evaluateAll((els) => els.map((e) => ({ name: e.textContent.trim(), href: e.getAttribute("href") })));
}

async function switches() {
    const perRound = Array.from({ length: ROUNDS }, () => ({}));
    const heaps = [];
    for (let i = 0; i < RUNS; i++) {
        const { page, close } = await newPage();
        await page.goto(`${BASE}/`);
        await settle(page);
        const links = await sidebarLinks(page);
        // Home last, so every route is entered from another one.
        const order = [...links.filter((l) => l.href !== "/"), links.find((l) => l.href === "/")];
        const heap = [await heapMB(page)];
        for (let round = 0; round < ROUNDS; round++) {
            for (const { name, href } of order) {
                const link = page.getByRole("navigation").getByRole("link", { name, exact: true });
                const r = await step(page, link, `^${escape(href)}$`, {}, round === 0 ? `switch ${name}` : null);
                (perRound[round][name] ??= []).push(r);
            }
            heap.push(await heapMB(page));
        }
        heaps.push(heap);
        await close();
    }
    results.switch = perRound.map((round) =>
        Object.fromEntries(Object.entries(round).map(([k, v]) => [k, collect(v)])),
    );
    results.heap = heaps[0].map((_, i) => median(heaps.map((h) => h[i])));
}

async function flows() {
    const runs = {};
    const record = async (name, page, locator, target, opts = {}) =>
        (runs[name] ??= []).push(await step(page, locator, target, opts, name));
    for (let i = 0; i < RUNS; i++) {
        {
            const { page, close } = await newPage();
            await page.goto(`${BASE}/`);
            await settle(page);
            const nav = (name) => page.getByRole("navigation").getByRole("link", { name, exact: true });
            const main = page.getByRole("main");
            await record("stats", page, nav("Stats"), "^/stats$");
            await record("match-history list", page, nav("Match History"), "^/match-history$");
            const row = main
                .getByRole("listitem")
                .filter({ has: page.getByRole("link") })
                .first()
                .getByRole("link")
                .first();
            await record("match detail", page, row, "^/match-history/\\d+");
            await record("builds list", page, nav("Builds"), "^/builds$");
            await step(page, main.getByRole("tab", { name: "Mine", exact: true }), null);
            await step(
                page,
                main.getByTestId("build-list").getByRole("link", { name: "Abrams practice", exact: true }),
                null,
            );
            await record(
                "builds editor",
                page,
                main.getByTestId("build-detail").getByTestId("edit-build"),
                "^/builds/edit",
            );
            await close();
        }
        {
            const { page, close } = await newPage("dispatch");
            await page.goto(`${BASE}/`);
            await settle(page);
            const main = page.getByRole("main");
            const button = (name) => main.getByRole("button", { name }).first();
            await record(
                "dispatch table",
                page,
                page.getByRole("navigation").getByRole("link", { name: "Dispatch", exact: true }),
                "^/dispatch$",
            );
            await record("dispatch open edition", page, button("Monthly, September 2026"), "edition=", {
                linger: 1500,
            });
            for (let turn = 0; turn < 3; turn++) {
                const next = page.getByRole("button", { name: "Next pages" });
                if (!(await next.count()) || (await next.isDisabled())) break;
                await record("dispatch page turn", page, next, null, { linger: 1200 });
            }
            await step(page, page.getByRole("button", { name: "Table" }), null);
            await step(page, button("Year-End Special, 2025"), null, { linger: 1500 });
            await step(page, page.getByRole("button", { name: "Export" }), null);
            await record(
                "dispatch video export start",
                page,
                page.getByRole("dialog").getByRole("button", { name: "Save video" }),
                null,
                { linger: 5000 },
            );
            await close();
        }
    }
    results.flows = Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, collect(v)]));
}

let failed = false;
for (const [name, run] of [
    ["cold", cold],
    ["switch", switches],
    ["flows", flows],
]) {
    if (!ONLY.includes(name)) continue;
    try {
        await run();
    } catch (error) {
        failed = true;
        console.error(`${name} failed:`, error.message);
    }
}
await browser.close();
if (failed) process.exitCode = 1;

const out = arg("json");
if (out) writeFileSync(out, JSON.stringify(results, null, 2));
const f = (n) => (n === null || n === undefined ? "-" : Math.round(n));
if (results.cold) {
    const c = results.cold;
    console.log(
        `cold start: FP ${f(c.fp)} ms, FCP ${f(c.fcp)} ms, DCL ${f(c.dcl)} ms, home ready ${f(c.interactive)} ms, longest task ${f(c.longest)} ms, TBT ${f(c.tbt)} ms`,
    );
}
if (results.switch) {
    console.log("\nroute switch (click to settled) | round 1 ms / longest task / TBT | round 3 ms / longest task");
    for (const name of Object.keys(results.switch[0])) {
        const a = results.switch[0][name];
        const c = results.switch[ROUNDS - 1][name];
        console.log(`${name} | ${f(a.ms)} / ${f(a.longest)} / ${f(a.tbt)} | ${f(c.ms)} / ${f(c.longest)}`);
    }
    console.log(`\nheap MB after GC: start ${results.heap.map((h) => h.toFixed(1)).join(" -> ")} (after each round)`);
}
if (results.flows) {
    console.log("\nflow | ms to settled | longest task | tasks | TBT | slowest input event");
    for (const [name, r] of Object.entries(results.flows)) {
        console.log(`${name} | ${f(r.ms)} | ${f(r.longest)} | ${f(r.count)} | ${f(r.tbt)} | ${f(r.slowestEvent)}`);
    }
}

if (PROFILE) {
    const top = (record, n, runs) =>
        Object.entries(record)
            .sort((a, b) => b[1] - a[1])
            .slice(0, n)
            .map(([k, ms]) => `    ${(ms / runs).toFixed(0).padStart(5)} ms  ${k}`)
            .join("\n");
    const entries = Object.entries(profiles).sort(
        (a, b) =>
            Object.values(b[1].self).reduce((x, y) => x + y, 0) / b[1].runs -
            Object.values(a[1].self).reduce((x, y) => x + y, 0) / a[1].runs,
    );
    for (const [name, p] of entries.slice(0, Number(arg("profile-top", 10)))) {
        const busy = Object.values(p.self).reduce((x, y) => x + y, 0) / p.runs;
        console.log(
            `\nprofile: ${name} (${busy.toFixed(0)} ms busy a run)\n  self time:\n${top(p.self, 10, p.runs)}\n  inclusive by file:\n${top(p.files, 10, p.runs)}`,
        );
    }
    if (out) writeFileSync(out.replace(/\.json$/, ".profiles.json"), JSON.stringify(profiles, null, 2));
}

if (process.argv.includes("--check")) {
    const budget = JSON.parse(readFileSync(new URL("./budgets.json", import.meta.url), "utf8")).runtime;
    const over = [];
    if (results.cold && results.cold.interactive > budget.coldReadyMs)
        over.push(`cold start ${f(results.cold.interactive)} ms`);
    for (const [name, r] of Object.entries(results.switch?.[0] ?? {})) {
        if (r.ms > budget.routeSwitchMs) over.push(`switch to ${name} ${f(r.ms)} ms`);
        const limit = budget.longTaskOverridesMs[`switch ${name}`] ?? budget.longTaskMs;
        if (r.longest > limit) over.push(`switch to ${name}: long task ${f(r.longest)} ms (budget ${limit})`);
    }
    for (const [name, r] of Object.entries(results.flows ?? {})) {
        const limit = budget.longTaskOverridesMs[name] ?? budget.longTaskMs;
        if (r.longest > limit) over.push(`${name}: long task ${f(r.longest)} ms (budget ${limit})`);
    }
    if (results.heap) {
        const growth = results.heap.at(-1) - results.heap[1];
        if (growth > budget.heapGrowthMB) over.push(`heap grew ${growth.toFixed(1)} MB after round 1`);
    }
    for (const line of over) console.error(`over budget: ${line}`);
    if (over.length) process.exit(1);
}
