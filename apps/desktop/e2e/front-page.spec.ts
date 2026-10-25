import type { Page } from "@playwright/test";
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
    // The suite runs with reduced motion, so the paper fades in place instead of being tossed.
    await expect(dialog).toHaveAttribute("data-toss", "fade");
    await expect(dialog).toHaveAttribute("data-landed", "");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
});

test("closes the front page from its Close button and from the table", async ({ page }) => {
    await open(page, `/match-history/${NEWEST}`);
    const button = page.getByRole("button", { name: "Front page", exact: true });
    const dialog = page.getByRole("dialog", { name: `Front page for match ${NEWEST}` });

    await button.click();
    await expect(dialog).toHaveAttribute("data-landed", "");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();

    await button.click();
    await expect(dialog.getByRole("heading", { level: 2 })).toBeVisible();
    await page.mouse.click(30, page.viewportSize()!.height - 30);
    await expect(dialog).toBeHidden();
});

test("closes the front page while it is still landing", async ({ page }) => {
    await open(page, `/match-history/${NEWEST}`);
    const button = page.getByRole("button", { name: "Front page", exact: true });
    await button.click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(button).toBeFocused();
});

interface PostgameWindow {
    __DEADLOCK_PLUS_DEMO__: { handle: { emit(event: string, payload: unknown): void } };
}

/** Stands in for the game capture at the end of the newest demo match. */
async function matchEnds(page: Page) {
    await page.evaluate((matchId) => {
        (window as unknown as PostgameWindow).__DEADLOCK_PLUS_DEMO__.handle.emit("postgame-match", {
            capturedAt: 0,
            accountId: 0,
            matchId,
            heroId: 0,
            startTime: 0,
            matchMode: 1,
            gameMode: 1,
            outcome: "win",
            kills: 0,
            deaths: 0,
            assists: 0,
            netWorth: 0,
            durationS: 0,
            rankBadge: 0,
            rankDelta: null,
            calibration: false,
            demotionProtected: false,
        });
    }, NEWEST);
}

test.describe("after a match", () => {
    test.use({ scenario: "post-match" });

    test("tosses the front page onto whatever page is open, once per match", async ({ page }) => {
        await open(page, "/stats");
        await matchEnds(page);
        const dialog = page.getByRole("dialog", { name: `Front page for match ${NEWEST}` });
        await expect(dialog.getByRole("heading", { level: 2, name: "Critics crown Vindicta" })).toBeVisible();
        await expect(dialog).toHaveAttribute("data-landed", "");
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();

        // A second capture of the same match only refreshes a paper that is still open.
        await matchEnds(page);
        await page.waitForTimeout(500);
        await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test("shows no front page with the setting off", async ({ page }) => {
        await open(page, "/settings/notifications");
        const toggle = page.getByRole("switch", { name: "Front page after each match" });
        await expect(toggle).toBeChecked();
        await toggle.click();
        await expect(toggle).not.toBeChecked();

        await matchEnds(page);
        await page.waitForTimeout(500);
        await expect(page.getByRole("dialog")).toHaveCount(0);
    });
});
