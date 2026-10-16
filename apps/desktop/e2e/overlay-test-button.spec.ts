import type { Page } from "@playwright/test";
import { open } from "./support/flows";
import { expect, test } from "./support/test";

interface DemoWindow {
    __DEADLOCK_PLUS_DEMO__: {
        handle: {
            emit(event: string, payload: unknown): void;
            set(command: string, handler: () => unknown): void;
        };
    };
    __releaseOverlayTest?: () => void;
}

/** Opens the game and makes the test command wait until the page calls `__releaseOverlayTest`. */
async function gameOpenWithHeldTest(page: Page) {
    await page.evaluate(() => {
        const demo = (window as unknown as DemoWindow).__DEADLOCK_PLUS_DEMO__.handle;
        demo.set(
            "show_overlay_test",
            () =>
                new Promise<null>((resolve) => {
                    (window as unknown as DemoWindow).__releaseOverlayTest = () => resolve(null);
                }),
        );
        demo.emit("overlay://status", { gameOpen: true, exclusiveFullscreen: false });
    });
}

const release = (page: Page) => page.evaluate(() => (window as unknown as DemoWindow).__releaseOverlayTest?.());

test.beforeEach(async ({ page }) => {
    await open(page, "/settings/overlay");
});

test("Show test is disabled while the game is not open", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Show test" })).toBeDisabled();
});

test("Show test counts down while the command runs, then comes back", async ({ page }) => {
    await gameOpenWithHeldTest(page);
    const button = page.getByRole("button", { name: "Show test" });
    await expect(button).toBeEnabled();

    await button.click();
    const counting = page.getByRole("button", { name: /^Showing in \d$/ });
    await expect(counting).toBeDisabled();
    await expect(counting).toHaveText("Showing in 3");
    await expect(counting).toHaveText("Showing in 2");
    await expect(counting).toHaveText("Showing in 1");
    await expect(counting).toBeDisabled();

    await release(page);
    await expect(page.getByRole("button", { name: "Show test" })).toBeEnabled();
});

test("Show test stays disabled until the command resolves, even past the countdown", async ({ page }) => {
    await gameOpenWithHeldTest(page);
    await page.getByRole("button", { name: "Show test" }).click();
    await page.waitForTimeout(3500);

    await expect(page.getByRole("button", { name: "Showing in 1" })).toBeDisabled();
    await release(page);
    await expect(page.getByRole("button", { name: "Show test" })).toBeEnabled();
});
