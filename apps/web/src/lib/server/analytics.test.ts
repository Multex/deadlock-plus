import { buildEvent } from "@deadlock-plus/analytics";
import { describe, expect, it, vi } from "vitest";
import { send } from "./analytics";

const events = [buildEvent("discord_invite_click", {}, new Date("2026-10-13T12:00:00.000Z"))];

describe("send", () => {
    it("posts the batch with the Worker's PostHog key to its PostHog host", async () => {
        const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
        await send({ POSTHOG_KEY: "phc_key", POSTHOG_HOST: "https://eu.i.posthog.com/" }, events, fetcher);
        expect(fetcher).toHaveBeenCalledOnce();
        const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("https://eu.i.posthog.com/batch/");
        expect(JSON.parse(init.body as string)).toEqual({ api_key: "phc_key", batch: events });
    });

    it("sends nothing while either secret is unset", async () => {
        const fetcher = vi.fn(async () => new Response(null));
        await send({ POSTHOG_HOST: "https://eu.i.posthog.com" }, events, fetcher);
        await send({ POSTHOG_KEY: "phc_key" }, events, fetcher);
        expect(fetcher).not.toHaveBeenCalled();
    });
});
