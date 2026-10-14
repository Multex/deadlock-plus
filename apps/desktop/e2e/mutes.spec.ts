import type { Page } from "@playwright/test";
import { open, recordCommand, sidebarTo, toast } from "./support/flows";
import { expect, test } from "./support/test";

const MUTED_AT_START = 14;

// Steam ids of the scenario's invented players: muted at the start, and never muted.
const BRASS_TACK = "76561198050265730";
const SABLE = "76561198050265732";
const VESPER = "76561198050265734";
const OLD_KESTREL = "76561198050265746";
const WRENFIELD = "76561198050265750";
const CINDERBLOCK = "76561198050265751";

const mutedCount = (page: Page, shown: number, total = shown) =>
    page.getByText(`${shown} of ${total} muted`, { exact: true });
const select = (page: Page, name: string) => page.getByRole("checkbox", { name: `Select ${name}`, exact: true });
const mutedRow = (page: Page, name: string) => page.getByRole("listitem").filter({ has: select(page, name) });
const searchResult = (page: Page, name: string) =>
    page
        .getByRole("listitem")
        .filter({ hasText: name })
        .filter({ hasNot: page.getByRole("checkbox") });
const addBox = (page: Page) => page.getByRole("textbox", { name: "Player to mute" });
const confirmation = (page: Page, title: string) => page.getByRole("alertdialog", { name: title });
const rowUnmutes = (page: Page) => page.getByRole("button", { name: /^Unmute (?!selected)/ });

test.beforeEach(async ({ page }) => {
    await open(page, "/voice-bans");
    await expect(mutedCount(page, MUTED_AT_START)).toBeVisible();
    await expect(rowUnmutes(page)).toHaveCount(MUTED_AT_START);
});

// The page reads the file again after each change, and once more on every visit. Home counts the same
// file through its own read, so both agreeing means the backend holds the change.
async function homeCounts(page: Page, muted: number) {
    await sidebarTo(page, "Home", /\/$/);
    await expect(page.getByRole("link", { name: `${muted} Muted players` })).toBeVisible();
    await sidebarTo(page, "Mutes", /\/voice-bans$/);
    await expect(mutedCount(page, muted)).toBeVisible();
}

async function searchFor(page: Page, text: string) {
    await addBox(page).click();
    await page.keyboard.type(text);
    await page.keyboard.press("Enter");
}

async function importFile(page: Page, name: string, text: string) {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await (await chooser).setFiles({ name, mimeType: "application/json", buffer: Buffer.from(text) });
}

