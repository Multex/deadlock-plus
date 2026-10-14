import { describe, expect, it } from "vitest";
import type { Release } from "./releases";
import { discordClick, downloadClick, isBot, isDownloadPlatform, pageview, source } from "./visit";

const NOW = new Date("2026-10-13T12:00:00.000Z");
const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36";

function request(url: string, headers: Record<string, string> = {}, method = "GET"): Request {
    return new Request(url, { method, headers: { "user-agent": BROWSER, ...headers } });
}

describe("source", () => {
    it("reads the ref from the query and the domain from the referer", () => {
        const url = new URL("https://deadlockplus.example/?ref=Deadlock-API");
        expect(source(url, "https://www.deadlock-api.com/some/page?q=1")).toEqual({
            ref: "deadlock-api",
            referrer: "https://www.deadlock-api.com",
            referringDomain: "deadlock-api.com",
        });
    });

    it("falls back to utm_source", () => {
        expect(source(new URL("https://deadlockplus.example/?utm_source=reddit"), null).ref).toBe("reddit");
    });

    it("reports a visit with no referer as direct", () => {
        expect(source(new URL("https://deadlockplus.example/"), null)).toEqual({
            ref: null,
            referrer: "$direct",
            referringDomain: "$direct",
        });
    });

    it("reports an unparseable or non-web referer as direct", () => {
        expect(source(new URL("https://deadlockplus.example/"), "not a url").referringDomain).toBe("$direct");
        expect(source(new URL("https://deadlockplus.example/"), "android-app://com.reddit").referringDomain).toBe(
            "$direct",
        );
    });
});

describe("isBot", () => {
    it("flags link previewers, crawlers and empty agents", () => {
        for (const ua of [null, "", "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)", "curl/8.9"]) {
            expect(isBot(ua)).toBe(true);
        }
    });

    it("lets a browser through", () => {
        expect(isBot(BROWSER)).toBe(false);
    });
});

describe("user agent", () => {
    const page = { routeId: "/", status: 200, contentType: "text/html", country: "DE" };

    it("is forwarded as $raw_user_agent on every visitor event", () => {
        const url = "https://deadlockplus.example/";
        const events = [
            pageview(request(url), page, NOW),
            discordClick(request(url + "discord/github"), "github", undefined, NOW).event,
            downloadClick(request(url + "get/windows"), "windows", [], undefined, NOW).event,
        ];
        for (const event of events) expect(event?.properties.$raw_user_agent).toBe(BROWSER);
    });
});

describe("pageview", () => {
    const page = { routeId: "/", status: 200, contentType: "text/html; charset=utf-8", country: "DE" };

    it("records the page, the referring domain and the ref", () => {
        const req = request("https://deadlockplus.example/?ref=deadlock-api", {
            referer: "https://deadlock-api.com/",
        });
        const event = pageview(req, page, NOW);
        expect(event?.event).toBe("$pageview");
        expect(event?.properties).toMatchObject({
            $current_url: "https://deadlockplus.example/",
            $pathname: "/",
            $referrer: "https://deadlock-api.com",
            $referring_domain: "deadlock-api.com",
            ref: "deadlock-api",
            country: "DE",
        });
    });

    it("skips bots, non-GET requests, non-pages, errors and the invite redirect", () => {
        const url = "https://deadlockplus.example/";
        expect(pageview(request(url, { "user-agent": "Discordbot/2.0" }), page, NOW)).toBeNull();
        expect(pageview(request(url, {}, "POST"), page, NOW)).toBeNull();
        expect(pageview(request(url), { ...page, contentType: "application/json" }, NOW)).toBeNull();
        expect(pageview(request(url), { ...page, routeId: null }, NOW)).toBeNull();
        expect(pageview(request(url), { ...page, status: 404 }, NOW)).toBeNull();
        expect(pageview(request(url), { ...page, routeId: "/discord/[[ref]]" }, NOW)).toBeNull();
    });
});

