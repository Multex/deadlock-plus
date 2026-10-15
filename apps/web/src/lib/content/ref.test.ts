import { describe, expect, it } from "vitest";
import { currentRef, discordHref, downloadHref, withRef } from "./ref";

describe("currentRef", () => {
    it("reads a valid ref", () => {
        expect(currentRef(new URL("https://x.test/?ref=tiktok"))).toBe("tiktok");
        expect(currentRef(new URL("https://x.test/?ref=TikTok-2"))).toBe("tiktok-2");
    });

    it("rejects a missing or malformed ref", () => {
        expect(currentRef(new URL("https://x.test/"))).toBeNull();
        expect(currentRef(new URL("https://x.test/?ref=a%20b"))).toBeNull();
        expect(currentRef(new URL(`https://x.test/?ref=${"a".repeat(33)}`))).toBeNull();
    });
});

describe("withRef", () => {
    it("adds the ref to internal paths", () => {
        expect(withRef("/download", "tiktok")).toBe("/download?ref=tiktok");
        expect(withRef("/", "tiktok")).toBe("/?ref=tiktok");
        expect(withRef("/features#live", "tiktok")).toBe("/features?ref=tiktok#live");
        expect(withRef("/a?x=1", "tiktok")).toBe("/a?x=1&ref=tiktok");
        expect(withRef("/a?x=1#h", "tiktok")).toBe("/a?x=1&ref=tiktok#h");
    });

    it("never double-adds", () => {
        expect(withRef("/a?ref=other", "tiktok")).toBe("/a?ref=other");
        expect(withRef("/a?x=1&ref=other#h", "tiktok")).toBe("/a?x=1&ref=other#h");
    });

    it("leaves other links alone", () => {
        expect(withRef("https://example.com/a", "tiktok")).toBe("https://example.com/a");
        expect(withRef("//example.com/a", "tiktok")).toBe("//example.com/a");
        expect(withRef("mailto:a@b.c", "tiktok")).toBe("mailto:a@b.c");
        expect(withRef("/download", null)).toBe("/download");
    });
});

describe("downloadHref", () => {
    it("builds the counting route", () => {
        expect(downloadHref("windows", "0.11.0", "tiktok")).toBe("/get/windows?v=0.11.0&ref=tiktok");
        expect(downloadHref("deb", "0.11.0", null)).toBe("/get/deb?v=0.11.0");
        expect(downloadHref("appimage", null, "tiktok")).toBe("/get/appimage?ref=tiktok");
        expect(downloadHref("windows", null, null)).toBe("/get/windows");
    });
});
describe("discordHref", () => {
    it("passes the visitor's ref on, so the server picks the invite from the current table", () => {
        expect(discordHref("tt-b")).toBe("/discord/tt-b");
        expect(discordHref("reddit")).toBe("/discord/reddit");
        expect(discordHref("discord-rpc")).toBe("/discord/discord-rpc");
    });

    it("uses the website invite for a visitor without a ref", () => {
        expect(discordHref(null)).toBe("/discord/website");
    });
});