test("a name search lists the matching players and marks the ones already muted", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Search", exact: true })).toBeDisabled();

    await searchFor(page, "light");

    await expect(page.getByRole("button", { name: "Mute Lowlight", exact: true })).toBeVisible();
    await expect(searchResult(page, "Mothlight").getByText("Muted", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mute Mothlight", exact: true })).toHaveCount(0);
});

test("every mute and unmute button names the player it acts on", async ({ page }) => {
    await searchFor(page, "light");
    await expect(page.getByRole("button", { name: /^Mute \S/ }).first()).toBeVisible();

    for (const pattern of [/^Unmute (?!selected)/, /^Open Statlocker profile of /]) {
        const names = await page
            .getByRole("button", { name: pattern })
            .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label") ?? ""));
        expect(names.length).toBeGreaterThan(1);
        expect(new Set(names).size).toBe(names.length);
    }
});

test("a name nobody has says so", async ({ page }) => {
    await searchFor(page, "zzzz");

    await expect(page.getByText("No players found for that name.")).toBeVisible();
});

test("muting a search result adds the player to the list and the backend keeps it", async ({ page }) => {
    await searchFor(page, "light");
    await page.getByRole("button", { name: "Mute Lowlight", exact: true }).click();

    await expect(toast(page, "Muted 1 player")).toBeVisible();
    await expect(mutedCount(page, MUTED_AT_START + 1)).toBeVisible();
    await expect(mutedRow(page, "Lowlight")).toBeVisible();
    await expect(addBox(page)).toHaveValue("");

    await homeCounts(page, MUTED_AT_START + 1);
    await expect(mutedRow(page, "Lowlight")).toBeVisible();
});

test("a SteamID64 typed in the box mutes that player without a search", async ({ page }) => {
    await addBox(page).click();
    await page.keyboard.type(OLD_KESTREL);
    await page.getByRole("button", { name: "Mute", exact: true }).click();

    await expect(toast(page, "Muted 1 player")).toBeVisible();
    await expect(mutedCount(page, MUTED_AT_START + 1)).toBeVisible();
    await expect(mutedRow(page, "Old Kestrel")).toBeVisible();
});

test("muting someone who is already muted changes nothing", async ({ page }) => {
    await addBox(page).click();
    await page.keyboard.type(BRASS_TACK);
    await page.keyboard.press("Enter");

    await expect(toast(page, "Already muted.")).toBeVisible();
    await expect(mutedCount(page, MUTED_AT_START)).toBeVisible();
});

test("the filter narrows the muted list by name and clearing it brings everyone back", async ({ page }) => {
    const filter = page.getByRole("textbox", { name: "Filter by name or ID" });
    await filter.click();
    await page.keyboard.type("sable");

    await expect(mutedCount(page, 1, MUTED_AT_START)).toBeVisible();
    await expect(mutedRow(page, "Sable")).toBeVisible();
    await expect(rowUnmutes(page)).toHaveCount(1);

    await filter.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");

    await expect(mutedCount(page, MUTED_AT_START)).toBeVisible();
});

test("cancelling the unmute question keeps the player muted", async ({ page }) => {
    await page.getByRole("button", { name: "Unmute Brass Tack", exact: true }).click();
    const dialog = confirmation(page, "Unmute 1 player?");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(mutedRow(page, "Brass Tack")).toBeVisible();
    await expect(mutedCount(page, MUTED_AT_START)).toBeVisible();
});

test("unmuting a player removes the row and the backend keeps it removed", async ({ page }) => {
    await page.getByRole("button", { name: "Unmute Brass Tack", exact: true }).click();
    await confirmation(page, "Unmute 1 player?").getByRole("button", { name: "Unmute", exact: true }).click();

    await expect(toast(page, "Unmuted 1 player")).toBeVisible();
    await expect(mutedRow(page, "Brass Tack")).toHaveCount(0);
    await expect(mutedCount(page, MUTED_AT_START - 1)).toBeVisible();

    await homeCounts(page, MUTED_AT_START - 1);
    await expect(mutedRow(page, "Brass Tack")).toHaveCount(0);
});

test("the unmute question closes once it is confirmed", async ({ page }) => {
    await page.getByRole("button", { name: "Unmute Brass Tack", exact: true }).click();
    const dialog = confirmation(page, "Unmute 1 player?");
    await dialog.getByRole("button", { name: "Unmute", exact: true }).click();

    await expect(toast(page, "Unmuted 1 player")).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("unmuting the selected players removes all of them at once", async ({ page }) => {
    const unmuteSelected = (count: number) => page.getByRole("button", { name: `Unmute selected (${count})` });
    await expect(unmuteSelected(0)).toBeDisabled();

    await select(page, "Sable").check();
    await select(page, "Vesper").check();
    await unmuteSelected(2).click();
    await confirmation(page, "Unmute 2 players?").getByRole("button", { name: "Unmute", exact: true }).click();

    await expect(toast(page, "Unmuted 2 players")).toBeVisible();
    await expect(mutedCount(page, MUTED_AT_START - 2)).toBeVisible();
    await expect(mutedRow(page, "Sable")).toHaveCount(0);
    await expect(mutedRow(page, "Vesper")).toHaveCount(0);
    await expect(unmuteSelected(0)).toBeDisabled();
});

test("export all hands every muted id to the save dialog as a versioned JSON file", async ({ page }) => {
    const saved = await recordCommand(page, "save_text_file", true);

    await page.getByRole("button", { name: "Export all", exact: true }).click();

    await expect(toast(page, `Exported ${MUTED_AT_START} mutes`)).toBeVisible();
    const calls = await saved();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ defaultName: "deadlock-mutes.json", filterName: "JSON", extension: "json" });
    const file = JSON.parse(String(calls[0]!.contents)) as { version: number; users: { steamid64: string }[] };
    expect(file.version).toBe(1);
    expect(file.users).toHaveLength(MUTED_AT_START);
    expect(file.users).toContainEqual({ steamid64: BRASS_TACK });
    expect(file.users).not.toContainEqual({ steamid64: OLD_KESTREL });
});

test("with rows selected, export writes only those players", async ({ page }) => {
    const saved = await recordCommand(page, "save_text_file", true);

    await select(page, "Sable").check();
    await select(page, "Vesper").check();
    await page.getByRole("button", { name: "Export selected (2)", exact: true }).click();

    await expect(toast(page, "Exported 2 mutes")).toBeVisible();
    const file = JSON.parse(String((await saved())[0]!.contents)) as { users: { steamid64: string }[] };
    expect(file.users.map((user) => user.steamid64).sort()).toEqual([SABLE, VESPER]);
});

test("closing the save dialog reports no export", async ({ page }) => {
    const saved = await recordCommand(page, "save_text_file", false);

    await page.getByRole("button", { name: "Export all", exact: true }).click();

    await expect.poll(async () => (await saved()).length).toBe(1);
    await expect(toast(page, /Exported/)).toHaveCount(0);
});

test("importing a file asks first, skips ids already muted and adds the rest", async ({ page }) => {
    const users = [WRENFIELD, CINDERBLOCK, BRASS_TACK].map((steamid64) => ({ steamid64 }));
    await importFile(page, "deadlock-mutes.json", JSON.stringify({ version: 1, users }));

    const dialog = confirmation(page, "Import 2 new mutes?");
    await expect(dialog.getByText("3 players in the file, 1 already muted.", { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "Import", exact: true }).click();

    await expect(toast(page, "Muted 2 players")).toBeVisible();
    await expect(mutedCount(page, MUTED_AT_START + 2)).toBeVisible();
    await expect(mutedRow(page, "Wrenfield")).toBeVisible();
    await expect(mutedRow(page, "Cinderblock")).toBeVisible();

    await homeCounts(page, MUTED_AT_START + 2);
});

test("the import question closes once it is confirmed", async ({ page }) => {
    await importFile(page, "deadlock-mutes.json", JSON.stringify({ version: 1, users: [{ steamid64: WRENFIELD }] }));
    const dialog = confirmation(page, "Import 1 new mute?");
    await dialog.getByRole("button", { name: "Import", exact: true }).click();

    await expect(toast(page, "Muted 1 player")).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("cancelling an import adds nobody", async ({ page }) => {
    await importFile(page, "deadlock-mutes.json", JSON.stringify({ version: 1, users: [{ steamid64: WRENFIELD }] }));

    const dialog = confirmation(page, "Import 1 new mute?");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(mutedCount(page, MUTED_AT_START)).toBeVisible();
});

test("an exported file imports back into an emptied list", async ({ page }) => {
    const saved = await recordCommand(page, "save_text_file", true);
    await page.getByRole("button", { name: "Export all", exact: true }).click();
    await expect.poll(async () => (await saved()).length).toBe(1);
    const exported = String((await saved())[0]!.contents);

    await page.getByRole("checkbox", { name: "Select this page", exact: true }).check();
    await page.getByRole("button", { name: `Unmute selected (${MUTED_AT_START})` }).click();
    await confirmation(page, `Unmute ${MUTED_AT_START} players?`)
        .getByRole("button", { name: "Unmute", exact: true })
        .click();
    await expect(page.getByText("Nobody is muted.")).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    await importFile(page, "deadlock-mutes.json", exported);
    await confirmation(page, `Import ${MUTED_AT_START} new mutes?`)
        .getByRole("button", { name: "Import", exact: true })
        .click();

    await expect(mutedCount(page, MUTED_AT_START)).toBeVisible();
    await expect(mutedRow(page, "Brass Tack")).toBeVisible();
});

test("a file that is not a mute list is refused with a message", async ({ page }) => {
    await importFile(page, "notes.json", JSON.stringify(["not", "a", "mute", "list"]));

    await expect(toast(page, /Couldn't read that file/)).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(mutedCount(page, MUTED_AT_START)).toBeVisible();
});

interface DemoWindow {
    __DEADLOCK_PLUS_DEMO__: {
        handle: { invoke(command: string, args: object): unknown; set(command: string, handler: () => unknown): void };
    };
}

/** From the page's next read on, the mute file answers as it does while Deadlock is open. */
async function startDeadlock(page: Page) {
    await page.evaluate(() => {
        const { handle } = (window as unknown as DemoWindow).__DEADLOCK_PLUS_DEMO__;
        const file = handle.invoke("read_voice_ban", {}) as object;
        handle.set("read_voice_ban", () => ({ ...file, gameRunning: true }));
    });
}

/** From the page's next read on, Steam has no signed-in account on this PC. */
async function signOutOfSteam(page: Page) {
    await page.evaluate(() => {
        (window as unknown as DemoWindow).__DEADLOCK_PLUS_DEMO__.handle.set("read_voice_ban", () => {
            throw { code: "voice_bans.no_account", params: {} };
        });
    });
}

test("the import question reads the same from the moment it opens until it is gone", async ({ page }) => {
    await importFile(page, "deadlock-mutes.json", JSON.stringify({ version: 1, users: [{ steamid64: WRENFIELD }] }));
    const dialog = confirmation(page, "Import 1 new mute?");
    await expect(dialog).toBeVisible();
    await page.evaluate(() => {
        const host = window as unknown as { __E2E_QUESTIONS__: string[] };
        host.__E2E_QUESTIONS__ = [];
        const note = () => {
            const text = document.querySelector('[role="alertdialog"]')?.textContent?.replace(/\s+/g, " ").trim();
            if (text && !host.__E2E_QUESTIONS__.includes(text)) host.__E2E_QUESTIONS__.push(text);
        };
        note();
        new MutationObserver(note).observe(document.body, { subtree: true, childList: true, characterData: true });
    });

    await dialog.getByRole("button", { name: "Import", exact: true }).click();
    await expect(toast(page, "Muted 1 player")).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    const shown = await page.evaluate(() => (window as unknown as { __E2E_QUESTIONS__: string[] }).__E2E_QUESTIONS__);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toContain("Import 1 new mute?");
});

test("the unmute question cannot be confirmed once Deadlock has started", async ({ page }) => {
    await page.getByRole("button", { name: "Unmute Brass Tack", exact: true }).click();
    const confirm = confirmation(page, "Unmute 1 player?").getByRole("button", { name: "Unmute", exact: true });
    await expect(confirm).toBeEnabled();

    await startDeadlock(page);

    // The page reads the file again every three seconds.
    await expect(confirm).toBeDisabled();
});

test("losing the Steam account puts the list away and turns import and export off", async ({ page }) => {
    await signOutOfSteam(page);

    await expect(page.getByRole("main").getByText("No Steam account found.")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Export all", exact: true })).toBeDisabled();
});
