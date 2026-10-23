import type { Page } from "@playwright/test";
import { PRACTICE, openPracticeEditor } from "./support/build-editor";
import { open } from "./support/flows";
import { expect, test } from "./support/test";

test.use({ viewport: { width: 1600, height: 1000 } });

// The system clipboard is shared by every worker and by the person at the machine, so copies land in the page.
test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        let copied: string | null = null;
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {
                writeText: async (text: string) => {
                    copied = text;
                },
                readText: async () => copied ?? "",
            },
        });
    });
});

const copied = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

// Each step's number sits in its own span before the text.
const stepTexts = (page: Page) => page.getByTestId("paste-steps").locator("li > span:last-child");

const PASTE_STEPS = [
    "Switch to Abrams.",
    "Open the build menu.",
    "Click Build Browser.",
    "Click Create New Build.",
    "Click Paste Build.",
];

async function openPasteDialog(page: Page) {
    await page.getByTestId("paste-build-code").click();
    const dialog = page.getByTestId("paste-build-code-dialog");
    await expect(dialog.getByRole("heading", { name: "Open a build code" })).toBeVisible();
    return dialog;
}

test("Copy for game copies the build's code and shows the five steps to paste it in Deadlock", async ({ page }) => {
    await openPracticeEditor(page);
    await page.getByTestId("copy-for-game").click();

    const steps = page.getByTestId("paste-steps");
    await expect(steps.getByRole("heading", { name: "Build code copied" })).toBeVisible();
    await expect(stepTexts(page)).toHaveText(PASTE_STEPS);
    expect(await copied(page)).not.toBe("");

    await steps.getByRole("button", { name: "Done" }).click();
    await expect(steps).toBeHidden();

    // The help button shows the same steps again without copying.
    await page.getByTestId("copy-for-game-steps").click();
    await expect(steps.getByRole("heading", { name: "Paste a build in Deadlock" })).toBeVisible();
    await expect(stepTexts(page)).toHaveText(PASTE_STEPS);
});

test("Paste code opens a copied build code in the editor as a new draft", async ({ page }) => {
    await openPracticeEditor(page);
    const items = await page.locator('[role="application"] [data-item]').count();
    await page.getByTestId("copy-for-game").click();
    await page.getByTestId("paste-steps").getByRole("button", { name: "Done" }).click();
    const code = await copied(page);

    await open(page, "/builds");
    const dialog = await openPasteDialog(page);
    await dialog.getByTestId("build-code-field").fill(code);
    await dialog.getByTestId("build-code-open").click();

    await expect(page).toHaveURL(/\/builds\/edit\?source=draft&id=[^&]+$/);
    await expect(page.getByTestId("build-name")).toHaveValue(PRACTICE.name);
    await expect(page.locator('[role="application"] [data-item]')).toHaveCount(items);
});

test("Paste code needs a code, and a code that is not one says so until it is edited", async ({ page }) => {
    await open(page, "/builds");
    const dialog = await openPasteDialog(page);
    const field = dialog.getByTestId("build-code-field");
    const submit = dialog.getByTestId("build-code-open");

    await expect(submit).toBeDisabled();
    await field.fill("   ");
    await expect(submit).toBeDisabled();

    await field.fill("not a code!");
    await submit.click();
    await expect(dialog.getByRole("alert")).toHaveText(
        "That isn't a build code. In Deadlock, use Copy build to clipboard and paste the whole code.",
    );
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(page).not.toHaveURL(/\/builds\/edit/);

    await field.fill("not a code");
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await expect(field).toHaveAttribute("aria-invalid", "false");
});
