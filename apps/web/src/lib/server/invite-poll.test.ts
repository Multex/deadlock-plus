import { describe, expect, it, vi } from "vitest";
import { pollInvites, snapshot } from "./invite-poll";

const NOW = new Date("2026-10-13T12:00:00.000Z");
const ENV = {
    POSTHOG_KEY: "phc_key",
    POSTHOG_HOST: "https://eu.i.posthog.com",
    DISCORD_BOT_TOKEN: "token",
    DISCORD_GUILD_ID: "123",
};

describe("snapshot", () => {
    it("labels a listed invite with its ref and channel", () => {
        const [event] = snapshot([{ code: "VM9utA3enT", uses: 42 }], NOW);
        expect(event?.event).toBe("discord_invite_uses");
        expect(event?.properties).toMatchObject({ code: "VM9utA3enT", ref: "app", channel: "app", uses: 42 });
    });

    it("labels the general invite as a direct link", () => {
        const [event] = snapshot([{ code: "w8x6HGUefT", uses: 9 }], NOW);
        expect(event?.properties).toMatchObject({ code: "w8x6HGUefT", ref: "general", channel: "direct", uses: 9 });
    });

    it("keeps an invite nobody listed, as a direct link", () => {
        const [event] = snapshot([{ code: "handmade", uses: 3 }], NOW);
        expect(event?.properties).toMatchObject({ code: "handmade", ref: "unlisted", channel: "direct", uses: 3 });
    });

    it("drops rows that are not invites", () => {
        expect(snapshot([{ code: 5, uses: 1 }, { code: "a" }, null, "x"], NOW)).toEqual([]);
    });
});

describe("pollInvites", () => {
    it("reads the server's invites as the bot and sends one snapshot batch", async () => {
        const fetcher = vi.fn(async (url: string | URL | Request) =>
            String(url).startsWith("https://discord.com/")
                ? Response.json([
                      { code: "VM9utA3enT", uses: 42 },
                      { code: "handmade", uses: 3 },
                  ])
                : new Response(null, { status: 200 }),
        );
        await pollInvites(ENV, fetcher, NOW);

        const [discordUrl, discordInit] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
        expect(discordUrl).toBe("https://discord.com/api/v10/guilds/123/invites");
        expect(new Headers(discordInit.headers).get("authorization")).toBe("Bot token");

        const [, batchInit] = fetcher.mock.calls[1] as unknown as [string, RequestInit];
        const batch = JSON.parse(batchInit.body as string).batch as { properties: { uses: number } }[];
        expect(batch.map((e) => e.properties.uses)).toEqual([42, 3]);
    });

    it("does nothing without a bot token or a server id", async () => {
        const fetcher = vi.fn(async () => new Response(null));
        await pollInvites({ ...ENV, DISCORD_BOT_TOKEN: undefined }, fetcher, NOW);
        await pollInvites({ ...ENV, DISCORD_GUILD_ID: undefined }, fetcher, NOW);
        expect(fetcher).not.toHaveBeenCalled();
    });

    it("sends nothing when Discord refuses", async () => {
        const fetcher = vi.fn(async () => new Response(null, { status: 403 }));
        await pollInvites(ENV, fetcher, NOW);
        expect(fetcher).toHaveBeenCalledOnce();
    });
});
