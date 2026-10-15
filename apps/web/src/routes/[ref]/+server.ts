import { error } from "@sveltejs/kit";
import { isLanding, slug } from "@deadlock-plus/links";
import { loadLinks } from "$lib/server/links";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, platform }) => {
    const path = slug(params.ref);
    if (!path) error(404, "Not found");
    const listed = isLanding(path, await loadLinks(platform?.env.TRANSPARENCY));
    // no-store: a cached redirect would skip this Worker, and a path removed from the table would keep working.
    return new Response(null, {
        status: 302,
        headers: { location: listed ? `/?ref=${path}` : "/", "cache-control": "no-store" },
    });
};
