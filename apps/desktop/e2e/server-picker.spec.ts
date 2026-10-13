import type { Page } from "@playwright/test";
import { expect, settle, test } from "./support/test";

const REGIONS = 27;
const BLOCKED_AT_START = 9;

const block = (page: Page, region: string) => page.getByRole("switch", { name: `Block ${region}`, exact: true });
const blocked = (page: Page) => page.getByRole("switch", { checked: true });
const unblockAll = (page: Page, count: number) => page.getByRole("button", { name: `Unblock all (${count})` });

test.beforeEach(async ({ page }) => {
    await page.goto("/server-picker");
    await settle(page);
    await expect(page.getByRole("switch")).toHaveCount(REGIONS);
    await expect(blocked(page)).toHaveCount(BLOCKED_AT_START);
});

// The page shows a change at once, before the backend has taken it. Coming back to the page reads the
// blocks from the backend again, so only this proves the change was sent.
async function leaveAndReturn(page: Page) {
    await page.getByRole("link", { name: "Storage", exact: true }).click();
    await expect(page).toHaveURL(/\/storage$/);
    await page.getByRole("link", { name: "Server Picker", exact: true }).click();
    await expect(page.getByRole("switch")).toHaveCount(REGIONS);
}

test("blocking a region turns its toggle on, counts it, and survives leaving the page", async ({ page }) => {
    const amsterdam = block(page, "Amsterdam (Netherlands)");
    await expect(amsterdam).not.toBeChecked();

    await amsterdam.click();

    await expect(amsterdam).toBeChecked();
    await expect(unblockAll(page, BLOCKED_AT_START + 1)).toBeVisible();

    await leaveAndReturn(page);
    await expect(amsterdam).toBeChecked();
    await expect(blocked(page)).toHaveCount(BLOCKED_AT_START + 1);
});

test("unblocking a region turns its toggle off, counts it out, and survives leaving the page", async ({ page }) => {
    const tokyo = block(page, "Tokyo (Japan)");
    await expect(tokyo).toBeChecked();

    await tokyo.click();

    await expect(tokyo).not.toBeChecked();
    await expect(unblockAll(page, BLOCKED_AT_START - 1)).toBeVisible();

    await leaveAndReturn(page);
    await expect(tokyo).not.toBeChecked();
    await expect(blocked(page)).toHaveCount(BLOCKED_AT_START - 1);
});

test("applying a preset blocks every region outside it", async ({ page }) => {
    await page.getByRole("button", { name: "Presets", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Presets" });
    await expect(dialog.getByText("Only 9 open · blocks 18 of 27 regions")).toBeVisible();

    await dialog.getByRole("button", { name: "Apply preset EU only", exact: true }).click();

    await expect(unblockAll(page, 18)).toBeVisible();

    await leaveAndReturn(page);
    await expect(blocked(page)).toHaveCount(18);
    await expect(block(page, "London (England)")).not.toBeChecked();
    await expect(block(page, "Atlanta (Georgia)")).toBeChecked();
});

test("the filter narrows the list to matching regions and clearing it brings them back", async ({ page }) => {
    const filter = page.getByRole("textbox", { name: "Filter by region" });
    await filter.click();
    await page.keyboard.type("lon");

    await expect(page.getByRole("switch")).toHaveCount(1);
    await expect(block(page, "London (England)")).toBeVisible();

    await filter.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");

    await expect(page.getByRole("switch")).toHaveCount(REGIONS);
});

test("controls of the same kind have different names", async ({ page }) => {
    const names = async (role: "button", pattern: RegExp) => {
        const all = await page
            .getByRole(role, { name: pattern })
            .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
        return all;
    };
    for (const pattern of [/^Expand relays for /, /^Collapse relays for /, /^.+: (\d[\d,.]*|…|\.\.\.|—|No reply).*$/]) {
        const found = await names("button", pattern);
        expect(new Set(found).size).toBe(found.length);
    }

    await page.getByRole("button", { name: "Presets", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Presets" });
    const apply = await dialog
        .getByRole("button", { name: /^Apply preset / })
        .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    expect(apply.length).toBeGreaterThan(1);
    expect(new Set(apply).size).toBe(apply.length);
});
