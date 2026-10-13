import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "@playwright/test";
import { openShot, scrollInMain, SHOTS, type Detail } from "./shots";
import { settle, test } from "./test";
import { shotFile, webpQuality, type Kind } from "./webp";

const OUT = process.env.SCREENSHOTS_OUT ?? fileURLToPath(new URL("../../../web/static/screenshots/", import.meta.url));
const ONLY = process.env.SCREENSHOTS_ONLY;

// A phone shows the detail about 360 px wide: a region this wide keeps the app's text at three quarters of
// its size, and three image pixels per CSS pixel keep it sharp when the visitor zooms in.
const DETAIL_WIDTH = 480;
const DETAIL_RATIO = 5 / 4;
const DETAIL_SCALE = 3;
const DETAIL_PADDING = 12;
const EDGE = 16;

test.use({ deviceScaleFactor: Number(process.env.SCREENSHOTS_SCALE ?? 1) });

/**
 * Encodes a PNG as WebP in a blank page of the same browser, so no encoder has to be installed. The app
 * page is left alone: its next picture must not see a canvas.
 */
async function writeWebp(page: Page, png: Buffer, name: string, kind: Kind): Promise<void> {
    const blank = await page.context().newPage();
    const webp = await blank.evaluate(
        async ({ base64, quality }) => {
            const png = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
            const bitmap = await createImageBitmap(new Blob([png], { type: "image/png" }));
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
            // A browser without the encoder answers with a PNG instead of failing.
            if (blob?.type !== "image/webp") throw new Error("the browser cannot encode WebP");
            const bytes = new Uint8Array(await blob.arrayBuffer());
            let binary = "";
            for (let at = 0; at < bytes.length; at += 0x8000) {
                binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
            }
            return btoa(binary);
        },
        { base64: png.toString("base64"), quality: webpQuality(kind) },
    );
    await blank.close();
    writeFileSync(path.join(OUT, shotFile(name, kind)), Buffer.from(webp, "base64"));
}

function locate(page: Page, target: Detail["target"]): Locator {
    const found = "text" in target ? page.getByText(target.text) : page.getByRole(target.role, { name: target.name });
    return found.first();
}

interface Span {
    start: number;
    length: number;
}

/** Where a region `size` long starts on one axis, kept inside `bounds`. */
function place(element: Span, size: number, padding: number, centred: boolean, bounds: Span): number {
    const fits = element.length + 2 * padding <= size;
    const wanted = centred && fits ? element.start + element.length / 2 - size / 2 : element.start - padding;
    return Math.round(Math.max(bounds.start, Math.min(wanted, bounds.start + bounds.length - size)));
}

async function captureDetail(page: Page, detail: Detail): Promise<Buffer> {
    const window = page.viewportSize();
    if (detail.viewport && window) {
        await page.setViewportSize({ width: detail.viewport, height: window.height });
        await settle(page);
    }
    await detail.steps?.(page);
    const width = detail.width ?? DETAIL_WIDTH;
    const height = Math.round(width * DETAIL_RATIO);
    const padding = detail.padding ?? DETAIL_PADDING;
    const centred = detail.anchor !== "start";
    const target = locate(page, detail.target);

    const room = height - ((await target.boundingBox())?.height ?? 0);
    // The extra gap keeps the region clear of the border of the content area.
    await scrollInMain(target, centred && room >= 2 * padding ? room / 2 : padding + EDGE);
    await page.mouse.move(0, 0);
    await settle(page);

    const box = await target.boundingBox();
    const size = page.viewportSize();
    if (!box || !size) throw new Error(`the detail's element is not on the page: ${JSON.stringify(detail.target)}`);
    // A dialog is not part of the content area, so the window bounds it instead.
    const inside = await target.evaluate((element) => Boolean(element.closest("main")));
    const area = (inside && (await page.locator("main").boundingBox())) || { x: 0, y: 0, ...size };

    // The context's scale is the full picture's, so the browser is asked for this one region at its own.
    const session = await page.context().newCDPSession(page);
    const { data } = await session.send("Page.captureScreenshot", {
        format: "png",
        clip: {
            x: place({ start: box.x, length: box.width }, width, padding, centred, {
                start: area.x + 1,
                length: area.width - 2,
            }),
            y: place({ start: box.y, length: box.height }, height, padding, centred, {
                start: area.y + 1,
                length: area.height - 2,
            }),
            width,
            height,
            scale: DETAIL_SCALE,
        },
    });
    await session.detach();
    return Buffer.from(data, "base64");
}

for (const shot of SHOTS.filter((candidate) => !ONLY || candidate.name === ONLY)) {
    test.describe(shot.name, () => {
        test.use({ scenario: shot.scenario });

        test(`${shot.name} is written for the website`, async ({ page }) => {
            await openShot(page, shot);
            mkdirSync(OUT, { recursive: true });
            const full = await page.screenshot({ animations: "disabled", caret: "hide" });
            // Both pictures are taken first: a second page opening in between could change what the app shows.
            const detail = shot.detail && (await captureDetail(page, shot.detail));
            await writeWebp(page, full, shot.name, "full");
            if (detail) await writeWebp(page, detail, shot.name, "detail");
        });
    });
}
