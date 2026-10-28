import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { pngSize, screenshotTags, sourceFiles } from "./crowdin-screenshots.mjs";

const APP = "locales/app/en.json";

describe("pngSize", () => {
    it("reads the width and height from the IHDR chunk", () => {
        const png = Buffer.alloc(24);
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
        png.writeUInt32BE(1480, 16);
        png.writeUInt32BE(900, 20);
        expect(pngSize(png)).toEqual({ width: 1480, height: 900 });
    });

    it("refuses a file that is not a PNG", () => {
        expect(() => pngSize(Buffer.from("GIF89a................."))).toThrow("not a PNG");
    });
});

describe("screenshotTags", () => {
    const ids = new Map([
        [`${APP}#nav.home`, 11],
        [`${APP}#nav.stats`, 12],
    ]);
    const size = { width: 100, height: 50 };
    const tag = (over) => ({ identifier: "nav.home", source: APP, x: 10, y: 10, width: 20, height: 10, ...over });

    it("gives each tag the Crowdin string id and its box", () => {
        expect(screenshotTags([tag()], ids, size)).toEqual([
            { stringId: 11, position: { x: 10, y: 10, width: 20, height: 10 } },
        ]);
    });

    it("clips a box that runs past the image edge and drops one left with no area", () => {
        expect(screenshotTags([tag({ x: 90, y: 45, width: 30, height: 30 })], ids, size)).toEqual([
            { stringId: 11, position: { x: 90, y: 45, width: 10, height: 5 } },
        ]);
        expect(screenshotTags([tag({ x: 100, y: 0 })], ids, size)).toEqual([]);
        expect(screenshotTags([tag({ x: -5, y: -5, width: 10, height: 10 })], ids, size)).toEqual([
            { stringId: 11, position: { x: 0, y: 0, width: 5, height: 5 } },
        ]);
    });

    it("leaves out ambiguous text and strings Crowdin does not have", () => {
        expect(screenshotTags([tag({ ambiguous: true }), tag({ identifier: "gone" })], ids, size)).toEqual([]);
    });

    it("keeps one tag per string and position", () => {
        const tags = [tag(), tag({ width: 30 }), tag({ identifier: "nav.stats" }), tag({ y: 30 })];
        expect(screenshotTags(tags, ids, size).map((t) => [t.stringId, t.position.y])).toEqual([
            [11, 10],
            [12, 10],
            [11, 30],
        ]);
    });
});

describe("sourceFiles", () => {
    const root = mkdtempSync(path.join(tmpdir(), "dp-crowdin-shots-"));
    afterAll(() => rmSync(root, { recursive: true, force: true }));

    it("lists the English file of every area folder", () => {
        for (const [area, file] of [
            ["tools", "en.json"],
            ["app", "en.json"],
            ["web", "de.json"],
        ]) {
            mkdirSync(path.join(root, area));
            writeFileSync(path.join(root, area, file), "{}");
        }
        expect(sourceFiles(root)).toEqual(["locales/app/en.json", "locales/tools/en.json"]);
    });
});
