import { send } from "$lib/server/analytics";
import { discordClick } from "$lib/server/visit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ request, params, platform }) => {
    const click = discordClick(request, params.ref, platform?.cf?.country);
    if (click.event && platform) platform.ctx.waitUntil(send(platform.env, [click.event]));
    // no-store: a cached redirect would skip this Worker and the click would go uncounted.
    return new Response(null, { status: 302, headers: { location: click.location, "cache-control": "no-store" } });
};
