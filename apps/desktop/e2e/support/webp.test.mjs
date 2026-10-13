import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shotFile, webpQuality } from "./webp.ts";

describe("shotFile", () => {
    it("names the full picture after the shot", () => {
        assert.equal(shotFile("match", "full"), "match.webp");
    });

    it("marks the detail crop as the phone's picture", () => {
        assert.equal(shotFile("discord-presence", "detail"), "discord-presence-mobile.webp");
    });
});

describe("webpQuality", () => {
    it("keeps the full picture's small text sharper than the detail crop's large text", () => {
        assert.equal(webpQuality("full"), 0.86);
        assert.equal(webpQuality("detail"), 0.8);
    });

    it("never asks for lossless, which Chromium picks at quality 1", () => {
        for (const kind of ["full", "detail"]) assert.ok(webpQuality(kind) < 1);
    });
});
