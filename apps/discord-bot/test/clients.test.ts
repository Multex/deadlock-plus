import { DEFAULT_LINKS, INVITES } from "@deadlock-plus/links";
import { describe, expect, it, vi } from "vitest";
import { DiscordError, discordApi } from "../src/discord";
import { joinsByCode } from "../src/joins";
import { pollInvites, snapshot } from "../src/poll";

type Call = [string, RequestInit];

function fetcher(...responses: Response[]) {
    const queue = [...responses];
    return vi.fn(async (_input: string, _init?: RequestInit) => queue.shift() ?? new Response(null, { status: 500 }));
}

describe("discordApi", () => {
    it("lists the server's invites with their use counts", async () => {
        const f = fetcher(
            Response.json([
                { code: "abc", uses: 4, channel: { id: "1" } },
                { code: "def", uses: 0 },
                { nonsense: true },
            ]),
        );
        const api = discordApi("token", "guild", f);
        expect(await api.listInvites()).toEqual([
            { code: "abc", uses: 4 },
            { code: "def", uses: 0 },
        ]);
        const [url, init] = f.mock.calls[0] as Call;
        expect(url).toBe("https://discord.com/api/v10/guilds/guild/invites");
        expect(new Headers(init.headers).get("authorization")).toBe("Bot token");
    });

    it("creates an invite that never expires and has no use limit", async () => {
        const f = fetcher(Response.json({ code: "newCODE1" }));
        expect(await discordApi("token", "guild", f).createInvite("123")).toBe("newCODE1");
        const [url, init] = f.mock.calls[0] as Call;
        expect(url).toBe("https://discord.com/api/v10/channels/123/invites");
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body as string)).toEqual({ max_age: 0, max_uses: 0, unique: true });
    });

    it("revokes an invite", async () => {
        const f = fetcher(new Response(null, { status: 200 }));
        await discordApi("token", "guild", f).revokeInvite("abc");
        const [url, init] = f.mock.calls[0] as Call;
        expect(url).toBe("https://discord.com/api/v10/invites/abc");
        expect(init.method).toBe("DELETE");
    });

    it("posts a message to a channel and gives back its id", async () => {
        const f = fetcher(Response.json({ id: "999" }));
        expect(await discordApi("token", "guild", f).postMessage("123", { flags: 1 })).toBe("999");
        const [url, init] = f.mock.calls[0] as Call;
        expect(url).toBe("https://discord.com/api/v10/channels/123/messages");
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body as string)).toEqual({ flags: 1 });
    });

    it("throws Discord's status when it refuses", async () => {
        const api = discordApi("token", "guild", fetcher(new Response(null, { status: 403 })));
        await expect(api.createInvite("123")).rejects.toEqual(new DiscordError(403));
    });
});

const POSTHOG = { POSTHOG_PERSONAL_KEY: "phx", POSTHOG_PROJECT_ID: "295233" };

describe("joinsByCode", () => {
    it("counts joins in each window as the live count minus the last count before it", async () => {
        // code, earliest total, last total before 1 day, before 7 days, before 30 days
        const f = fetcher(
            Response.json({
                results: [
                    ["abc", 0, 10, 4, 1],
                    ["new", 0, null, null, null],
                ],
            }),
        );
        const live = new Map([
            ["abc", 12],
            ["new", 3],
        ]);
        const joins = await joinsByCode(POSTHOG, live, f);
        expect(joins?.get("abc")).toEqual({ day: 2, week: 8, month: 11 });
        expect(joins?.get("new")).toEqual({ day: 3, week: 3, month: 3 });

        const [url, init] = f.mock.calls[0] as Call;
        expect(url).toBe("https://eu.posthog.com/api/projects/295233/query/");
        expect(new Headers(init.headers).get("authorization")).toBe("Bearer phx");
    });

    it("counts from the earliest snapshot when the window is older than the snapshots", async () => {
        const f = fetcher(Response.json({ results: [["old", 60, 66, null, null]] }));
        const joins = await joinsByCode(POSTHOG, new Map([["old", 67]]), f);
        expect(joins?.get("old")).toEqual({ day: 1, week: 7, month: 7 });
    });

    it("counts a code with no snapshot at all from its live count", async () => {
        const joins = await joinsByCode(POSTHOG, new Map([["fresh", 2]]), fetcher(Response.json({ results: [] })));
        expect(joins?.get("fresh")).toEqual({ day: 2, week: 2, month: 2 });
    });

    it("gives nothing without the PostHog key or when PostHog refuses", async () => {
        expect(await joinsByCode({}, new Map(), fetcher())).toBeNull();
        vi.spyOn(console, "error").mockImplementation(() => {});
        expect(await joinsByCode(POSTHOG, new Map(), fetcher(new Response(null, { status: 401 })))).toBeNull();
    });
});

describe("snapshot", () => {
    const NOW = new Date("2026-10-15T12:00:00.000Z");

    it("labels each code with its ref and channel from the table", () => {
        const links = {
            ...DEFAULT_LINKS,
            invites: [...INVITES, { ref: "instagram", channel: "web", code: "ig1234" } as const],
        };
        const events = snapshot(
            [
                { code: "ig1234", uses: 3 },
                { code: "zzz", uses: 1 },
            ],
            links,
            NOW,
        );
        expect(events.map((e) => [e.event, e.properties.ref, e.properties.channel, e.properties.uses])).toEqual([
            ["discord_invite_uses", "instagram", "web", 3],
            ["discord_invite_uses", "unlisted", "direct", 1],
        ]);
    });

    it("keeps the event shape the PostHog dashboards read", () => {
        const [event] = snapshot([{ code: "652zsGZZgD", uses: 7 }], DEFAULT_LINKS, NOW);
        expect(event).toEqual({
            event: "discord_invite_uses",
            distinct_id: event?.distinct_id,
            timestamp: "2026-10-15T12:00:00.000Z",
            properties: {
                code: "652zsGZZgD",
                ref: "github",
                channel: "web",
                uses: 7,
                $process_person_profile: false,
                $geoip_disable: true,
            },
        });
    });
});

describe("pollInvites", () => {
    it("sends one snapshot event per live invite to PostHog", async () => {
        const f = fetcher(new Response(null, { status: 200 }));
        const api = { listInvites: async () => [{ code: "VR375cZwRJ", uses: 7 }] };
        await pollInvites({ POSTHOG_KEY: "phc", POSTHOG_HOST: "https://eu.i.posthog.com" }, api, DEFAULT_LINKS, f);
        const [url, init] = f.mock.calls[0] as Call;
        expect(url).toBe("https://eu.i.posthog.com/batch/");
        const batch = (JSON.parse(init.body as string) as { batch: { properties: Record<string, unknown> }[] }).batch;
        expect(batch[0]?.properties).toMatchObject({ code: "VR375cZwRJ", ref: "tiktok", uses: 7 });
    });
});
