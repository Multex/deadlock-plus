import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const file = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const asset = (path: string) => readFileSync(file(`static${path}`));
const appHtml = readFileSync(file("src/app.html"), "utf8");

function pngSize(png: Buffer): { width: number; height: number } {
    expect(png.subarray(0, 8).toString("latin1")).toBe("\u0089PNG\r\n\u001a\n");
    return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

// Colour type 6 (RGBA) PNGs can be transparent; 2 (RGB) cannot.
const hasAlpha = (png: Buffer) => png[25] === 6 || png[25] === 4;

type Manifest = {
    name: string;
    short_name: string;
    display: string;
    theme_color: string;
    background_color: string;
    icons: { src: string; sizes: string; type: string }[];
};

describe("site.webmanifest", () => {
    const manifest = () => JSON.parse(asset("/site.webmanifest").toString("utf8")) as Manifest;

    it("names the site in the brand colours", () => {
        expect(manifest()).toMatchObject({
            name: "Deadlock+",
            short_name: "Deadlock+",
            display: "browser",
            theme_color: "#e6b557",
            background_color: "#120f0c",
        });
    });

    it("offers 192 and 512 pixel icons that exist at the sizes it declares", () => {
        const { icons } = manifest();
        expect(icons.map((icon) => icon.sizes).toSorted()).toEqual(["192x192", "512x512"]);
        for (const icon of icons) {
            const [width, height] = icon.sizes.split("x").map(Number);
            expect(icon.type).toBe("image/png");
            expect(pngSize(asset(icon.src))).toEqual({ width, height });
        }
    });
});

describe("the Apple touch icon", () => {
    it("is a 180 pixel square with no transparency, which iOS would fill with black", () => {
        const png = asset("/apple-touch-icon.png");
        expect(pngSize(png)).toEqual({ width: 180, height: 180 });
        expect(hasAlpha(png)).toBe(false);
    });
});

describe("favicon.ico", () => {
    it("exists, since browsers and crawlers request it without being told", () => {
        const ico = asset("/favicon.ico");
        expect(ico.readUInt16LE(0)).toBe(0);
        expect(ico.readUInt16LE(2)).toBe(1);
        const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + i * 16] || 256);
        expect(sizes).toEqual(expect.arrayContaining([16, 32, 48]));
    });
});

describe("app.html", () => {
    it.each([
        ['rel="icon" href="%sveltekit.assets%/favicon.ico" sizes="48x48"'],
        ['rel="icon" href="%sveltekit.assets%/favicon.png" type="image/png" sizes="64x64"'],
        ['rel="apple-touch-icon" href="%sveltekit.assets%/apple-touch-icon.png"'],
        ['rel="manifest" href="%sveltekit.assets%/site.webmanifest"'],
    ])("links %s", (link) => {
        expect(appHtml).toContain(`<link ${link}`);
    });

    it("links only files that exist", () => {
        for (const [, path] of appHtml.matchAll(/href="%sveltekit\.assets%(\/[^"]+)"/g)) {
            expect(existsSync(file(`static${path}`)), path).toBe(true);
        }
    });
});
