import type { Page } from "@playwright/test";
import { sidebarTo } from "./support/flows";
import { expect, settle, test } from "./support/test";

// What's new builds an IntersectionObserver while mounting, so a constructor that throws crashes that page.
// A rejected promise never reaches a boundary, so the crash has to come from a render or an effect; breaking
// a browser API keeps the trigger out of the product code. SvelteKit's link preloader builds one too, outside
// every boundary, but it always passes options and What's new passes none: only the bare call throws.
const CRASHING_PAGE = "/whats-new";
const pageContent = (page: Page) => page.getByRole("heading", { name: "What's new", exact: true });

const pageRegion = (page: Page) => page.locator('[data-region="page"][data-region-state="error"]');

type Breakable = { __E2E_BREAK_OBSERVER__?: boolean };

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        const flags = window as unknown as Breakable;
        flags.__E2E_BREAK_OBSERVER__ = true;
        const Real = window.IntersectionObserver;
        window.IntersectionObserver = class extends Real {
            constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
                if (flags.__E2E_BREAK_OBSERVER__ && options === undefined)
                    throw new Error("IntersectionObserver broken by the test");
                super(callback, options);
            }
        };
    });
});

async function clearFault(page: Page) {
    await page.evaluate(() => ((window as unknown as Breakable).__E2E_BREAK_OBSERVER__ = false));
}

test("a page that throws while rendering shows a calm error and keeps the sidebar working", async ({ page }) => {
    await page.goto(CRASHING_PAGE);
    await settle(page);

    const error = pageRegion(page);
    await expect(error).toBeVisible();
    await expect(error).toContainText("Couldn't show this page.");
    await expect(error.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByRole("navigation").getByRole("link", { name: "Home", exact: true })).toBeVisible();

    await sidebarTo(page, "Stats", /\/stats$/);
    await expect(pageRegion(page)).toHaveCount(0);
    await expect(page.getByRole("main")).not.toBeEmpty();
});

test("Retry renders the page again once the fault is gone", async ({ page }) => {
    await page.goto(CRASHING_PAGE);
    await settle(page);
    await expect(pageRegion(page)).toBeVisible();

    await clearFault(page);
    await pageRegion(page).getByRole("button", { name: "Retry" }).click();
    await settle(page);

    await expect(pageRegion(page)).toHaveCount(0);
    await expect(pageContent(page)).toBeVisible();
});

test("going back to a broken page tries it again", async ({ page }) => {
    await page.goto(CRASHING_PAGE);
    await settle(page);
    await expect(pageRegion(page)).toBeVisible();

    await sidebarTo(page, "Stats", /\/stats$/);
    await clearFault(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/whats-new$/);
    await settle(page);

    await expect(pageRegion(page)).toHaveCount(0);
    await expect(pageContent(page)).toBeVisible();
});
