import type { Page } from "@playwright/test";
import { open, sidebarTo, toast } from "./support/flows";
import { expect, test } from "./support/test";

const REGIONS = 27;
const BLOCKED_AT_START = 9;

const block = (page: Page, region: string) => page.getByRole("switch", { name: `Block ${region}`, exact: true });
const row = (page: Page, region: string) => page.getByRole("listitem", { name: region, exact: true });
const askForAdmin = (page: Page) => page.getByRole("alertdialog");
const toasts = (page: Page) => page.locator("[data-sonner-toast]");

async function openPicker(page: Page) {
    await open(page, "/server-picker");
    await expect(page.getByRole("switch")).toHaveCount(REGIONS);
    await expect(page.getByRole("switch", { checked: true })).toHaveCount(BLOCKED_AT_START);
}

// Coming back reads the blocks from the backend again, so only this proves the firewall took the change.
async function leaveAndReturn(page: Page) {
    await sidebarTo(page, "Mutes", /\/voice-bans$/);
    await sidebarTo(page, "Server Picker", /\/server-picker$/);
    await expect(page.getByRole("switch")).toHaveCount(REGIONS);
}

test.describe("without administrator access", () => {
    test.use({ scenario: "unelevated" });

    test.beforeEach(async ({ page }) => openPicker(page));

    test("a failed block leaves the switch showing the region open", async ({ page }) => {
        const amsterdam = block(page, "Amsterdam (Netherlands)");

        await amsterdam.click();
        await expect(toasts(page).or(askForAdmin(page)).first()).toBeVisible();

        await expect(amsterdam).not.toBeChecked();
        await expect(row(page, "Amsterdam (Netherlands)").getByText("Open", { exact: true })).toBeVisible();
    });

    test("a block that needs administrator access asks for it, naming the region", async ({ page }) => {
        await block(page, "Amsterdam (Netherlands)").click();

        const dialog = page.getByRole("alertdialog", { name: "Couldn't block Amsterdam (Netherlands)." });
        await expect(dialog).toBeVisible();
        await expect(
            dialog.getByText(
                "Deadlock+ needs administrator access to change firewall rules. Allow asks Windows once for this " +
                    "session. Always allow asks once, then never again on this Windows account.",
            ),
        ).toBeVisible();
        await expect(toasts(page)).toHaveCount(0);
    });

    test("Always allow blocks the region and the switch follows", async ({ page }) => {
        const amsterdam = block(page, "Amsterdam (Netherlands)");
        await amsterdam.click();

        await askForAdmin(page).getByRole("button", { name: "Always allow", exact: true }).click();

        await expect(askForAdmin(page)).toHaveCount(0);
        await expect(amsterdam).toBeChecked();
        await expect(row(page, "Amsterdam (Netherlands)").getByText("Blocked", { exact: true })).toBeVisible();

        await leaveAndReturn(page);
        await expect(amsterdam).toBeChecked();
        await expect(page.getByRole("switch", { checked: true })).toHaveCount(BLOCKED_AT_START + 1);
    });

    test("Cancel changes nothing and says nothing", async ({ page }) => {
        const amsterdam = block(page, "Amsterdam (Netherlands)");
        await amsterdam.click();

        await askForAdmin(page).getByRole("button", { name: "Cancel", exact: true }).click();

        await expect(askForAdmin(page)).toHaveCount(0);
        await expect(amsterdam).not.toBeChecked();
        await expect(row(page, "Amsterdam (Netherlands)").getByText("Open", { exact: true })).toBeVisible();
        await expect(toasts(page)).toHaveCount(0);

        await leaveAndReturn(page);
        await expect(amsterdam).not.toBeChecked();
    });

    test("Allow unblocks the region it was asked for", async ({ page }) => {
        const tokyo = block(page, "Tokyo (Japan)");
        await tokyo.click();
        await expect(tokyo).toBeChecked();

        await askForAdmin(page).getByRole("button", { name: "Allow", exact: true }).click();

        await expect(askForAdmin(page)).toHaveCount(0);
        await expect(tokyo).not.toBeChecked();

        await leaveAndReturn(page);
        await expect(tokyo).not.toBeChecked();
    });

    test("unblock all asks too and runs again once allowed", async ({ page }) => {
        await page.getByRole("button", { name: `Unblock all (${BLOCKED_AT_START})` }).click();
        await page
            .getByRole("alertdialog", { name: "Unblock all servers?" })
            .getByRole("button", { name: "Unblock all", exact: true })
            .click();

        await askForAdmin(page).getByRole("button", { name: "Always allow", exact: true }).click();

        await expect(toast(page, `Unblocked ${BLOCKED_AT_START} rules`)).toBeVisible();
        await expect(page.getByRole("switch", { checked: true })).toHaveCount(0);
    });
});

test("with administrator access a block goes straight through", async ({ page }) => {
    await openPicker(page);
    const amsterdam = block(page, "Amsterdam (Netherlands)");

    await amsterdam.click();

    await expect(amsterdam).toBeChecked();
    await expect(askForAdmin(page)).toHaveCount(0);
});
