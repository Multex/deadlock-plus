import type { Locator, Page } from "@playwright/test";
import { focusIsVisible, open } from "./support/flows";
import { expect, settle, test } from "./support/test";

const MAX_PAGE_JUMPS = 9;

const palette = (page: Page) => page.getByRole("dialog", { name: "Quick search" });
const search = (page: Page) => palette(page).getByRole("combobox", { name: "Search commands" });
const command = (page: Page, name: string | RegExp) =>
    palette(page).getByRole("option", { name, exact: typeof name === "string" });
const highlighted = (page: Page) => palette(page).getByRole("option", { selected: true });
const sidebar = (page: Page) => page.getByRole("complementary").getByRole("navigation");
const pathOf = (page: Page) => new URL(page.url()).pathname;

async function openPalette(page: Page) {
    await page.keyboard.press("Control+k");
    await expect(palette(page)).toBeVisible();
    await expect(search(page)).toBeFocused();
}

/** Runs the command the palette offers first for `text`. */
async function run(page: Page, text: string) {
    await openPalette(page);
    await page.keyboard.type(text);
    await page.keyboard.press("Enter");
    await expect(palette(page)).toBeHidden();
}

test.describe("the command palette", () => {
    test.beforeEach(async ({ page }) => {
        await open(page, "/");
    });

    test("Ctrl+K opens it on the search box with every group listed, and Ctrl+K closes it again", async ({ page }) => {
        await openPalette(page);

        for (const group of ["Pages", "Settings", "Actions", "Keyboard shortcuts"]) {
            await expect(palette(page).getByRole("group", { name: group, exact: true })).toBeVisible();
        }
        await expect(command(page, "Quick search Ctrl+K")).toBeVisible();
        await expect(command(page, `Jump to a page Ctrl+1-${MAX_PAGE_JUMPS}`)).toBeVisible();

        await page.keyboard.press("Control+k");

        await expect(palette(page)).toBeHidden();
    });

    test("it lists every sidebar page in order, the first nine with their shortcut", async ({ page }) => {
        const pages = await sidebar(page).getByRole("link").allInnerTexts();
        expect(pages.length).toBeGreaterThan(MAX_PAGE_JUMPS);
        await openPalette(page);

        const listed = await palette(page)
            .getByRole("group", { name: "Pages", exact: true })
            .getByRole("option")
            .allInnerTexts();

        expect(listed.map((text) => text.replace(/\s+/g, " ").trim())).toEqual(
            pages.map((name, index) => (index < MAX_PAGE_JUMPS ? `${name.trim()} Ctrl+${index + 1}` : name.trim())),
        );
    });

    test("typing narrows the list and highlights the best match", async ({ page }) => {
        await openPalette(page);
        await expect(highlighted(page)).toHaveAccessibleName("Home Ctrl+1");

        await page.keyboard.type("repl");

        await expect(highlighted(page)).toHaveAccessibleName("Replays");
        await expect(command(page, "Home Ctrl+1")).toHaveCount(0);
        await expect(command(page, "Mutes")).toHaveCount(0);
    });

    test("text that matches nothing says so", async ({ page }) => {
        await openPalette(page);
        await page.keyboard.type("zzzzzz");

        await expect(palette(page).getByText("Nothing matches.")).toBeVisible();
        await expect(palette(page).getByRole("option")).toHaveCount(0);

        await page.keyboard.press("Enter");
        await expect(palette(page)).toBeVisible();
        expect(pathOf(page)).toBe("/");
    });

    test("the arrow keys move the highlight, wrap at both ends, and Enter goes to the page", async ({ page }) => {
        await openPalette(page);

        await page.keyboard.press("ArrowDown");
        await expect(highlighted(page)).toHaveAccessibleName("Server Picker Ctrl+2");
        await page.keyboard.press("ArrowDown");
        await expect(highlighted(page)).toHaveAccessibleName("Live Ctrl+3");
        await page.keyboard.press("ArrowUp");
        await expect(highlighted(page)).toHaveAccessibleName("Server Picker Ctrl+2");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowUp");
        await expect(highlighted(page)).toHaveAccessibleName(`Jump to a page Ctrl+1-${MAX_PAGE_JUMPS}`);
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await expect(highlighted(page)).toHaveAccessibleName("Server Picker Ctrl+2");
        await expect(search(page)).toBeFocused();

        await page.keyboard.press("Enter");

        await expect(page).toHaveURL(/\/server-picker$/);
        await expect(palette(page)).toBeHidden();
        await expect(page.getByRole("heading", { level: 1, name: "Server Picker" })).toBeVisible();
    });

    test("Enter on a typed match goes to that page, settings section or action", async ({ page }) => {
        for (const [text, url] of [
            ["storage", /\/storage$/],
            ["settings: privacy", /\/settings\/privacy$/],
            ["open settings", /\/settings\/appearance$/],
            ["check for updates", /\/settings\/about$/],
            ["match history", /\/match-history$/],
        ] as const) {
            await run(page, text);
            await expect(page).toHaveURL(url);
        }
    });

    test("clicking a command runs it", async ({ page }) => {
        await openPalette(page);

        await command(page, "Settings: Language").click();

        await expect(page).toHaveURL(/\/settings\/language$/);
        await expect(palette(page)).toBeHidden();
    });

    test("Escape closes it without going anywhere and gives focus back to where it was", async ({ page }) => {
        const mutes = sidebar(page).getByRole("link", { name: "Mutes", exact: true });
        await mutes.focus();
        await openPalette(page);
        await page.keyboard.type("storage");

        await page.keyboard.press("Escape");

        await expect(palette(page)).toBeHidden();
        await expect(mutes).toBeFocused();
        expect(pathOf(page)).toBe("/");
    });

    test("it opens empty the next time", async ({ page }) => {
        await openPalette(page);
        await page.keyboard.type("storage");
        await page.keyboard.press("Escape");
        await expect(palette(page)).toBeHidden();

        await openPalette(page);

        await expect(search(page)).toHaveValue("");
        await expect(highlighted(page)).toHaveAccessibleName("Home Ctrl+1");
    });

    test("Ctrl+K does not open it over another dialog", async ({ page }) => {
        await open(page, "/demos");
        await page.getByRole("button", { name: "Clean up", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Clean up replays" })).toBeVisible();

        await page.keyboard.press("Control+k");

        await expect(palette(page)).toHaveCount(0);
        await expect(page.getByRole("dialog", { name: "Clean up replays" })).toBeVisible();
    });
});

test.describe("page shortcuts", () => {
    test("Ctrl+1 to Ctrl+9 jump to the first nine sidebar pages, in sidebar order", async ({ page }) => {
        await open(page, "/storage");
        const links = sidebar(page).getByRole("link");
        const targets = await Promise.all(
            (await links.all()).slice(0, MAX_PAGE_JUMPS).map((link) => link.getAttribute("href")),
        );
        expect(targets).toHaveLength(MAX_PAGE_JUMPS);

        // Backwards, so the first jump leaves the page the test opened and every jump changes the URL.
        for (let digit = MAX_PAGE_JUMPS; digit >= 1; digit--) {
            await page.keyboard.press(`Control+${digit}`);
            await expect.poll(() => pathOf(page), `Ctrl+${digit}`).toBe(targets[digit - 1]);
        }
    });

    test("a digit needs Ctrl alone: no modifier, Shift or Alt goes nowhere", async ({ page }) => {
        await open(page, "/storage");

        for (const keys of ["2", "Control+Shift+2", "Control+Alt+2", "Alt+2"]) await page.keyboard.press(keys);
        await page.keyboard.press("Control+0");

        // A jump that did fire would have landed by the time this later one has.
        await page.keyboard.press("Control+5");
        await expect(page).toHaveURL(/\/match-history$/);
        await page.goBack();
        await expect(page).toHaveURL(/\/storage$/);
    });

    test("Ctrl+digit is left alone while typing in a text box", async ({ page }) => {
        await open(page, "/voice-bans");
        const filter = page.getByRole("textbox", { name: "Filter by name or ID" });
        await filter.click();
        await page.keyboard.type("sab");

        await page.keyboard.press("Control+2");
        await page.keyboard.type("le");

        await expect(filter).toHaveValue("sable");
        expect(pathOf(page)).toBe("/voice-bans");
    });

    test("Ctrl+digit is left alone while a dialog is open", async ({ page }) => {
        await open(page, "/demos");
        await page.getByRole("button", { name: "Clean up", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Clean up replays" });
        await expect(dialog).toBeVisible();

        await page.keyboard.press("Control+2");
        await dialog.getByRole("button", { name: "Close", exact: true }).click();

        await expect(dialog).toBeHidden();
        expect(pathOf(page)).toBe("/demos");
    });

    test("Ctrl+digit works from inside Settings", async ({ page }) => {
        await open(page, "/settings/appearance");

        await page.keyboard.press("Control+2");

        await expect(page).toHaveURL(/\/server-picker$/);
    });
});

test.describe("Escape in Settings", () => {
    test("goes back to the page Settings was opened from", async ({ page }) => {
        await open(page, "/demos");
        await page.getByRole("link", { name: "Settings", exact: true }).click();
        await expect(page).toHaveURL(/\/settings\/appearance$/);
        await page
            .getByRole("navigation", { name: "Settings categories" })
            .getByRole("link", { name: "Privacy" })
            .click();
        await expect(page).toHaveURL(/\/settings\/privacy$/);

        await page.keyboard.press("Escape");

        await expect(page).toHaveURL(/\/demos$/);
    });

    test("clears a settings search first, and only then goes back", async ({ page }) => {
        await open(page, "/demos");
        await page.getByRole("link", { name: "Settings", exact: true }).click();
        const box = page.getByRole("searchbox", { name: "Search settings" });
        await box.click();
        await page.keyboard.type("font");
        await expect(page.getByRole("switch", { name: "Accessible font", exact: true })).toBeVisible();

        await page.keyboard.press("Escape");

        await expect(box).toHaveValue("");
        await expect(page).toHaveURL(/\/settings\//);

        await page.keyboard.press("Escape");

        await expect(page).toHaveURL(/\/demos$/);
    });

    test("closes an open menu without leaving Settings", async ({ page }) => {
        await open(page, "/settings/appearance");
        await page.getByRole("button", { name: "Reduced motion" }).click();
        await expect(page.getByRole("listbox")).toBeVisible();

        await page.keyboard.press("Escape");

        await expect(page.getByRole("listbox")).toBeHidden();
        expect(pathOf(page)).toBe("/settings/appearance");
    });
});

test.describe("Tab order on Home", () => {
    const MAX_TABS_BETWEEN_STOPS = 8;

    /** Presses `key` until `target` has focus, checking that every stop on the way shows where focus is. */
    async function tabTo(page: Page, target: Locator, key = "Tab") {
        for (let presses = 0; presses < MAX_TABS_BETWEEN_STOPS; presses++) {
            await page.keyboard.press(key);
            const stop = await page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 60) ?? "");
            expect(await focusIsVisible(page), `"${stop}" shows no focus ring`).toBe(true);
            if (await target.evaluate((element) => element === document.activeElement)) return;
        }
        await expect(target).toBeFocused();
    }

    test.beforeEach(async ({ page }) => {
        await open(page, "/");
    });

    test("Tab reaches every sidebar link in order, then Settings, then the main actions", async ({ page }) => {
        const home = page.getByRole("main");
        const links = await sidebar(page).getByRole("link").all();
        expect(links.length).toBeGreaterThanOrEqual(12);

        for (const link of links) await tabTo(page, link);
        await tabTo(page, page.getByRole("complementary").getByRole("link", { name: "Settings", exact: true }));

        await tabTo(page, home.getByRole("button", { name: "Launch Deadlock" }));
        const glance = await home.getByRole("region", { name: "At a glance" }).getByRole("link").all();
        expect(glance).toHaveLength(3);
        for (const tile of glance) await tabTo(page, tile);

        for (const region of ["Your Deadlock", "Tools"]) {
            const cards = await home.getByRole("region", { name: region }).getByRole("link").all();
            expect(cards.length, `${region} cards`).toBeGreaterThan(0);
            for (const card of cards) await tabTo(page, card);
        }
    });

    test("Shift+Tab walks the same stops backwards", async ({ page }) => {
        const links = await sidebar(page).getByRole("link").all();
        await tabTo(page, links[0]!);
        await tabTo(page, links[1]!);
        await tabTo(page, links[2]!);

        await tabTo(page, links[1]!, "Shift+Tab");
        await tabTo(page, links[0]!, "Shift+Tab");
    });

    test("Enter on a focused sidebar link opens its page", async ({ page }) => {
        const mutes = sidebar(page).getByRole("link", { name: "Mutes", exact: true });
        for (const link of await sidebar(page).getByRole("link").all()) {
            await tabTo(page, link);
            if (await mutes.evaluate((element) => element === document.activeElement)) break;
        }

        await page.keyboard.press("Enter");

        await expect(page).toHaveURL(/\/voice-bans$/);
        await settle(page);
        await expect(page.getByRole("heading", { level: 1, name: "Mutes" })).toBeVisible();
    });
});
