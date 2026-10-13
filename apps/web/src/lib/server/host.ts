import { SITE_URL } from "@deadlock-plus/links/urls";

const site = new URL(SITE_URL);

export function apexRedirect(url: URL): string | null {
    if (url.hostname !== `www.${site.hostname}`) return null;
    return `${site.origin}${url.pathname}${url.search}`;
}
