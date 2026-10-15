import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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
        expect(locs.toSorted()).toEqual(PAGE_ROUTES.map((path) => `${SITE_URL}${path}`).toSorted());
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
