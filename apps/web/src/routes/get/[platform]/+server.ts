import { error } from "@sveltejs/kit";
import { send } from "$lib/server/analytics";
import { loadReleases, type ReleaseCache } from "$lib/server/releases";
import { downloadClick, isDownloadPlatform } from "$lib/server/visit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ request, params, platform }) => {
    if (!isDownloadPlatform(params.platform)) error(404, "Not found");

    // The global fetch, not the request event's: nothing from the visitor's request reaches GitHub.
    const cache = platform?.caches?.default as ReleaseCache | undefined;
    const releases = await loadReleases(fetch, cache);
    const click = downloadClick(request, params.platform, releases, platform?.cf?.country);
    if (click.event && platform) platform.ctx.waitUntil(send(platform.env, [click.event]));
    // no-store: a cached redirect would skip this Worker and the download would go uncounted.
    return new Response(null, { status: 302, headers: { location: click.location, "cache-control": "no-store" } });
};
