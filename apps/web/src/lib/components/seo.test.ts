import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { THEMES } from "$lib/content/themes";
import { OG_IMAGE, socialMeta } from "./seo";

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)));

describe("socialMeta", () => {
    it("builds an absolute page address under the site's domain", () => {
        expect(socialMeta("/features").url).toBe("https://deadlockplus.app/features");
        expect(socialMeta("/").url).toBe("https://deadlockplus.app/");
    });

    it("builds an absolute image address under the site's domain", () => {
        expect(socialMeta("/download").image).toBe("https://deadlockplus.app/og.png");
    });

    it("takes a page's own picture in place of the site's", () => {
        expect(socialMeta("/themes/void", "/og/themes/void.jpg").image).toBe(
            "https://deadlockplus.app/og/themes/void.jpg",
        );
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

/** Width and height from a JPEG's start-of-frame segment. */
function jpegSize(jpeg: Buffer): { width: number; height: number } | null {
    let at = 2;
    while (at + 9 < jpeg.length && jpeg[at] === 0xff) {
        const marker = jpeg[at + 1] ?? 0;
        if (marker >= 0xc0 && marker <= 0xc3)
            return { height: jpeg.readUInt16BE(at + 5), width: jpeg.readUInt16BE(at + 7) };
        at += 2 + jpeg.readUInt16BE(at + 2);
    }
    return null;
}

describe.each(THEMES.map((theme) => theme.id))("the %s theme's preview image", (id) => {
    const path = `../../../static/og/themes/${id}.jpg`;

    it("is a JPEG of the size the tags declare", () => {
        const jpeg = read(path);
        expect([...jpeg.subarray(0, 2)]).toEqual([0xff, 0xd8]);
        expect(jpegSize(jpeg)).toEqual({ width: OG_IMAGE.width, height: OG_IMAGE.height });
    });

    it("is small enough for link scrapers", () => {
        expect(read(path).byteLength).toBeLessThan(200_000);
    });
});
