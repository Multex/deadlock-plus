import { describe, expect, it } from "vitest";
import { GET } from "./+server";

type Event = Parameters<typeof GET>[0];

const ENVELOPE = '{"keyId":"2026-10","payload":"eyJ2ZXJzaW9uIjoxfQ","signature":"c2ln"}';

function get(stored: Record<string, string> | undefined): Promise<Response> {
    const platform =
        stored === undefined
            ? undefined
            : { env: { TRANSPARENCY: { get: async (key: string) => stored[key] ?? null } } };
    return Promise.resolve(GET({ platform } as unknown as Event));
}

describe("GET /announcements.json", () => {
    it("serves the stored feed exactly as the bot signed it", async () => {
        const response = await get({ announcements: ENVELOPE });
        expect(response.status).toBe(200);
        expect(await response.text()).toBe(ENVELOPE);
        expect(response.headers.get("content-type")).toBe("application/json");
        expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    });

    it("answers 404 while no feed is stored", async () => {
        expect((await get({})).status).toBe(404);
    });

    it("answers 404 without the KV namespace", async () => {
        expect((await get(undefined)).status).toBe(404);
    });
});
