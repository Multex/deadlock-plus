import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
