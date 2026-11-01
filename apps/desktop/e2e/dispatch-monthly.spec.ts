import { keepKvAcrossReloads, open, sidebarTo } from "./support/flows";
import { expect, test } from "./support/test";

test.use({ scenario: "dispatch", timezoneId: "UTC" });

test("a resolved font-ready promise with a loading status cannot freeze the monthly", async ({ page }) => {
    await open(page, "/dispatch");
    await page.evaluate(() => {
        const ready = Promise.resolve(document.fonts);
        Object.defineProperties(document.fonts, {
            status: { configurable: true, get: () => "loading" },
            ready: { configurable: true, get: () => ready },
        });
    });
    await page.getByRole("button", { name: /^Monthly, September 2026, No\. 2/ }).click();
    await expect(page.locator("[data-reader]")).toBeVisible();
    await sidebarTo(page, "Home", /\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the monthly reveal, page turns and a restart leave navigation responsive", async ({ page }, testInfo) => {
    await keepKvAcrossReloads(page);
    await open(page, "/dispatch");
    await page.getByRole("button", { name: /^Monthly, September 2026, No\. 2/ }).click();

    const reader = page.locator("[data-reader]");
    const bar = page.locator("[data-reader-bar]");
    const next = page.getByRole("button", { name: "Next pages", exact: true });
    const previous = page.getByRole("button", { name: "Previous pages", exact: true });
    await expect(reader).toBeVisible();
    await expect(bar).not.toHaveAttribute("inert");
    await expect(previous).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath("monthly-cover.png") });

    await next.click();
    await expect(reader).toHaveAttribute("data-spread", "1");
    await next.click();
    await expect(reader).toHaveAttribute("data-spread", "2");
    await expect(next).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath("monthly-inside.png") });

    await page.getByRole("main").getByRole("button", { name: "Close", exact: true }).click();
    await expect(reader).toHaveAttribute("data-spread", "0");
    await expect(previous).toBeDisabled();

    await page.reload();
    await expect(reader).toBeVisible();
    await expect(bar).not.toHaveAttribute("inert");
    await sidebarTo(page, "Home", /\/$/);
    await sidebarTo(page, "Dispatch", /\/dispatch/);
    await expect(page.getByRole("main")).toBeVisible();
});
