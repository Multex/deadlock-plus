import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { OG_IMAGE, THEME_COLOR, socialMeta } from "./seo";

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)));

function oklchToHex(l: number, c: number, hue: number): string {
    const h = (hue * Math.PI) / 180;
    const a = c * Math.cos(h);
    const b = c * Math.sin(h);
    const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const linear = [
        4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
        -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
        -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
    ];
    const channels = linear.map((v) => {
        const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
        return Math.round(Math.min(1, Math.max(0, srgb)) * 255)
            .toString(16)
            .padStart(2, "0");
    });
    return `#${channels.join("")}`;
}

describe("socialMeta", () => {
    it("builds an absolute page address under the site's domain", () => {
        expect(socialMeta("/features").url).toBe("https://deadlockplus.app/features");
        expect(socialMeta("/").url).toBe("https://deadlockplus.app/");
    });

    it("builds an absolute image address under the site's domain", () => {
        expect(socialMeta("/download").image).toBe("https://deadlockplus.app/og.png");
    });
});

describe("the preview image", () => {
    it("is a PNG of the size the tags declare", () => {
        const png = read("../../../static/og.png");

        expect(png.subarray(0, 8).toString("latin1")).toBe("\u0089PNG\r\n\u001a\n");
        expect(png.subarray(12, 16).toString("latin1")).toBe("IHDR");
        expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({ width: 1200, height: 630 });
        expect({ width: OG_IMAGE.width, height: OG_IMAGE.height }).toEqual({ width: 1200, height: 630 });
    });

    it("is small enough for link scrapers", () => {
        expect(read("../../../static/og.png").byteLength).toBeLessThan(300_000);
    });
});

describe("THEME_COLOR", () => {
    it("matches the default theme's chrome colour", () => {
        const css = read("../../../../../packages/ui/src/theme.css").toString("utf8");
        const chrome = /--chrome:\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/.exec(css);

        if (!chrome) throw new Error("theme.css has no --chrome in oklch()");
        expect(THEME_COLOR).toBe(oklchToHex(Number(chrome[1]), Number(chrome[2]), Number(chrome[3])));
    });
});
