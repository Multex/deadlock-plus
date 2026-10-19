import type { Page } from "@playwright/test";
import { open } from "./support/flows";
import { WINDOWS_UA } from "./support/platform";
import { expect, test } from "./support/test";

// Admin access is a Windows setting.
test.use({ userAgent: WINDOWS_UA });

const TITLE = "Admin access";

const main = (page: Page) => page.getByRole("main");
const control = (page: Page) => main(page).getByRole("group", { name: TITLE, exact: true });
const choice = (page: Page, name: "Ask each time" | "Always allow") =>
    control(page).getByRole("button", { name, exact: true });
const search = (page: Page) => page.getByRole("searchbox", { name: "Search settings" });

test.describe("without administrator rights", () => {
    test.use({ scenario: "unelevated" });

    test("the row sits under startup with Ask each time selected", async ({ page }) => {
        await open(page, "/settings/startup");

        await expect(main(page).getByRole("heading", { name: TITLE, exact: true })).toBeVisible();
        await expect(choice(page, "Ask each time")).toHaveAttribute("aria-pressed", "true");
        await expect(choice(page, "Always allow")).toHaveAttribute("aria-pressed", "false");
        await expect(choice(page, "Always allow")).toBeEnabled();
    });

    test("Always allow selects it, and Ask each time goes back", async ({ page }) => {
        await open(page, "/settings/startup");

        await choice(page, "Always allow").click();
        await expect(choice(page, "Always allow")).toHaveAttribute("aria-pressed", "true");
        await expect(choice(page, "Ask each time")).toHaveAttribute("aria-pressed", "false");

        await choice(page, "Ask each time").click();
        await expect(choice(page, "Ask each time")).toHaveAttribute("aria-pressed", "true");
        await expect(choice(page, "Always allow")).toHaveAttribute("aria-pressed", "false");
    });

    test("settings search finds the row", async ({ page }) => {
        await open(page, "/settings/appearance");
        await search(page).fill("admin");

        await expect(control(page)).toBeVisible();
    });
});

test("with administrator rights the row is not shown or found", async ({ page }) => {
    await open(page, "/settings/startup");
    await expect(main(page).getByRole("switch", { name: "Keep running in the tray" })).toBeVisible();
    await expect(main(page).getByText(TITLE, { exact: true })).toHaveCount(0);

    await search(page).fill("uac");
    await expect(main(page).getByText('No settings match "uac".')).toBeVisible();
    await expect(control(page)).toHaveCount(0);
});
