import type { Page } from "@playwright/test";
import { open } from "./support/flows";
import { expect, test } from "./support/test";

const NEEDS_ADMIN = "Frame times need administrator access.";

const startCapture = (page: Page) => page.getByRole("button", { name: "Start", exact: true }).click();
const notice = (page: Page) => page.getByRole("alert").filter({ hasText: NEEDS_ADMIN });
const recording = (page: Page) => page.getByText(/^Recording · .+ · [1-9][\d,]* frames$/);

test.describe("without administrator rights", () => {
    test.use({ scenario: "unelevated" });

    test.beforeEach(async ({ page }) => {
        await open(page, "/performance");
    });

    test("a failed capture asks for administrator access with both buttons", async ({ page }) => {
        await startCapture(page);

        await expect(notice(page)).toBeVisible();
        await expect(notice(page).getByRole("button", { name: "Allow", exact: true })).toBeEnabled();
        await expect(notice(page).getByRole("button", { name: "Always allow", exact: true })).toBeEnabled();
        await expect(page.getByText("Frame recording needs administrator access.")).toHaveCount(0);
    });

    test("Allow restarts the capture and it records", async ({ page }) => {
        await startCapture(page);
        await notice(page).getByRole("button", { name: "Allow", exact: true }).click();

        await expect(notice(page)).toHaveCount(0);
        await expect(recording(page)).toBeVisible();
    });
});

test("with administrator rights a capture records and asks for nothing", async ({ page }) => {
    await open(page, "/performance");
    await startCapture(page);

    await expect(recording(page)).toBeVisible();
    await expect(page.getByText(NEEDS_ADMIN)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Always allow", exact: true })).toHaveCount(0);
});
