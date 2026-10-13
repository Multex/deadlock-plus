import { describe, expect, it } from "vitest";
import { LANDING_REFS, landingRef, slug } from "./index";

describe("landing refs", () => {
    it("lists only refs that pass slug unchanged", () => {
        for (const ref of LANDING_REFS) expect(slug(ref)).toBe(ref);
    });

    it("lists each ref once", () => {
        expect(new Set(LANDING_REFS).size).toBe(LANDING_REFS.length);
    });

    it("resolves a listed ref in any letter case", () => {
        expect(landingRef("tt")).toBe("tt");
        expect(landingRef("TT")).toBe("tt");
        expect(landingRef("YT-P")).toBe("yt-p");
    });

    it("rejects everything else", () => {
        for (const raw of [
            undefined,
            null,
            "",
            "reddit",
            "tiktok",
            "tiktok-bio",
            "yt-bio",
            "tt2",
            "t t",
            "tt/",
            "tt-",
            "..",
            "a".repeat(40),
        ]) {
            expect(landingRef(raw)).toBeNull();
        }
    });
});
