import { describe, expect, it } from "vitest";
import {
    APP_INVITE_CODE,
    FALLBACK_CODE,
    INVITES,
    LANDINGS,
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
            { ref: "general", channel: "direct", code: "w8x6HGUefT" },
            { ref: "github", channel: "web", code: "652zsGZZgD" },
            { ref: "deadlock-api", channel: "web", code: "YCbXPdbekW" },
            { ref: "website", channel: "web", code: "KzWBUrQW3D" },
            { ref: "tiktok", channel: "web", code: "VR375cZwRJ" },
            { ref: "youtube", channel: "web", code: "Sa8PdZrVEa" },
            { ref: "reddit", channel: "web", code: "aTmYARWhdV" },
            { ref: "twitter", channel: "web", code: "tH5ZYTRGF5" },
            { ref: "bluesky", channel: "web", code: null },
            { ref: "steam", channel: "web", code: null },
        ]);
        expect(FALLBACK_CODE).toBe("w8x6HGUefT");
    });

    it("keeps the invite each website ref redirects to", () => {
        const codes = {
            website: "KzWBUrQW3D",
            github: "652zsGZZgD",
            "deadlock-api": "YCbXPdbekW",
            tiktok: "VR375cZwRJ",
            youtube: "Sa8PdZrVEa",
            reddit: "aTmYARWhdV",
            twitter: "tH5ZYTRGF5",
            bluesky: "KzWBUrQW3D",
            steam: "KzWBUrQW3D",
        };
        for (const [ref, code] of Object.entries(codes)) {
            expect(resolveWebRef(ref)).toEqual({ ref, code, known: true });
        }
        for (const ref of ["app", "general", "github-readme", "github-contributing", "somewhere-else"]) {
            expect(resolveWebRef(ref)).toEqual({ ref, code: "KzWBUrQW3D", known: false });
        }
        expect(resolveWebRef(undefined)).toEqual({ ref: "none", code: "w8x6HGUefT", known: false });
    });

    it("keeps every typed landing path and the invite it counts under", () => {
        expect(LANDINGS).toEqual([
            { path: "tt", ref: "tiktok" },
            { path: "tt-b", ref: "tiktok" },
            { path: "tt-p", ref: "tiktok" },
            { path: "yt", ref: "youtube" },
            { path: "yt-b", ref: "youtube" },
            { path: "yt-p", ref: "youtube" },
        ]);
        for (const { path, ref } of LANDINGS) expect(resolveWebRef(path).ref).toBe(ref);
    });

    it("keeps the support and repository URLs", () => {
        expect(SUPPORT_URL).toBe("https://ko-fi.com/flintsnow");
        expect(REPO_URL).toBe("https://github.com/deadlock-plus/deadlock-plus");
        expect(SITE_URL).toBe("https://deadlockplus.app");
    });
});
