import type { Page } from "@playwright/test";
import { sidebarTo } from "./support/flows";
import { expect, settle, test } from "./support/test";

// A garbage maintenance time throws while Home formats it, which only the page's boundary can catch. If the
// page learns to survive it, pick another fault that throws in a render or an effect; a rejected promise
// never reaches a boundary.
const CRASHING_PAGE = "/";
const CRASH = "command:next_maintenance:garbage";
const pageContent = (page: Page) => page.getByRole("heading", { name: "Your Deadlock" });

const pageRegion = (page: Page) => page.locator('[data-region="page"][data-region-state="error"]');

async function clearFaults(page: Page) {
    await page.evaluate(() => {
        const demo = (window as unknown as { __DEADLOCK_PLUS_DEMO__: { handle: { clearFaults(): void } } })
            .__DEADLOCK_PLUS_DEMO__;
        demo.handle.clearFaults();
    });
}

test("a page that throws while rendering shows a calm error and keeps the sidebar working", async ({ page }) => {
    await page.goto(`${CRASHING_PAGE}?fault=${CRASH}`);
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
    await page.goto(`${CRASHING_PAGE}?fault=${CRASH}`);
    await settle(page);
    await expect(pageRegion(page)).toBeVisible();

    await clearFaults(page);
    await pageRegion(page).getByRole("button", { name: "Retry" }).click();
    await settle(page);

    await expect(pageRegion(page)).toHaveCount(0);
    await expect(pageContent(page)).toBeVisible();
});

test("going back to a broken page tries it again", async ({ page }) => {
    await page.goto(`${CRASHING_PAGE}?fault=${CRASH}`);
    await settle(page);
    await expect(pageRegion(page)).toBeVisible();

    await sidebarTo(page, "Stats", /\/stats$/);
    await clearFaults(page);
    await sidebarTo(page, "Home", /\/$/);

    await expect(pageRegion(page)).toHaveCount(0);
    await expect(pageContent(page)).toBeVisible();
});
