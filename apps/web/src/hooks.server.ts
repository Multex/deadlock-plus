import type { Handle } from "@sveltejs/kit";
import { PREPAINT_PLACEHOLDER, themePrepaint } from "$lib/content/themes";
import { localeOf } from "$lib/i18n/routes";
import { send } from "$lib/server/analytics";
import { apexRedirect } from "$lib/server/host";
import { preloadAsset } from "$lib/server/preload";
import { pageview } from "$lib/server/visit";

const prepaint = themePrepaint();

export const LANG_PLACEHOLDER = "%lang%";

export const handle: Handle = async ({ event, resolve }) => {
    const apex = apexRedirect(event.url);
    if (apex) return Response.redirect(apex, 301);

    const lang = localeOf(event.url.pathname);
    const response = await resolve(event, {
        transformPageChunk: ({ html }) => html.replace(PREPAINT_PLACEHOLDER, prepaint).replace(LANG_PLACEHOLDER, lang),
        preload: preloadAsset,
    });
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
