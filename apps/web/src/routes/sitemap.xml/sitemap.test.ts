import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WEB_LOCALES } from "@deadlock-plus/links";
import { SITE_URL } from "@deadlock-plus/links/urls";
import { GET } from "./+server";

type Event = Parameters<typeof GET>[0];

const routes = fileURLToPath(new URL("..", import.meta.url));
const robots = readFileSync(fileURLToPath(new URL("../../../static/robots.txt", import.meta.url)), "utf8");

// `/og` is a page only on the dev server.
const PAGE_ROUTES = [
    "/",
    ...readdirSync(routes, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(`${routes}/${entry.name}/+page.svelte`))
        .map((entry) => `/${entry.name}`)
        .filter((path) => path !== "/og"),
];

async function sitemap(): Promise<{ response: Response; body: string; locs: string[] }> {
    const response = await GET({} as unknown as Event);
    const body = await response.text();
    const locs = [...body.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1] ?? "");
    return { response, body, locs };
}

describe("GET /sitemap.xml", () => {
    it("answers XML", async () => {
        const { response } = await sitemap();
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toMatch(/^application\/xml/);
    });

    it("lists every public page once, as an absolute URL", async () => {
        const { locs } = await sitemap();
        expect(PAGE_ROUTES).toEqual(
            expect.arrayContaining(["/", "/features", "/download", "/privacy", "/transparency"]),
        );
        const translated = (loc: string) =>
            WEB_LOCALES.some((locale) => loc === `${SITE_URL}/${locale}` || loc.startsWith(`${SITE_URL}/${locale}/`));
        const english = locs.filter((loc) => !translated(loc));
        expect(english.toSorted()).toEqual(PAGE_ROUTES.map((path) => `${SITE_URL}${path}`).toSorted());
        expect(new Set(locs).size).toBe(locs.length);
    });

    it("lists each translated page in every language, and the English-only pages in English alone", async () => {
        const { locs } = await sitemap();
        for (const locale of WEB_LOCALES) {
            for (const path of ["", "/features", "/download", "/faq"])
                expect(locs).toContain(`${SITE_URL}/${locale}${path}`);
            expect(locs).not.toContain(`${SITE_URL}/${locale}/privacy`);
            expect(locs).not.toContain(`${SITE_URL}/${locale}/transparency`);
        }
    });

    it("names each translated page's other languages, as its hreflang tags do", async () => {
        const { body } = await sitemap();
        expect(body).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
        const entry = body.match(new RegExp(`<url><loc>${SITE_URL}/de/faq</loc>(.*?)</url>`, "s"))?.[1] ?? "";
        const links = [...entry.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]);
        expect(links).toContainEqual(["x-default", `${SITE_URL}/faq`]);
        expect(links).toContainEqual(["pt-BR", `${SITE_URL}/pt-BR/faq`]);
        expect(links).toHaveLength(WEB_LOCALES.length + 2);
        const privacy = body.match(new RegExp(`<url><loc>${SITE_URL}/privacy</loc>(.*?)</url>`, "s"))?.[1];
        expect(privacy).toBe("");
    });

    it("leaves out redirects and the dev-only preview page", async () => {
        const { locs } = await sitemap();
        for (const path of ["/og", "/discord", "/get", "/tt"]) {
            expect(locs.some((loc) => loc.startsWith(`${SITE_URL}${path}`))).toBe(false);
        }
    });

    it("gives no lastmod, since no page has a true edit date", async () => {
        const { body } = await sitemap();
        expect(body).not.toContain("<lastmod>");
    });
});

describe("robots.txt", () => {
    it("points crawlers at the sitemap", () => {
        expect(robots).toMatch(new RegExp(`^Sitemap: ${SITE_URL}/sitemap\\.xml$`, "m"));
    });

    it.each(["/discord", "/get"])("keeps crawlers off the %s redirects", (path) => {
        expect(robots).toMatch(new RegExp(`^Disallow: ${path}$`, "m"));
    });
});
