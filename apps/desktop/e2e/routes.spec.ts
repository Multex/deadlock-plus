import type { Page } from "@playwright/test";
import { WINDOWS_UA } from "./support/platform";
import { isDynamic, matches, routePatterns, settingsCategories } from "./support/routes";
import { expect, settle, test } from "./support/test";

// Linux hides the Windows-only settings pages.
test.use({ userAgent: WINDOWS_UA });

const MATCH_DETAIL = "/match-history/[id]";
const SETTINGS = "/settings/[category=category]";

const patterns = routePatterns();
const categories = settingsCategories();

// How a pattern with a parameter becomes URLs. A new parametrised route with no entry here fails below.
const DYNAMIC = [MATCH_DETAIL, SETTINGS];

// Gaps in the demo, not in the page under test. Each entry is the exact failure seen.
const DEMO_GAPS: Record<string, string> = {};

async function visit(page: Page, path: string) {
    await page.goto(path);
    await settle(page);
    expect(new URL(page.url()).pathname, "the route redirected").toBe(path);
    await expect(page.getByRole("main")).toBeVisible();
}

function declare(path: string, body: (page: Page) => Promise<void>) {
    test(`${path} loads and settles`, async ({ page }) => {
        test.fixme(path in DEMO_GAPS, DEMO_GAPS[path]);
        await body(page);
    });
}

test("the route tree yields pages, and every parametrised one has a URL", () => {
    expect(patterns.length).toBeGreaterThan(0);
    expect(categories.length).toBeGreaterThan(0);
    expect(patterns.filter(isDynamic).sort()).toEqual([...DYNAMIC].sort());
});

for (const pattern of patterns.filter((pattern) => !isDynamic(pattern))) {
    declare(pattern, (page) => visit(page, pattern));
}

for (const category of categories) {
    declare(`/settings/${category}`, (page) => visit(page, `/settings/${category}`));
}

test("/settings opens the first settings category", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(new RegExp(`/settings/${categories[0]}$`));
    await settle(page);
    await expect(page.getByRole("main")).toBeVisible();
});

declare(MATCH_DETAIL, async (page) => {
    await page.goto("/match-history");
    await settle(page);
    const hrefs = await page.getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    const detail = hrefs.find((href) => href !== null && /^\/match-history\/\d+$/.test(href));
    expect(detail, "the match list links to no match").toBeTruthy();
    await visit(page, detail!);
});

test("every link in the app shell leads to a tested route", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const hrefs = await page
        .getByRole("navigation")
        .getByRole("link")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.filter((href) => !patterns.some((pattern) => matches(pattern, href)))).toEqual([]);
});

test("the settings menu lists exactly the tested categories", async ({ page }) => {
    await page.goto(`/settings/${categories[0]}`);
    await settle(page);
    const hrefs = await page
        .getByRole("link")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
    const listed = hrefs.filter((href) => href.startsWith("/settings/")).map((href) => href.split("/")[2]);
    expect([...new Set(listed)].sort()).toEqual([...categories].sort());
});
