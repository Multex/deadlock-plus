import { describe, expect, it, vi } from "vitest";
import { GET } from "./+server";

const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36";
const ENV = { POSTHOG_KEY: "phc_key", POSTHOG_HOST: "https://eu.i.posthog.com" };

type Event = Parameters<typeof GET>[0];

async function get(ref: string | undefined, platform?: unknown): Promise<Response> {
    const path = ref === undefined ? "/discord" : `/discord/${ref}`;
    const request = new Request(`https://deadlockplus.example${path}`, { headers: { "user-agent": BROWSER } });
    return GET({ request, params: { ref }, platform } as unknown as Event);
}

describe("GET /discord/<ref>", () => {
    const refs = [
        undefined,
        "website",
        "github",
        "deadlock-api",
        "reddit",
        "youtube",
        "twitter",
        "bluesky",
        "steam",
        "app",
        "github-readme",
        "github-contributing",
        "never-listed",
        "NOT A REF",
    ];

    it.each(refs)("answers 302 to the invite for %s", async (ref) => {
        const response = await get(ref);
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("https://discord.gg/652zsGZZgD");
        expect(response.headers.get("cache-control")).toBe("no-store");
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
