// Captures the `/og` route of a running dev server as `static/og.png`, the picture shown when a link is shared, and
// `/og?theme=<id>` as `static/og/themes/<id>.jpg` for each theme's page.
// Usage: node scripts/og.mjs <base URL>
import { mkdirSync, readFileSync } from "node:fs";
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

const themes = JSON.parse(
    readFileSync(new URL("../../../packages/ui/src/themes.json", import.meta.url), "utf8"),
).themes;
const themeDir = new URL("../static/og/themes/", import.meta.url);
mkdirSync(themeDir, { recursive: true });

const shots = [
    { path: "/og", out: new URL("../static/og.png", import.meta.url) },
    // JPEG, since a theme's soft gradients and glow make a PNG several times the size scrapers accept.
    ...themes.map(({ id }) => ({ path: `/og?theme=${id}`, out: new URL(`${id}.jpg`, themeDir), jpeg: true })),
];

/** How long a theme's effects run before the picture is taken, so rain, snow and dust are on screen. */
const SETTLE_MS = 2500;
const JPEG_QUALITY = 86;

const browser = await chromium.launch({ channel: "msedge" });
try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    for (const shot of shots) {
        await page.goto(new URL(shot.path, base).href, { waitUntil: "networkidle" });
        await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all([...document.images].map((image) => image.decode()));
        });
        if (shot.path !== "/og") await page.waitForTimeout(SETTLE_MS);
        const out = fileURLToPath(shot.out);
        await page
            .locator("[data-og]")
            .screenshot(shot.jpeg ? { path: out, type: "jpeg", quality: JPEG_QUALITY } : { path: out });
        console.log(`Wrote ${out}`);
    }
} finally {
    await browser.close();
}
