import { describe, expect, it } from "vitest";
import { INVITES, LANDING_REFS, inviteRefFor, landingRef, slug } from "./index";

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
describe("inviteRefFor", () => {
    it("sends a TikTok landing ref to tiktok and a YouTube one to youtube", () => {
        for (const ref of ["tt", "tt-b", "tt-p", "TT"]) expect(inviteRefFor(ref)).toBe("tiktok");
        for (const ref of ["yt", "yt-b", "yt-p", "Yt-P"]) expect(inviteRefFor(ref)).toBe("youtube");
    });

    it("keeps a ref that has a web invite of its own", () => {
        for (const ref of ["reddit", "twitter", "github", "deadlock-api", "tiktok", "youtube", "website", "Reddit"]) {
            expect(inviteRefFor(ref)).toBe(ref.toLowerCase());
        }
    });

    it("sends everything else to website", () => {
        const withoutOwnInvite = ["bluesky", "steam", "app", "general"];
        for (const ref of [null, "", "ttx", "yt2", "tt-x", "tt-", "a".repeat(40), ...withoutOwnInvite]) {
            expect(inviteRefFor(ref)).toBe("website");
        }
    });

    it("maps every landing ref to a web invite that has a code of its own", () => {
        for (const ref of LANDING_REFS) {
            const invite = INVITES.find((i) => i.channel === "web" && i.ref === inviteRefFor(ref));
            expect(invite?.code, ref).toBeTruthy();
        }
    });
});
