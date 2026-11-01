import { expect, test as base, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { cacheDir, createGameDataCache } from "./game-data-cache";

export interface DemoOptions {
    /** Id of the demo scenario the page starts on. */
    scenario: string;
    freezeAnimations: boolean;
}

// The demo still reads public game data and art at run time. Anything else leaving the page is a leak.
export const ALLOWED_HOSTS = ["api.deadlock-api.com", "assets-bucket.deadlock-api.com"];

// Public game data is fetched once and then read from disk, so a run with a warm cache needs no network.
// `E2E_OFFLINE=1` proves it: a URL that is not in the cache fails the test instead of being fetched.
const gameData = createGameDataCache({
    dir: cacheDir(
        fileURLToPath(new URL("../.cache/game-data/", import.meta.url)),
        readFileSync(new URL("./game-data.version", import.meta.url), "utf8"),
    ),
    offline: process.env.E2E_OFFLINE === "1",
});

const STILL = `*, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
}`;

interface Fixtures {
    problems: string[];
    /** URLs on the public game data hosts that this test's pages were answered for, from the cache. */
    served: string[];
}

export const test = base.extend<DemoOptions & Fixtures>({
    scenario: ["default", { option: true }],
    freezeAnimations: [true, { option: true }],

    served: async ({}, use) => use([]),

    problems: [
        async ({ context, baseURL, scenario, served, freezeAnimations }, use) => {
            const problems: string[] = [];
            const own = new URL(baseURL!).host;

            await context.addInitScript((id) => {
                (window as unknown as Record<string, unknown>).__DEADLOCK_PLUS_DEMO__ = { scenario: id };
            }, scenario);
            if (freezeAnimations) {
                await context.addInitScript((css) => {
                    const style = document.createElement("style");
                    style.textContent = css;
                    // The script runs before the document has a root element.
                    document.addEventListener("DOMContentLoaded", () => document.head.append(style));
                }, STILL);
            }

            await context.route("**/*", async (route) => {
                const request = route.request();
                const url = new URL(request.url());
                const local = url.protocol === "data:" || url.protocol === "blob:" || url.host === own;
                if (local) return route.continue();
                if (!ALLOWED_HOSTS.includes(url.host)) {
                    problems.push(`request to a host that is not allowed: ${url.origin}${url.pathname}`);
                    return route.abort("blockedbyclient");
                }
                if (request.method() !== "GET") {
                    problems.push(`only GET requests for game data can be cached: ${request.method()} ${url.href}`);
                    return route.abort("blockedbyclient");
                }
                try {
                    const entry = await gameData.get(url.href, async () => {
                        const response = await route.fetch();
                        return { status: response.status(), headers: response.headers(), body: await response.body() };
                    });
                    served.push(url.href);
                    // The page is on another origin than the data, and the stored headers leave this one out.
                    const headers = { ...entry.headers, "access-control-allow-origin": "*" };
                    return await route.fulfill({ status: entry.status, headers, body: entry.body });
                } catch (error) {
                    problems.push(error instanceof Error ? error.message : String(error));
                    return route.abort("failed");
                }
            });

            context.on("console", (message) => {
                const text = message.text();
                if (text.includes("[demo] unhandled command")) problems.push(text);
                else if (message.type() === "error") problems.push(`console error: ${text}`);
            });
            context.on("weberror", (error) => problems.push(`uncaught exception: ${error.error().message}`));

            await use(problems);

            expect([...new Set(problems)], "the page logged errors or reached outside the demo").toEqual([]);
        },
        { auto: true },
    ],
});

export { expect };

/** The route has drawn what it is going to draw: content is in, fonts and images are loaded, no skeleton is left. */
export async function settle(page: Page): Promise<void> {
    // Pages fill in from commands and from the public API after their first paint.
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(async () => {
        if (!document.querySelector("main")?.childElementCount) return false;
        await document.fonts.ready;
        // The app has no "busy" marker other than the skeleton's pulse class.
        return [...document.images].every((image) => image.complete) && !document.querySelector(".animate-pulse");
    });
}
