import { describe, expect, it, vi } from "vitest";
import { countDownloads, loadStats, refreshStats, type Stats } from "./stats";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const EARLIER = "2026-10-15T11:00:00.000Z";
const ENV = {
    POSTHOG_PERSONAL_KEY: "phx_key",
    POSTHOG_PROJECT_ID: "295233",
    DISCORD_BOT_TOKEN: "token",
    DISCORD_GUILD_ID: "123",
};

const RELEASES = [
    {
        assets: [
            { name: "Deadlock-Plus_0.12.0_x64-setup.exe", download_count: 8 },
            { name: "Deadlock-Plus_0.12.0_amd64.AppImage", download_count: 2 },
            { name: "Deadlock-Plus_0.12.0_amd64.deb", download_count: 1 },
            { name: "Deadlock-Plus_0.12.0_x64-setup.exe.sig", download_count: 40 },
            { name: "latest.json", download_count: 11575 },
        ],
    },
    { assets: [{ name: "Deadlock-Plus_0.10.0_x64-setup.exe", download_count: 417 }] },
];

function memory(entries: Record<string, string> = {}) {
    const data = new Map(Object.entries(entries));
    return {
        data,
        get: async (key: string) => data.get(key) ?? null,
        put: async (key: string, value: string) => void data.set(key, value),
    };
}

function sources(overrides: Partial<Record<"posthog" | "github" | "discord", () => Response>> = {}) {
    return vi.fn(async (url: string | URL | Request) => {
        const href = String(url);
        if (href.startsWith("https://eu.posthog.com/")) {
            return overrides.posthog?.() ?? Response.json({ results: [[713, 402]] });
        }
        if (href.startsWith("https://api.github.com/")) {
            return overrides.github?.() ?? Response.json(RELEASES);
        }
        if (href.startsWith("https://discord.com/")) {
            return overrides.discord?.() ?? Response.json({ id: "123", approximate_member_count: 950 });
        }
        throw new Error(`unexpected ${href}`);
    });
}

describe("countDownloads", () => {
    it("counts installers only, never the updater's manifest or signatures", () => {
        expect(countDownloads(RELEASES)).toBe(428);
    });

    it("ignores rows that are not releases", () => {
        expect(countDownloads([null, { assets: "x" }, { assets: [{ name: "a.deb" }] }])).toBe(0);
    });
});

describe("refreshStats", () => {
    it("stores all four numbers with the time they were read", async () => {
        const store = memory();
        await refreshStats(ENV, store, sources(), NOW);

        const stats = JSON.parse(store.data.get("stats") ?? "{}") as Stats;
        const at = NOW.toISOString();
        expect(stats).toEqual({
            installs: { value: 713, at },
            monthlyActive: { value: 402, at },
            downloads: { value: 428, at },
            discordMembers: { value: 950, at },
        });
    });

    it("asks PostHog with the personal key and Discord as the bot", async () => {
        const fetcher = sources();
        await refreshStats(ENV, memory(), fetcher, NOW);

        const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
        const posthog = calls.find(([url]) => url.startsWith("https://eu.posthog.com/"));
        expect(posthog?.[0]).toBe("https://eu.posthog.com/api/projects/295233/query/");
        expect(new Headers(posthog?.[1].headers).get("authorization")).toBe("Bearer phx_key");

        const discord = calls.find(([url]) => url.startsWith("https://discord.com/"));
        expect(discord?.[0]).toBe("https://discord.com/api/v10/guilds/123?with_counts=true");
        expect(new Headers(discord?.[1].headers).get("authorization")).toBe("Bot token");
    });

    it("keeps the last good number when a source fails", async () => {
        const previous: Stats = {
            installs: { value: 700, at: EARLIER },
            monthlyActive: { value: 400, at: EARLIER },
            downloads: { value: 420, at: EARLIER },
            discordMembers: { value: 940, at: EARLIER },
        };
        const store = memory({ stats: JSON.stringify(previous) });
        const fetcher = sources({
            posthog: () => new Response(null, { status: 503 }),
            github: () => {
                throw new Error("offline");
            },
            discord: () => Response.json({ message: "Missing Access" }),
        });
        await refreshStats(ENV, store, fetcher, NOW);

        expect(JSON.parse(store.data.get("stats") ?? "{}")).toEqual(previous);
    });

    it("skips a source whose secrets are missing", async () => {
        const fetcher = sources();
        const store = memory();
        await refreshStats({}, store, fetcher, NOW);

        const stats = JSON.parse(store.data.get("stats") ?? "{}") as Stats;
        expect(Object.keys(stats)).toEqual(["downloads"]);
        expect(fetcher.mock.calls.every(([url]) => String(url).startsWith("https://api.github.com/"))).toBe(true);
    });

    it("reads every page of releases", async () => {
        const full = Array.from({ length: 100 }, () => ({ assets: [{ name: "a-setup.exe", download_count: 1 }] }));
        const fetcher = vi.fn(async (url: string | URL | Request) =>
            Response.json(new URL(String(url)).searchParams.get("page") === "1" ? full : RELEASES),
        );
        const store = memory();
        await refreshStats({}, store, fetcher, NOW);

        expect((JSON.parse(store.data.get("stats") ?? "{}") as Stats).downloads?.value).toBe(528);
    });
});

describe("loadStats", () => {
    it("returns nothing for a store that was never filled or holds junk", async () => {
        expect(await loadStats(memory())).toEqual({});
        expect(await loadStats(memory({ stats: "nope" }))).toEqual({});
    });
});
