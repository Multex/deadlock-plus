import { open } from "./support/flows";
import { expect, test } from "./support/test";

const NEWEST = 990000060;

test("opens the front page from a match and closes it with Escape", async ({ page }) => {
    await open(page, `/match-history/${NEWEST}`);
    const button = page.getByRole("button", { name: "Front page", exact: true });
    await button.click();

    const dialog = page.getByRole("dialog", { name: `Front page for match ${NEWEST}` });
    await expect(dialog.getByRole("heading", { level: 2, name: "Critics crown Vindicta" })).toBeVisible();
    await expect(dialog.getByRole("heading", { level: 1, name: "Deadlock+ Dispatch" })).toBeVisible();
    await expect(page.getByRole("main")).toHaveAttribute("inert", "");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
});

test("closes the front page from its Close button and from the table", async ({ page }) => {
    await open(page, `/match-history/${NEWEST}`);
    const button = page.getByRole("button", { name: "Front page", exact: true });
    const dialog = page.getByRole("dialog", { name: `Front page for match ${NEWEST}` });

    await button.click();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();

    await button.click();
    await expect(dialog.getByRole("heading", { level: 2 })).toBeVisible();
    await page.mouse.click(30, page.viewportSize()!.height - 30);
    await expect(dialog).toBeHidden();
});
