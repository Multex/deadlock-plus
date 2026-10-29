import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { pngSize, screenshotTags, sourceFiles, uploadEach } from "./crowdin-screenshots.mjs";

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

    it("scales boxes to the size Crowdin stored the image at and never sends one outside it", () => {
        const png = { width: 1480, height: 900 };
        const stored = { width: 1110, height: 675 };
        const tags = [
            tag({ x: 51, y: 801, width: 101, height: 17 }),
            tag({ identifier: "nav.stats", x: 583, y: 652, width: 149, height: 33 }),
            tag({ x: 1357, y: 879, width: 112, height: 15 }),
            tag({ identifier: "nav.stats", x: 1400, y: 899, width: 200, height: 40 }),
        ];
        const out = screenshotTags(tags, ids, png, stored);
        expect(out.map((t) => t.position)).toEqual([
            { x: 38, y: 601, width: 76, height: 13 },
            { x: 437, y: 489, width: 112, height: 25 },
            { x: 1018, y: 659, width: 84, height: 12 },
        ]);
        for (const { position: p } of out) {
            expect(p.x + p.width).toBeLessThanOrEqual(stored.width);
            expect(p.y + p.height).toBeLessThanOrEqual(stored.height);
        }
    });

    it("drops a clipped box with less than 2 px left on a side", () => {
        expect(screenshotTags([tag({ x: 99, y: 0 })], ids, size)).toEqual([]);
        expect(screenshotTags([tag({ x: 0, y: 49 })], ids, size)).toEqual([]);
        expect(screenshotTags([tag({ x: 98, y: 47 })], ids, size)).toEqual([
            { stringId: 11, position: { x: 98, y: 47, width: 2, height: 3 } },
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

describe("uploadEach", () => {
    it("reports a screenshot that fails and carries on with the rest", async () => {
        const done = [];
        const errors = [];
        const failed = await uploadEach(
            [{ file: "a.png" }, { file: "b.png" }, { file: "c.png" }],
            async (shot) => {
                if (shot.file === "b.png") throw new Error("PUT tags -> 400");
                done.push(shot.file);
            },
            (message) => errors.push(message),
        );
        expect(done).toEqual(["a.png", "c.png"]);
        expect(failed).toEqual(["b.png"]);
        expect(errors).toEqual(["b.png: PUT tags -> 400"]);
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
