// Captures the `/og` route of a running site as `static/og.png`, the picture shown when a link is shared.
// Usage: node scripts/og.mjs <base URL>
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// The website has no browser of its own; the desktop app's end-to-end tests already install Playwright.
const require = createRequire(new URL("../../desktop/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const WIDTH = 1200;
const HEIGHT = 630;

const base = process.argv[2];
if (!base) {
    console.error("Usage: node scripts/og.mjs <base URL>, for example http://localhost:5173");
    process.exit(1);
}

const out = fileURLToPath(new URL("../static/og.png", import.meta.url));
const browser = await chromium.launch({ channel: "msedge" });
try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    await page.goto(new URL("/og", base).href, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((image) => image.decode()));
    });
    await page.locator("[data-og]").screenshot({ path: out });
    console.log(`Wrote ${out}`);
} finally {
    await browser.close();
}
