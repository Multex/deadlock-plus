import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stateOf, webShotName } from "./crowdin-capture.mjs";

describe("stateOf", () => {
    it("names a route by its path, with the root as home", () => {
        assert.equal(stateOf("/"), "home");
        assert.equal(stateOf("/match-history/990000056?tab=1"), "match-history-990000056");
    });
});

describe("webShotName", () => {
    it("puts the page first and the viewport width last", () => {
        assert.equal(webShotName("/", 390), "web-home-390");
        assert.equal(webShotName("/features", 1440, "tab-tools"), "web-features-tab-tools-1440");
        assert.equal(webShotName("/faq", 390, "p2"), "web-faq-p2-390");
    });
});
