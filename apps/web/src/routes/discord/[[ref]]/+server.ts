import { send } from "$lib/server/analytics";
import { loadLinks } from "$lib/server/links";
import { discordClick } from "$lib/server/visit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ request, params, platform }) => {
    const links = await loadLinks(platform?.env.TRANSPARENCY);
    const click = discordClick(request, params.ref, platform?.cf?.country, new Date(), links);
    if (click.event && platform) platform.ctx.waitUntil(send(platform.env, [click.event]));
    // no-store: a cached redirect would skip this Worker and the click would go uncounted.
    return new Response(null, { status: 302, headers: { location: click.location, "cache-control": "no-store" } });
};
