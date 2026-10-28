import { DurableObject } from "cloudflare:workers";
import { Batcher } from "./batcher";

/** One instance holds every pending message, so all posts to the webhook share one rate limit. */
export class Relay extends DurableObject<{ DISCORD_WEBHOOK_URL: string }> {
    private batcher(): Batcher {
        return new Batcher(this.ctx.storage, this.env.DISCORD_WEBHOOK_URL);
    }

    override async fetch(request: Request): Promise<Response> {
        const body = (await request.json()) as { events: unknown[] };
        await this.batcher().receive(body.events);
        return new Response(null, { status: 204 });
    }

    override async alarm(): Promise<void> {
        await this.batcher().alarm();
    }
}
