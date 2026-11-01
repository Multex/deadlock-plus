import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
import type { DemoOptions } from "./e2e/support/test";

export default defineConfig<DemoOptions>({
    ...base,
    testMatch: "**/dispatch-monthly.spec.ts",
    workers: 1,
    use: {
        ...base.use,
        channel: undefined,
        launchOptions: { args: [] },
        freezeAnimations: false,
        reducedMotion: "no-preference",
    },
    projects: [
        { name: "chromium", use: { browserName: "chromium" } },
        { name: "webkit", use: { browserName: "webkit" } },
    ],
});
