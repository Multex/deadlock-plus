import type { Locator, Page } from "@playwright/test";
import { focusIsVisible, open } from "./support/flows";
import { expect, settle, test } from "./support/test";

const MAIN_PAGES = 8;

const palette = (page: Page) => page.getByRole("dialog", { name: "Quick search" });
const search = (page: Page) => palette(page).getByRole("combobox", { name: "Search commands" });
const command = (page: Page, name: string | RegExp) =>
    palette(page).getByRole("option", { name, exact: typeof name === "string" });
const highlighted = (page: Page) => palette(page).getByRole("option", { selected: true });
const sidebar = (page: Page) => page.getByRole("complementary").getByRole("navigation");
const tools = (page: Page) => sidebar(page).getByRole("group", { name: "Tools", exact: true });
const toolsToggle = (page: Page) => tools(page).getByRole("button", { name: "Tools", exact: true });
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
        await expect(command(page, `Jump to a page Ctrl+1-${MAIN_PAGES}`)).toBeVisible();

        await page.keyboard.press("Control+k");

        await expect(palette(page)).toBeHidden();
    });

    test("it lists every sidebar page in order, the main ones with their shortcut and the tools without", async ({
        page,
    }) => {
        const trimmed = (texts: string[]) => texts.map((text) => text.trim());
        const toolNames = trimmed(await tools(page).getByRole("link").allInnerTexts());
        const mainNames = trimmed(await sidebar(page).getByRole("link").allInnerTexts()).filter(
            (name) => !toolNames.includes(name),
        );
        expect(mainNames).toHaveLength(MAIN_PAGES);
        expect(toolNames.length).toBeGreaterThan(0);
        await openPalette(page);

        const listed = await palette(page)
            .getByRole("group", { name: "Pages", exact: true })
            .getByRole("option")
            .allInnerTexts();

        expect(listed.map((text) => text.replace(/\s+/g, " ").trim())).toEqual([
            ...mainNames.map((name, index) => `${name} Ctrl+${index + 1}`),
            ...toolNames,
        ]);
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
        await expect(highlighted(page)).toHaveAccessibleName(`Jump to a page Ctrl+1-${MAIN_PAGES}`);
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
            ["mutes", /\/voice-bans$/],
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
        await page.keyboard.type("replays");

        await page.keyboard.press("Escape");

        await expect(palette(page)).toBeHidden();
        await expect(mutes).toBeFocused();
        expect(pathOf(page)).toBe("/");
    });

    test("it opens empty the next time", async ({ page }) => {
        await openPalette(page);
        await page.keyboard.type("replays");
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
    test("Ctrl+digit jumps to the main sidebar pages, in sidebar order, never to a tool", async ({ page }) => {
        await open(page, "/demos");
        const hrefs = async (links: Locator) =>
            Promise.all((await links.all()).map((link) => link.getAttribute("href")));
        const toolHrefs = await hrefs(tools(page).getByRole("link"));
        const targets = (await hrefs(sidebar(page).getByRole("link"))).filter((href) => !toolHrefs.includes(href));
        expect(targets).toHaveLength(MAIN_PAGES);
        expect(toolHrefs).toContain("/demos");

        // Backwards, so the first jump leaves the page the test opened and every jump changes the URL.
        for (let digit = MAIN_PAGES; digit >= 1; digit--) {
            await page.keyboard.press(`Control+${digit}`);
            await expect.poll(() => pathOf(page), `Ctrl+${digit}`).toBe(targets[digit - 1]);
        }
    });

    test("a digit needs Ctrl alone: no modifier, Shift or Alt goes nowhere", async ({ page }) => {
        await open(page, "/demos");

        for (const keys of ["2", "Control+Shift+2", "Control+Alt+2", "Alt+2"]) await page.keyboard.press(keys);
        await page.keyboard.press("Control+0");

        // A jump that did fire would have landed by the time this later one has.
        await page.keyboard.press("Control+5");
        await expect(page).toHaveURL(/\/match-history$/);
        await page.goBack();
        await expect(page).toHaveURL(/\/demos$/);
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

test.describe("the sidebar Tools group", () => {
    const mutesLink = (page: Page) => sidebar(page).getByRole("link", { name: "Mutes", exact: true });
    const replaysLink = (page: Page) => sidebar(page).getByRole("link", { name: "Replays", exact: true });

    test("Enter and Space on its header close and open it, and it stays that way after a restart", async ({ page }) => {
        await open(page, "/");
        await expect(toolsToggle(page)).toHaveAttribute("aria-expanded", "true");
        await expect(mutesLink(page)).toBeVisible();

        await toolsToggle(page).focus();
        await page.keyboard.press("Enter");

        await expect(toolsToggle(page)).toHaveAttribute("aria-expanded", "false");
        await expect(mutesLink(page)).toHaveCount(0);
        await expect(replaysLink(page)).toHaveCount(0);

        await page.reload();
        await settle(page);
        await expect(toolsToggle(page)).toHaveAttribute("aria-expanded", "false");
        await expect(mutesLink(page)).toHaveCount(0);

        await toolsToggle(page).focus();
        await page.keyboard.press("Space");

        await expect(toolsToggle(page)).toHaveAttribute("aria-expanded", "true");
        await expect(mutesLink(page)).toBeVisible();
    });

    test("while closed it still shows the tool page you are on", async ({ page }) => {
        await open(page, "/");
        await toolsToggle(page).click();
        await expect(mutesLink(page)).toHaveCount(0);

        await run(page, "mutes");

        await expect(page).toHaveURL(/\/voice-bans$/);
        await expect(mutesLink(page)).toHaveAttribute("aria-current", "page");
        await expect(replaysLink(page)).toHaveCount(0);
        await expect(toolsToggle(page)).toHaveAttribute("aria-expanded", "false");
    });

    test("the icon-only sidebar keeps the header and names it on hover", async ({ page }) => {
        await open(page, "/");
        await page.getByRole("button", { name: "Collapse sidebar" }).click();

        await toolsToggle(page).hover();

        await expect(page.locator("[data-tooltip-content]")).toHaveText("Tools");
        await toolsToggle(page).click();
        await expect(mutesLink(page)).toHaveCount(0);
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
        expect(links.length).toBeGreaterThanOrEqual(11);

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
