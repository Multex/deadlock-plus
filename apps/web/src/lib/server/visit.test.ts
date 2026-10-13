import { describe, expect, it } from "vitest";
import { discordClick, isBot, pageview, source } from "./visit";

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
