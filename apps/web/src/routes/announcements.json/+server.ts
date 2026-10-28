import type { RequestHandler } from "./$types";

/** The Discord bot writes and signs this key; the app checks the signature, so the site passes it on untouched. */
const ANNOUNCEMENTS_KEY = "announcements";

export const GET: RequestHandler = async ({ platform }) => {
    const feed = await platform?.env.TRANSPARENCY?.get(ANNOUNCEMENTS_KEY);
    // The app reads a 404 as "no announcements".
    if (feed == null) return new Response("Not found", { status: 404 });
    return new Response(feed, {
        headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
    });
};
