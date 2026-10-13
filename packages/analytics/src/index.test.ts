import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEvent, send } from "./index";

const NOW = new Date("2026-10-13T12:00:00.000Z");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("buildEvent", () => {
    it("is anonymous: a fresh id per event and no person profile", () => {
        const a = buildEvent("discord_invite_click", { ref: "github" }, NOW);
        const b = buildEvent("discord_invite_click", { ref: "github" }, NOW);
        expect(a.distinct_id).toMatch(UUID);
        expect(a.distinct_id).not.toBe(b.distinct_id);
        expect(a).toEqual({
            event: "discord_invite_click",
            distinct_id: a.distinct_id,
            timestamp: "2026-10-13T12:00:00.000Z",
            properties: { ref: "github", $process_person_profile: false, $geoip_disable: true },
        });
    });
});

describe("send", () => {
    const events = [buildEvent("discord_invite_click", {}, NOW)];

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("posts one JSON batch to the configured host", async () => {
        const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
        await send({ apiKey: "phc_key", host: "https://eu.i.posthog.com/", fetch: fetcher }, events);
        expect(fetcher).toHaveBeenCalledOnce();
        const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("https://eu.i.posthog.com/batch/");
        expect(init.method).toBe("POST");
        expect(init.headers).toEqual({ "content-type": "application/json" });
        expect(JSON.parse(init.body as string)).toEqual({ api_key: "phc_key", batch: events });
    });

    it("uses the global fetch when none is passed", async () => {
        const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
        vi.stubGlobal("fetch", fetcher);
        await send({ apiKey: "phc_key", host: "https://eu.i.posthog.com" }, events);
        expect(fetcher).toHaveBeenCalledOnce();
    });

    it("sends nothing without a key, a host or events", async () => {
        const fetcher = vi.fn(async () => new Response(null));
        await send({ host: "https://eu.i.posthog.com", fetch: fetcher }, events);
        await send({ apiKey: "phc_key", fetch: fetcher }, events);
        await send({ apiKey: "phc_key", host: "https://eu.i.posthog.com", fetch: fetcher }, []);
        expect(fetcher).not.toHaveBeenCalled();
    });

    it("never throws when the request fails", async () => {
        const fetcher = vi.fn(async () => {
            throw new Error("offline");
        });
        await expect(
            send({ apiKey: "phc_key", host: "https://eu.i.posthog.com", fetch: fetcher }, events),
        ).resolves.toBeUndefined();
    });
});
