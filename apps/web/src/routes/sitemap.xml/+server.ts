import { WEB_LOCALES } from "@deadlock-plus/links";
import { SITE_URL } from "@deadlock-plus/links/urls";
import { LOCALIZED_PAGES, alternates, localizedHref } from "$lib/i18n/routes";
import type { RequestHandler } from "./$types";

const ENGLISH_ONLY = ["/privacy", "/transparency"];

const PAGES = [
    ...LOCALIZED_PAGES.flatMap((path) => [path, ...WEB_LOCALES.map((locale) => localizedHref(path, locale))]),
    ...ENGLISH_ONLY,
];

function entry(path: string): string {
    const links = alternates(path)
        .map(
            (alternate) =>
                `<xhtml:link rel="alternate" hreflang="${alternate.hreflang}" href="${SITE_URL}${alternate.path}"/>`,
        )
        .join("");
    return `    <url><loc>${SITE_URL}${path}</loc>${links}</url>`;
}

// No <lastmod>: Google ignores it site-wide once it proves inaccurate, and no page has a real edit date.
const BODY = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${PAGES.map(entry).join("\n")}
</urlset>
`;

export const GET: RequestHandler = () =>
    new Response(BODY, {
        headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
    });
