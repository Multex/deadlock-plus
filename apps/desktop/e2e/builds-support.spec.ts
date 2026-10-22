import type { Page } from "@playwright/test";
import { PRACTICE, openPracticeEditor, unpublishedBuild } from "./support/build-editor";
import { keepKvAcrossReloads, kvWrites, open } from "./support/flows";
import { expect, test } from "./support/test";

test.use({ viewport: { width: 1600, height: 1000 } });

const FOOTER = "Made with Deadlock+ - deadlockplus.app";

const support = (page: Page) => page.getByRole("switch", { name: "Support Deadlock+" });
const description = (page: Page) => page.getByTestId("inspector-build").getByRole("textbox", { name: "Description" });
const preview = (page: Page) => page.getByTestId("support-footer-preview");

async function savedChoice(page: Page): Promise<unknown> {
    const writes = await kvWrites(page);
    return writes.filter((w) => w.store === "app-settings" && w.key === "buildSupportFooter").at(-1)?.value;
}

async function openNewBuild(page: Page): Promise<string> {
    await open(page, "/builds");
    await page.getByRole("main").getByRole("tab", { name: "Mine", exact: true }).click();
    await page.getByRole("main").getByTestId("new-build").first().click();
    await expect(page).toHaveURL(/\/builds\/edit\?new=\d+$/);
    return page.url();
}

test("Support Deadlock+ adds the footer under the description, and Save to game writes both", async ({ page }) => {
    await keepKvAcrossReloads(page);
    await openPracticeEditor(page);
    await expect(support(page)).not.toBeChecked();
    await expect(preview(page)).toHaveCount(0);

    await description(page).fill("Rush Unstoppable");
    await support(page).click();
    await expect(support(page)).toBeChecked();
    await expect(preview(page)).toHaveText(FOOTER);
    await expect(description(page)).toHaveValue("Rush Unstoppable");

    await page.getByTestId("save-to-game").click();
    await expect(page.getByTestId("editor-status")).toHaveAttribute("data-state", "saved");
    expect((await unpublishedBuild(page, PRACTICE.id))?.description).toBe(`Rush Unstoppable\n\n${FOOTER}`);
    expect(await savedChoice(page)).toBe(true);

    await support(page).click();
    await expect(preview(page)).toHaveCount(0);
    await page.getByTestId("save-to-game").click();
    await expect(page.getByTestId("editor-status")).toHaveAttribute("data-state", "saved");
    expect((await unpublishedBuild(page, PRACTICE.id))?.description).toBe("Rush Unstoppable");
});

test("a new build starts without the footer, and with it once the player turned it on", async ({ page }) => {
    await keepKvAcrossReloads(page);
    const url = await openNewBuild(page);
    await expect(support(page)).not.toBeChecked();
    await expect(preview(page)).toHaveCount(0);

    await support(page).click();
    await expect(preview(page)).toHaveText(FOOTER);
    await expect.poll(() => savedChoice(page)).toBe(true);

    await open(page, url);
    await expect(support(page)).toBeChecked();
    await expect(preview(page)).toHaveText(FOOTER);
    await expect(description(page)).toHaveValue("");

    await support(page).click();
    await expect.poll(() => savedChoice(page)).toBe(false);
    await open(page, url);
    await expect(support(page)).not.toBeChecked();
    await expect(preview(page)).toHaveCount(0);
});
