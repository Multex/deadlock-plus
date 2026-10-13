import { describe, expect, it } from "vitest";
import { snapshot } from "./invite-poll";
import { discordClick, downloadClick, pageview } from "./visit";

const NOW = new Date("2026-10-13T12:00:00.000Z");
const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36";
const ANONYMOUS = { $process_person_profile: false, $geoip_disable: true };

function request(url: string, referer: string): Request {
    return new Request(url, { headers: { "user-agent": BROWSER, referer } });
}

describe("event names and properties the dashboards read", () => {
    it("$pageview", () => {
        const event = pageview(
            request("https://deadlockplus.example/features?ref=reddit", "https://www.reddit.com/r/x"),
            { routeId: "/features", status: 200, contentType: "text/html", country: "DE" },
            NOW,
        );
        expect(event).toEqual({
            event: "$pageview",
            distinct_id: event?.distinct_id,
            timestamp: "2026-10-13T12:00:00.000Z",
            properties: {
                $current_url: "https://deadlockplus.example/features",
                $host: "deadlockplus.example",
                $pathname: "/features",
                $referrer: "https://www.reddit.com",
                $referring_domain: "reddit.com",
                ref: "reddit",
                country: "DE",
                ...ANONYMOUS,
            },
        });
    });

    it("discord_invite_click", () => {
        const { event } = discordClick(
            request("https://deadlockplus.example/discord/github", "https://github.com/x/y"),
            "github",
            "US",
            NOW,
        );
        expect(event).toEqual({
            event: "discord_invite_click",
            distinct_id: event?.distinct_id,
            timestamp: "2026-10-13T12:00:00.000Z",
            properties: {
                ref: "github",
                channel: "web",
                known: true,
                code: "652zsGZZgD",
                $referrer: "https://github.com",
                $referring_domain: "github.com",
                country: "US",
                ...ANONYMOUS,
            },
        });
    });

    it("download_click", () => {
        const file = "https://github.com/deadlock-plus/deadlock-plus/releases/download/v0.11.0/setup.exe";
        const { event } = downloadClick(
            request("https://deadlockplus.example/get/windows?v=0.11.0&ref=tt", "https://deadlockplus.example/x"),
            "windows",
            [{ version: "0.11.0", date: "2026-10-12T18:30:00Z", windows: file }],
            "US",
            NOW,
        );
        expect(event).toEqual({
            event: "download_click",
            distinct_id: event?.distinct_id,
            timestamp: "2026-10-13T12:00:00.000Z",
            properties: {
                platform: "windows",
                version: "0.11.0",
                latest: true,
                ref: "tt",
                fallback: false,
                $referrer: "https://deadlockplus.example",
                $referring_domain: "deadlockplus.example",
                country: "US",
                ...ANONYMOUS,
            },
        });
    });

    it("discord_invite_uses", () => {
        const [event] = snapshot([{ code: "w8x6HGUefT", uses: 7 }], NOW);
        expect(event).toEqual({
            event: "discord_invite_uses",
            distinct_id: event?.distinct_id,
            timestamp: "2026-10-13T12:00:00.000Z",
            properties: { code: "w8x6HGUefT", ref: "github-contributing", channel: "direct", uses: 7, ...ANONYMOUS },
        });
    });
});
