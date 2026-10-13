import type { Handle } from "@sveltejs/kit";
import { send } from "$lib/server/analytics";
import { pageview } from "$lib/server/visit";

export const handle: Handle = async ({ event, resolve }) => {
    const response = await resolve(event);
    const platform = event.platform;
    if (!platform) return response;

    const visit = pageview(event.request, {
        routeId: event.route.id,
        status: response.status,
        contentType: response.headers.get("content-type"),
        country: platform.cf?.country,
    });
    if (visit) platform.ctx.waitUntil(send(platform.env, [visit]));
    return response;
};
