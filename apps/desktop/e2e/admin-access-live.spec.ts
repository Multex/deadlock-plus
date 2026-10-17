import type { Page } from "@playwright/test";
import { open } from "./support/flows";
import { expect, test } from "./support/test";

const NEEDS_ADMIN = "Live monitoring needs admin access";
const GAME_ADMIN = "Deadlock runs as admin";

const notice = (page: Page) => page.getByRole("alert").filter({ hasText: NEEDS_ADMIN });
const button = (page: Page, name: string) => notice(page).getByRole("button", { name, exact: true });

test.describe("without administrator rights", () => {
    test.use({ scenario: "unelevated" });

    test.beforeEach(async ({ page }) => {
        await open(page, "/live");
    });

    test("the monitor notice asks for admin access with both buttons", async ({ page }) => {
        await expect(notice(page)).toBeVisible();
        await expect(notice(page)).toContainText(
            "Live monitoring needs to watch your network traffic while Deadlock runs.",
        );
        await expect(notice(page)).not.toContainText("password");
        await expect(button(page, "Allow")).toBeEnabled();
        await expect(button(page, "Always allow")).toBeEnabled();
        await expect(page.getByText(GAME_ADMIN)).toHaveCount(0);
    });

    for (const name of ["Always allow", "Allow"]) {
        test(`${name} restarts the monitor and clears the notice`, async ({ page }) => {
            await button(page, name).click();

            // The demo monitor only traces again when restarted with a prompt after access was allowed.
            await expect(notice(page)).toHaveCount(0);
            await expect(page.getByText("Live monitoring needs to watch your network traffic")).toHaveCount(0);
        });
    }
});

test.describe("when Deadlock runs as administrator", () => {
    test.use({ scenario: "unelevated-game-admin" });

    test("the game card says to start Steam normally", async ({ page }) => {
        await open(page, "/live");

        const card = page.getByRole("alert").filter({ hasText: GAME_ADMIN });
        await expect(card).toBeVisible();
        await expect(card).toContainText("Start Steam normally to use live match data.");
        await expect(page.getByText("Deadlock is not running")).toHaveCount(0);
    });
});

test("with administrator rights the Live page asks for nothing", async ({ page }) => {
    await open(page, "/live");

    await expect(page.getByText(NEEDS_ADMIN)).toHaveCount(0);
    await expect(page.getByText(GAME_ADMIN)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Always allow", exact: true })).toHaveCount(0);
});
