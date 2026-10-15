import { SITE_URL } from "@deadlock-plus/links/urls";
import type { RequestHandler } from "./$types";

const PAGES = ["/", "/features", "/download", "/faq", "/privacy", "/transparency"];

// No <lastmod>: Google ignores it site-wide once it proves inaccurate, and no page has a real edit date.
const BODY = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map((path) => `    <url><loc>${SITE_URL}${path}</loc></url>`).join("\n")}
</urlset>
`;

export const GET: RequestHandler = () =>
    new Response(BODY, {
        headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
    });
