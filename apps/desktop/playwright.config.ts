import { defineConfig } from "@playwright/test";
import os from "node:os";
import process from "node:process";
import type { DemoOptions } from "./e2e/support/test";

// Not 1420/1421 (`tauri dev`) or 5173 (the website's dev server).
const PORT = Number(process.env.E2E_PORT ?? 4310);
const CI = Boolean(process.env.CI);
// `pnpm screenshots` sets this: the run then writes the website's pictures and checks nothing else.
const SCREENSHOTS = process.env.SCREENSHOTS === "1";

// Windows hands a below-normal class down to the workers, the browsers and the demo server, so a local run
// yields to whatever else the machine is doing.
if (!CI) os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL);

export default defineConfig<DemoOptions>({
    testDir: "e2e",
    testMatch: SCREENSHOTS ? "**/*.capture.ts" : "**/*.spec.ts",
    outputDir: "test-results",
    // Baselines exist for Windows only, so the file name carries no platform and no browser.
    snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
    forbidOnly: CI,
    retries: 0,
    // Every test gets its own page and its own demo backend, and game data comes from the local cache,
    // so tests share nothing. The screenshots still compare at 0 pixels with eight pages at once.
    // Each worker drives a software-rasterised browser. `E2E_WORKERS` overrides the local count.
    workers: CI ? 4 : Number(process.env.E2E_WORKERS) || 6,
    fullyParallel: true,
    reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
    timeout: 30_000,
    expect: {
        timeout: 10_000,
        // Three runs in a row differed from the baselines by 0 pixels, and one changed digit moves 16,
        // so any allowance would hide real changes.
        toHaveScreenshot: { maxDiffPixels: 0 },
    },
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        // The installed browser; nothing is downloaded.
        channel: process.env.E2E_CHANNEL ?? (process.platform === "win32" ? "msedge" : "chrome"),
        // GPU rasterising moved 8 to 18 pixels of small icons between runs; software rasterising moves none.
        launchOptions: { args: ["--disable-gpu"] },
        viewport: { width: 1480, height: 900 },
        deviceScaleFactor: 1,
        locale: "en-US",
        timezoneId: "UTC",
        colorScheme: "dark",
        reducedMotion: "reduce",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        scenario: "default",
    },
    webServer: {
        command: "node e2e/support/demo.mjs build preview",
        url: `http://127.0.0.1:${PORT}`,
        env: { VITE_DEMO: "1", DEMO_PORT: String(PORT), DEMO_LOG_LEVEL: "error" },
        reuseExistingServer: !CI,
        timeout: 180_000,
        stdout: "ignore",
        stderr: "pipe",
    },
});
