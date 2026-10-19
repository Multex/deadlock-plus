import type { Page } from "@playwright/test";
import { LINUX_UA, WINDOWS_UA } from "./support/platform";
import { expect, settle, test } from "./support/test";

test.use({ userAgent: WINDOWS_UA });

const heading = (page: Page) => page.getByRole("main").getByRole("heading", { level: 1 });
const next = (page: Page) => page.getByRole("button", { name: "Next", exact: true });

async function openPermissions(page: Page) {
    await page.goto("/onboarding");
    await settle(page);
    await next(page).click();
    await next(page).click();
    const steps = page.getByRole("list", { name: "Setup progress" }).getByRole("listitem");
    await expect(steps.nth(2)).toHaveAttribute("aria-current", "step");
}

/** The route the demo backend reports, read through the same command the app uses. */
function route(page: Page): Promise<unknown> {
    return page.evaluate(async () => {
        const { handle } = (
            window as unknown as {
                __DEADLOCK_PLUS_DEMO__: { handle: { invoke(command: string, args: object): unknown } };
            }
        ).__DEADLOCK_PLUS_DEMO__;
        return ((await handle.invoke("admin_access_status", {})) as { route: string }).route;
    });
}

test.describe("unelevated", () => {
    test.use({ scenario: "unelevated" });

    test("the permissions step offers Always allow and Ask me later with neither picked", async ({ page }) => {
        await openPermissions(page);
        const main = page.getByRole("main");
        await expect(heading(page)).toHaveText("Administrator access");
        await expect(main.getByRole("button", { name: /^Always allow/ })).toHaveAttribute("aria-pressed", "false");
        await expect(main.getByRole("button", { name: /^Ask me later/ })).toHaveAttribute("aria-pressed", "false");
        await expect(next(page)).toBeEnabled();
    });

    test("Always allow applies, lights its card, greys the other and says how to undo it", async ({ page }) => {
        await openPermissions(page);
        const main = page.getByRole("main");
        const always = main.getByRole("button", { name: /^Always allow/ });
        const later = main.getByRole("button", { name: /^Ask me later/ });

        await always.click();

        await expect(always).toHaveAttribute("aria-pressed", "true");
        await expect(later).toBeDisabled();
        await expect(main.getByRole("status")).toHaveText(
            "Always allow is on. Windows won't ask again on this account. You can turn it off in Settings > Startup and background.",
        );
        await expect(next(page)).toBeEnabled();
        expect(await route(page)).toBe("service");

        // The grant outlives the step: coming back shows it applied.
        await page.getByRole("button", { name: "Back" }).click();
        await next(page).click();
        await expect(main.getByRole("button", { name: /^Always allow/ })).toHaveAttribute("aria-pressed", "true");
    });

    test("Ask me later is picked without a Windows prompt", async ({ page }) => {
        await openPermissions(page);
        const main = page.getByRole("main");
        const later = main.getByRole("button", { name: /^Ask me later/ });

        await later.click();

        await expect(later).toHaveAttribute("aria-pressed", "true");
        await expect(main.getByRole("button", { name: /^Always allow/ })).toHaveAttribute("aria-pressed", "false");
        await expect(main.getByRole("status")).toHaveCount(0);
        await expect(next(page)).toBeEnabled();
        expect(await route(page)).toBe("needsPermission");
    });
});

test("with no buttons to show the step explains administrator access without them", async ({ page }) => {
    await openPermissions(page);
    await expect(heading(page)).toHaveText("Administrator access");
    await expect(page.getByRole("main")).not.toContainText("work without asking");
    await expect(page.getByRole("main").getByRole("button", { name: /^Ask me later/ })).toHaveCount(0);
});

test.describe("on Linux", () => {
    test.use({ scenario: "unelevated", userAgent: LINUX_UA });

    test("an unelevated app keeps the Linux step as it was", async ({ page }) => {
        await openPermissions(page);
        await expect(heading(page)).toHaveText("Running on Linux");
        await expect(page.getByRole("main").getByRole("button", { name: /^Ask me later/ })).toHaveCount(0);
    });
});
