import type { Page } from "@playwright/test";
import { open, sidebarTo, toast } from "./support/flows";
import { expect, test } from "./support/test";

const BLOCKED_AT_START = 9;
const MUTED_AT_START = 14;

const question = (page: Page, title: string) => page.getByRole("alertdialog", { name: title });
const noQuestion = (page: Page) => expect(page.getByRole("alertdialog")).toHaveCount(0);

interface DemoWindow {
    __DEADLOCK_PLUS_DEMO__: { handle: { set(command: string, handler: () => unknown): void } };
}

/** Answers `command` with `result` from now on, in place of the scenario's own handler. */
async function answer(page: Page, command: string, result: unknown) {
    await page.evaluate(
        ([name, value]) => (window as unknown as DemoWindow).__DEADLOCK_PLUS_DEMO__.handle.set(name, () => value),
        [command, result] as const,
    );
}

/** Makes `command` fail from now on, as a backend error would. */
async function fail(page: Page, command: string, message: string) {
    await page.evaluate(
        ([name, text]) =>
            (window as unknown as DemoWindow).__DEADLOCK_PLUS_DEMO__.handle.set(name, () => {
                throw new Error(text);
            }),
        [command, message] as const,
    );
}

test("Server Picker: the unblock-all question closes once it is confirmed", async ({ page }) => {
    await open(page, "/server-picker");
    await page.getByRole("button", { name: `Unblock all (${BLOCKED_AT_START})` }).click();
    await question(page, "Unblock all relays?").getByRole("button", { name: "Unblock all", exact: true }).click();

    await expect(toast(page, `Unblocked ${BLOCKED_AT_START} rules`)).toBeVisible();
    await noQuestion(page);
    await expect(page.getByRole("switch", { checked: true })).toHaveCount(0);
});

test("Server Picker: a failed unblock-all says so and puts the question away", async ({ page }) => {
    await open(page, "/server-picker");
    await fail(page, "unblock_server_groups", "the firewall refused");
    await page.getByRole("button", { name: `Unblock all (${BLOCKED_AT_START})` }).click();
    await question(page, "Unblock all relays?").getByRole("button", { name: "Unblock all", exact: true }).click();

    await expect(toast(page, /Failed to unblock everything: .*the firewall refused/)).toBeVisible();
    await noQuestion(page);
    await expect(page.getByRole("switch", { checked: true })).toHaveCount(BLOCKED_AT_START);
});

test("Server Picker: the import question closes once it is confirmed", async ({ page }) => {
    await open(page, "/");
    await answer(page, "detect_external_blocks", {
        ruleNames: ["Deadlock Server Picker - ams"],
        sources: ["Other picker"],
        coveredGroupIds: ["ams"],
    });
    await answer(page, "import_external_blocks", ["ams"]);
    await sidebarTo(page, "Server Picker", /\/server-picker$/);

    await page.getByRole("button", { name: "Import", exact: true }).click();
    await question(page, "Import Other picker blocks?").getByRole("button", { name: "Import", exact: true }).click();

    await expect(toast(page, "Imported 1 block from Other picker")).toBeVisible();
    await noQuestion(page);
});

test("Discord editor: the reset question closes once it is confirmed", async ({ page }) => {
    await open(page, "/settings/discord");
    await page.getByRole("button", { name: "Reset everything", exact: true }).click();
    await question(page, "Reset all presence settings?")
        .getByRole("button", { name: "Reset everything", exact: true })
        .click();

    await noQuestion(page);
});

test("Discord editor: a reset that cannot be saved shows the error on the page", async ({ page }) => {
    await open(page, "/settings/discord");
    await fail(page, "set_presence_config", "the settings file is read-only");
    await page.getByRole("button", { name: "Reset everything", exact: true }).click();
    await question(page, "Reset all presence settings?")
        .getByRole("button", { name: "Reset everything", exact: true })
        .click();

    await noQuestion(page);
    await expect(page.getByRole("alert").filter({ hasText: "the settings file is read-only" })).toBeVisible();
});

const ROW_UNMUTE = /^Unmute (?!selected)/;

test("Mutes: a failed unmute says so, keeps the player and puts the question away", async ({ page }) => {
    await open(page, "/voice-bans");
    await expect(page.getByRole("button", { name: ROW_UNMUTE })).toHaveCount(MUTED_AT_START);
    await fail(page, "write_voice_ban", "the file is locked");
    await page.getByRole("button", { name: ROW_UNMUTE }).first().click();
    await question(page, "Unmute 1 player?").getByRole("button", { name: "Unmute", exact: true }).click();

    await expect(toast(page, /the file is locked/)).toBeVisible();
    await noQuestion(page);
    await expect(page.getByRole("button", { name: ROW_UNMUTE })).toHaveCount(MUTED_AT_START);
});

test("Storage: the clear question closes once it is confirmed", async ({ page }) => {
    await open(page, "/storage");
    await page.getByRole("button", { name: "Clear Shader cache", exact: true }).click();
    await question(page, "Clear the shader cache?").getByRole("button", { name: "Clear", exact: true }).click();

    await expect(toast(page, /Freed [0-9]/)).toBeVisible();
    await noQuestion(page);
});

test("Storage: a failed clear says so and puts the question away", async ({ page }) => {
    await open(page, "/storage");
    await fail(page, "storage_clear", "access denied");
    await page.getByRole("button", { name: "Clear Shader cache", exact: true }).click();
    await question(page, "Clear the shader cache?").getByRole("button", { name: "Clear", exact: true }).click();

    await expect(toast(page, /Couldn't remove 1: .*access denied/)).toBeVisible();
    await noQuestion(page);
});

test("Replays: a failed delete says so and puts the question away", async ({ page }) => {
    await open(page, "/demos");
    await fail(page, "delete_demos", "the folder is gone");
    await page
        .getByRole("checkbox", { name: /^Select / })
        .and(page.locator(":enabled"))
        .nth(1)
        .check();
    await page
        .getByRole("button", { name: /^Delete/ })
        .first()
        .click();
    await page
        .getByRole("alertdialog")
        .getByRole("button", { name: /Recycle Bin|Trash|permanently/i })
        .last()
        .click();

    await expect(toast(page, /the folder is gone/)).toBeVisible();
    await noQuestion(page);
});
