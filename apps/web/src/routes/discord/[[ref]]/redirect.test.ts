import { beforeEach, describe, expect, it, vi } from "vitest";
import { INVITES } from "@deadlock-plus/links";
import { resetLinks } from "$lib/server/links";
import { GET } from "./+server";

const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36";
const ENV = { POSTHOG_KEY: "phc_key", POSTHOG_HOST: "https://eu.i.posthog.com" };

type Event = Parameters<typeof GET>[0];

async function get(ref: string | undefined, platform?: unknown): Promise<Response> {
    const path = ref === undefined ? "/discord" : `/discord/${ref}`;
    const request = new Request(`https://deadlockplus.example${path}`, { headers: { "user-agent": BROWSER } });
    return GET({ request, params: { ref }, platform } as unknown as Event);
}

beforeEach(() => resetLinks());

describe("GET /discord/<ref>", () => {
    const GENERAL = "w8x6HGUefT";
    const WEBSITE = "KzWBUrQW3D";
    const cases: [string | undefined, string][] = [
        [undefined, GENERAL],
        ["NOT A REF", GENERAL],
        ["unknown-thing", WEBSITE],
        ["discord-rpc", WEBSITE],
        ["tt-b", "VR375cZwRJ"],
        ["yt", "Sa8PdZrVEa"],
        ["website", "KzWBUrQW3D"],
        ["tiktok", "VR375cZwRJ"],
        ["youtube", "Sa8PdZrVEa"],
        ["reddit", "aTmYARWhdV"],
        ["twitter", "tH5ZYTRGF5"],
        ["github", "652zsGZZgD"],
        ["deadlock-api", "YCbXPdbekW"],
        ["bluesky", WEBSITE],
        ["steam", WEBSITE],
        ["app", WEBSITE],
        ["general", WEBSITE],
    ];

    it.each(cases)("answers 302 for %s to its own invite", async (ref, code) => {
        const response = await get(ref);
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe(`https://discord.gg/${code}`);
        expect(response.headers.get("cache-control")).toBe("no-store");
    });

    it("reads invites from the stored table", async () => {
        const stored = JSON.stringify({
            invites: [...INVITES, { ref: "instagram", channel: "web", code: "abcDEF12" }],
            landings: [{ path: "ig", ref: "instagram" }],
        });
        const platform = { env: { TRANSPARENCY: { get: async () => stored } }, ctx: { waitUntil: () => {} } };
        const response = await get("ig", platform);
        expect(response.headers.get("location")).toBe("https://discord.gg/abcDEF12");
    });

    it.each(["app", "general"])("does not count %s as a known web ref", async (ref) => {
        const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
        vi.stubGlobal("fetch", fetcher);
        const pending: Promise<unknown>[] = [];
        const platform = { env: ENV, ctx: { waitUntil: (p: Promise<unknown>) => pending.push(p) } };
        try {
            await get(ref, platform);
            await Promise.all(pending);
        } finally {
            vi.unstubAllGlobals();
        }
        const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
        const body = JSON.parse(init.body as string) as { batch: { properties: { known: boolean } }[] };
        expect(body.batch[0]?.properties.known).toBe(false);
    });

    it("records the click with the Worker's PostHog key and host", async () => {
        const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
        vi.stubGlobal("fetch", fetcher);
        const pending: Promise<unknown>[] = [];
        const platform = {
            env: ENV,
            cf: { country: "DE" },
            ctx: { waitUntil: (p: Promise<unknown>) => pending.push(p) },
        };
        try {
            await get("github", platform);
            await Promise.all(pending);
        } finally {
            vi.unstubAllGlobals();
        }

        const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("https://eu.i.posthog.com/batch/");
        const body = JSON.parse(init.body as string) as { api_key: string; batch: { event: string }[] };
        expect(body.api_key).toBe("phc_key");
        expect(body.batch.map((e) => e.event)).toEqual(["discord_invite_click"]);
    });
});
