import { describe, expect, it } from "vitest";
import {
    APP_INVITE_CODE,
    FALLBACK_CODE,
    INVITES,
    REPO_URL,
    SITE_URL,
    SUPPORT_URL,
    inviteAppUrl,
    inviteUrl,
    resolveWebRef,
} from "./index";

describe("published links", () => {
    it("keeps the invite that shipped app builds open", () => {
        expect(APP_INVITE_CODE).toBe("VM9utA3enT");
        expect(inviteUrl(APP_INVITE_CODE)).toBe("https://discord.gg/VM9utA3enT");
        expect(inviteAppUrl(APP_INVITE_CODE)).toBe("discord://-/invite/VM9utA3enT");
    });

    it("keeps every invite, its channel and its code", () => {
        expect(INVITES).toEqual([
            { ref: "app", channel: "app", code: "VM9utA3enT" },
            { ref: "github-readme", channel: "direct", code: "652zsGZZgD" },
            { ref: "github-contributing", channel: "direct", code: "w8x6HGUefT" },
            { ref: "website", channel: "web", code: null },
            { ref: "github", channel: "web", code: null },
            { ref: "deadlock-api", channel: "web", code: null },
            { ref: "reddit", channel: "web", code: null },
            { ref: "youtube", channel: "web", code: null },
            { ref: "twitter", channel: "web", code: null },
            { ref: "bluesky", channel: "web", code: null },
            { ref: "steam", channel: "web", code: null },
        ]);
        expect(FALLBACK_CODE).toBe("652zsGZZgD");
    });

    it("keeps the invite each website ref redirects to", () => {
        const refs = ["website", "github", "deadlock-api", "reddit", "youtube", "twitter", "bluesky", "steam"];
        for (const ref of refs) {
            expect(resolveWebRef(ref)).toEqual({ ref, code: "652zsGZZgD", known: true });
        }
        for (const ref of ["app", "github-readme", "github-contributing", "somewhere-else"]) {
            expect(resolveWebRef(ref)).toEqual({ ref, code: "652zsGZZgD", known: false });
        }
        expect(resolveWebRef(undefined)).toEqual({ ref: "none", code: "652zsGZZgD", known: false });
    });

    it("keeps the support and repository URLs", () => {
        expect(SUPPORT_URL).toBe("https://ko-fi.com/flintsnow");
        expect(REPO_URL).toBe("https://github.com/deadlock-plus/deadlock-plus");
        expect(SITE_URL).toBe("https://deadlockplus.app");
    });
});
