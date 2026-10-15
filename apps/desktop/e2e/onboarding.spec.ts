import type { Page } from "@playwright/test";
import { expect, settle, test } from "./support/test";

test.use({ scenario: "new-user" });

const STEP_COUNT = 7;

/** What the setup saved, read back through the same key-value commands the app uses. */
function saved(page: Page, key: string): Promise<unknown> {
    return page.evaluate((key) => {
        const { handle } = (
            window as unknown as {
                __DEADLOCK_PLUS_DEMO__: { handle: { invoke(command: string, args: object): unknown } };
            }
        ).__DEADLOCK_PLUS_DEMO__;
        return handle.invoke("kv_get", { store: "app-settings", key });
    }, key);
}

const steps = (page: Page) => page.getByRole("list", { name: "Setup progress" }).getByRole("listitem");
const heading = (page: Page) => page.getByRole("main").getByRole("heading", { level: 1 });
const next = (page: Page) => page.getByRole("button", { name: "Next", exact: true });

async function expectStep(page: Page, index: number) {
    await expect(steps(page)).toHaveCount(STEP_COUNT);
    await expect(steps(page).nth(index)).toHaveAttribute("aria-current", "step");
    await expect(page.locator('[aria-current="step"]')).toHaveCount(1);
}

test("a first launch opens the setup, whichever page was asked for", async ({ page }) => {
    await page.goto("/stats");
    await page.waitForURL("**/onboarding");
    await settle(page);
    await expectStep(page, 0);
    await expect(heading(page)).toHaveText("Welcome to your new favourite Deadlock companion");
    await expect(page.getByRole("navigation")).toHaveCount(0);
    expect(await saved(page, "onboardingVersion")).toBeNull();
});

test("the setup runs from the welcome to Home and saves each answer", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/onboarding");
    await settle(page);
    const main = page.getByRole("main");

    await expectStep(page, 0);
    await expect(main.getByText("Deadlock found")).toBeVisible();
    await expect(page.getByRole("button", { name: "Back" })).toBeDisabled();
    await next(page).click();

    await expectStep(page, 1);
    await expect(heading(page)).toHaveText("What Deadlock+ does");
    for (const group of ["Play", "Progress", "News", "Housekeeping"]) {
        await expect(main.getByRole("heading", { level: 2, name: group, exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: "Back" }).click();
    await expectStep(page, 0);
    // Going back to the first step hands the keyboard to Next, so Enter moves on again.
    await expect(next(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expectStep(page, 1);
    await next(page).click();

    // The third step's wording depends on the platform the browser reports.
    await expectStep(page, 2);
    await next(page).click();

    await expectStep(page, 3);
    await expect(heading(page)).toHaveText("Your Steam account");
    await expect(main.getByText("No Steam account found")).toBeVisible();
    await next(page).click();

    await expectStep(page, 4);
    await expect(heading(page)).toHaveText("Help the Deadlock community?");
    await expect(main.getByRole("status")).toHaveText("Skip this and sharing stays off until you decide in Settings.");
    expect(await saved(page, "matchIngest")).toBeNull();
    await main.getByRole("button", { name: "Share my matches" }).click();
    await expect(main.getByRole("status")).toHaveText("Sharing is on. Saved.");
    await expect(main.getByRole("button", { name: "Share my matches" })).toHaveAttribute("aria-pressed", "true");
    expect(await saved(page, "matchIngest")).toBe(true);
    await main.getByRole("button", { name: "No thanks" }).click();
    await expect(main.getByRole("status")).toHaveText("Sharing is off. Saved.");
    expect(await saved(page, "matchIngest")).toBe(false);

    const usageData = main.getByRole("switch", { name: "Share anonymous usage data and error reports" });
    const usageBefore = await usageData.getAttribute("aria-checked");
    await usageData.click();
    await expect(usageData).not.toHaveAttribute("aria-checked", usageBefore!);
    expect(await saved(page, "telemetry")).toBe(usageBefore !== "true");
    expect(await saved(page, "telemetryNoticeShown")).toBe(true);
    await next(page).click();

    await expectStep(page, 5);
    await expect(heading(page)).toHaveText("Optional extras");
    const tray = main.getByRole("switch", { name: "Keep running in the tray" });
    const alerts = main.getByRole("switch", { name: "Patch and news alerts" });
    await expect(tray).toHaveAttribute("aria-checked", "false");
    await tray.click();
    await alerts.focus();
    await page.keyboard.press("Space");
    await expect(tray).toHaveAttribute("aria-checked", "true");
    await expect(alerts).toHaveAttribute("aria-checked", "true");
    // The extras are applied when the setup finishes, not as they are switched.
    expect(await saved(page, "closeToTray")).toBeNull();
    await next(page).click();

    await expectStep(page, 6);
    await expect(heading(page)).toHaveText("You're set.");
    await expect(page.getByRole("button", { name: "Skip" })).toHaveCount(0);
    expect(await saved(page, "onboardingVersion")).toBeNull();
    await page.getByRole("button", { name: "Finish" }).click();

    await page.waitForURL((url) => url.pathname === "/");
    await settle(page);
    await expect(page.getByRole("navigation").getByRole("link", { name: "Home" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Saved replays" })).toBeVisible();
    expect(await saved(page, "onboardingVersion")).toBe(2);
    expect(await saved(page, "closeToTray")).toBe(true);
    expect(await saved(page, "updateAlerts")).toBe(true);
    expect(await saved(page, "gcRecovery")).not.toBe(true);
    expect(await saved(page, "matchIngest")).toBe(false);

    await page.getByRole("navigation").getByRole("link", { name: "Stats" }).click();
    await expect(page).toHaveURL(/\/stats$/);
});

test("Escape skips the setup, lands on Home and leaves every choice unanswered", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/onboarding");
    await settle(page);
    await next(page).click();
    await expectStep(page, 1);

    await page.keyboard.press("Escape");

    await page.waitForURL((url) => url.pathname === "/");
    await settle(page);
    await expect(page.getByRole("link", { name: "Saved replays" })).toBeVisible();
    expect(await saved(page, "onboardingVersion")).toBe(2);
    expect(await saved(page, "matchIngest")).toBeNull();
    expect(await saved(page, "closeToTray")).toBeNull();
});

test("the last step can open Settings instead of Home", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/onboarding");
    await settle(page);
    for (let step = 0; step < STEP_COUNT - 1; step++) await next(page).click();
    await expectStep(page, STEP_COUNT - 1);

    await page.getByRole("main").getByRole("button", { name: "Settings", exact: true }).click();

    await expect(page).toHaveURL(/\/settings\/[a-z]+$/);
    expect(await saved(page, "onboardingVersion")).toBe(2);
});