describe("discordClick", () => {
    it("redirects a listed ref and records the click on the web channel", () => {
        const req = request("https://deadlockplus.example/discord/github", { referer: "https://github.com/" });
        const click = discordClick(req, "github", "US", NOW);
        expect(click.location).toMatch(/^https:\/\/discord\.gg\/[A-Za-z0-9]+$/);
        expect(click.event?.event).toBe("discord_invite_click");
        expect(click.event?.properties).toMatchObject({
            ref: "github",
            channel: "web",
            known: true,
            code: click.location.split("/").pop(),
            $referring_domain: "github.com",
            country: "US",
        });
    });

    it("still redirects a bot, without recording it", () => {
        const req = request("https://deadlockplus.example/discord/github", { "user-agent": "Twitterbot/1.0" });
        const click = discordClick(req, "github", undefined, NOW);
        expect(click.location).toMatch(/^https:\/\/discord\.gg\//);
        expect(click.event).toBeNull();
    });

    it("redirects a request with no ref", () => {
        const click = discordClick(request("https://deadlockplus.example/discord"), undefined, undefined, NOW);
        expect(click.location).toMatch(/^https:\/\/discord\.gg\//);
        expect(click.event?.properties).toMatchObject({ ref: "none", known: false });
    });
});

describe("downloadClick", () => {
    const BASE = "https://github.com/deadlock-plus/deadlock-plus/releases";
    const RELEASES: Release[] = [
        { version: "0.11.0", date: "2026-10-12T18:30:00Z", windows: `${BASE}/download/v0.11.0/setup.exe` },
        {
            version: "0.10.0",
            date: "2026-10-01T10:00:00Z",
            windows: `${BASE}/download/v0.10.0/setup.exe`,
            appImage: `${BASE}/download/v0.10.0/app.AppImage`,
            deb: `${BASE}/download/v0.10.0/app.deb`,
        },
    ];

    it("serves the newest file and records the click", () => {
        const req = request("https://deadlockplus.example/get/windows?ref=YT", {
            referer: "https://www.youtube.com/x",
        });
        const click = downloadClick(req, "windows", RELEASES, "DE", NOW);
        expect(click.location).toBe(`${BASE}/download/v0.11.0/setup.exe`);
        expect(click.event?.event).toBe("download_click");
        expect(click.event?.properties).toMatchObject({
            platform: "windows",
            version: "0.11.0",
            latest: true,
            ref: "yt",
            fallback: false,
            country: "DE",
            $referrer: "https://www.youtube.com",
            $referring_domain: "youtube.com",
        });
    });

    it("serves the version that was asked for", () => {
        const click = downloadClick(request("https://deadlockplus.example/get/windows?v=0.10.0"), "windows", RELEASES);
        expect(click.location).toBe(`${BASE}/download/v0.10.0/setup.exe`);
        expect(click.event?.properties).toMatchObject({ version: "0.10.0", latest: false, ref: null, fallback: false });
    });

    it("serves the newest release that has the file when the version is unknown or lacks it", () => {
        for (const v of ["9.9.9", "0.11.0", "", "https://evil.example/app.deb"]) {
            const url = `https://deadlockplus.example/get/deb?v=${encodeURIComponent(v)}`;
            const click = downloadClick(request(url), "deb", RELEASES);
            expect(click.location).toBe(`${BASE}/download/v0.10.0/app.deb`);
            expect(click.event?.properties).toMatchObject({ platform: "deb", version: "0.10.0", latest: false });
        }
        const click = downloadClick(request("https://deadlockplus.example/get/appimage"), "appimage", RELEASES);
        expect(click.location).toBe(`${BASE}/download/v0.10.0/app.AppImage`);
    });

    it("falls back to the latest release page when no release has the file", () => {
        const windowsOnly = RELEASES.slice(0, 1);
        for (const [platform, releases] of [
            ["windows", []],
            ["deb", windowsOnly],
            ["appimage", windowsOnly],
        ] as const) {
            const click = downloadClick(request(`https://deadlockplus.example/get/${platform}`), platform, releases);
            expect(click.location).toBe(`${BASE}/latest`);
            expect(click.event?.properties).toMatchObject({ platform, version: null, latest: false, fallback: true });
        }
    });

    it("never serves a URL from outside the project's release files", () => {
        const poisoned = [{ version: "0.12.0", date: "", windows: "https://evil.example/setup.exe" }, ...RELEASES];
        const click = downloadClick(request("https://deadlockplus.example/get/windows"), "windows", poisoned);
        expect(click.location).toBe(`${BASE}/download/v0.11.0/setup.exe`);
    });

    it("still redirects a bot, without recording it", () => {
        const req = request("https://deadlockplus.example/get/windows", { "user-agent": "Twitterbot/1.0" });
        const click = downloadClick(req, "windows", RELEASES);
        expect(click.location).toBe(`${BASE}/download/v0.11.0/setup.exe`);
        expect(click.event).toBeNull();
    });
});

describe("isDownloadPlatform", () => {
    it("accepts the three platforms and nothing else", () => {
        for (const name of ["windows", "deb", "appimage"]) expect(isDownloadPlatform(name)).toBe(true);
        for (const name of ["", "Windows", "appImage", "macos", "date", "version", "toString"]) {
            expect(isDownloadPlatform(name)).toBe(false);
        }
    });
});
