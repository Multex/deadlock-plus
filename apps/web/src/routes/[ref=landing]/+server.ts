import { error } from "@sveltejs/kit";
import { landingRef } from "@deadlock-plus/links";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ params }) => {
    const ref = landingRef(params.ref);
    if (!ref) error(404, "Not found");
    // no-store: a cached redirect would skip this Worker, and a ref removed from the list would keep working.
    return new Response(null, { status: 302, headers: { location: `/?ref=${ref}`, "cache-control": "no-store" } });
};
