import { webhookTarget } from "./discord";

export { Relay } from "./relay";

export interface Env {
    DISCORD_WEBHOOK_URL: string;
    PATH_SECRET: string;
    RELAY: DurableObjectNamespace;
}

function status(code: number, headers?: HeadersInit): Response {
    return new Response(null, { status: code, headers });
}

function unwrap(payload: object): unknown[] {
    const events = (payload as { events?: unknown }).events;
    return Array.isArray(events) && events.length > 0 ? events : [payload];
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        if (!env.PATH_SECRET || !env.DISCORD_WEBHOOK_URL) return status(500);
        if (new URL(request.url).pathname !== `/${env.PATH_SECRET}`) return status(404);
        if (request.method !== "POST") return status(405, { allow: "POST" });

        let payload: unknown;
        try {
            payload = await request.json();
        } catch {
            return status(400);
        }
        if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return status(400);

        try {
            webhookTarget(env.DISCORD_WEBHOOK_URL);
        } catch {
            console.error("DISCORD_WEBHOOK_URL is not a valid URL");
            return status(500);
        }

        try {
            const relay = env.RELAY.get(env.RELAY.idFromName("discord"));
            const res = await relay.fetch("https://relay/events", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ events: unwrap(payload) }),
            });
            if (!res.ok) throw new Error(`relay answered ${res.status}`);
        } catch {
            console.error("Could not queue the events");
            return status(503);
        }
        return status(204);
    },
};
