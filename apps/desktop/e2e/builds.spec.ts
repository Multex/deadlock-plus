import type { Page } from "@playwright/test";
import { open } from "./support/flows";
import { expect, test } from "./support/test";

const main = (page: Page) => page.getByRole("main");
const publicTab = (page: Page) => main(page).getByRole("tabpanel", { name: "Public" });
const cards = (page: Page) => publicTab(page).locator('a[href^="/builds/view"]');
const heroSelect = (page: Page) => main(page).locator('button[aria-haspopup="listbox"]');
const card = (page: Page, name: string) => publicTab(page).getByRole("link", { name, exact: true });
const mineTab = (page: Page) => main(page).getByRole("tabpanel", { name: "Mine" });
const mineRow = (page: Page, name: string) =>
    mineTab(page)
        .getByRole("listitem")
        .filter({ has: page.getByRole("link", { name, exact: true }) });

async function openMine(page: Page) {
    await main(page).getByRole("tab", { name: "Mine", exact: true }).click();
    await expect(mineTab(page).getByRole("listitem").first()).toBeVisible();
}

async function pickHero(page: Page, name: string) {
    await heroSelect(page).click();
    await page.getByRole("option", { name, exact: true }).click();
    await expect(heroSelect(page)).toHaveText(name);
}

test.beforeEach(async ({ page }) => {
    await open(page, "/builds");
});

test("the page opens on the hero of the newest match", async ({ page }) => {
    await expect(heroSelect(page)).toHaveText("Kelvin");
});

test("switching the hero shows that hero's builds, this week's favourites first", async ({ page }) => {
    await pickHero(page, "Haze");
    await expect(cards(page)).toHaveText(["Bullet Dance Crit", "Sleepy Spirit Haze"]);

    await pickHero(page, "Infernus");
    await expect(cards(page)).toHaveText(["Burn Everything", "Afterburn all day"]);
    await expect(card(page, "Bullet Dance Crit")).toHaveCount(0);
});

test("builds in another language than the app's and English are left out", async ({ page }) => {
    await pickHero(page, "Haze");
    await expect(card(page, "Bullet Dance Crit")).toBeVisible();
    await expect(card(page, "Хейз через пушку")).toHaveCount(0);
});

test("a card opens the public build's view page", async ({ page }) => {
    await pickHero(page, "Haze");
    await expect(card(page, "Bullet Dance Crit")).toHaveAttribute("href", "/builds/view?source=public&id=381204");
    await card(page, "Bullet Dance Crit").click();
    await expect(page).toHaveURL(/\/builds\/view\?source=public&id=381204$/);
});

test("a hero with no public builds shows the empty state", async ({ page }) => {
    await pickHero(page, "Seven");
    await expect(main(page).getByRole("status")).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
});

test("My builds lists a stored draft on its own Draft row, which opens the draft in the editor", async ({ page }) => {
    await openMine(page);
    await expect(mineRow(page, "Infernus test")).toContainText("In game");
    const draft = mineRow(page, "Infernus burst");
    await expect(draft).toContainText("Draft");
    const link = draft.getByRole("link", { name: "Infernus burst", exact: true });
    await expect(link).toHaveAttribute("href", /^\/builds\/edit\?source=draft&id=[^&]+$/);

    await link.click();
    await expect(page).toHaveURL(/\/builds\/edit\?source=draft&id=[^&]+$/);
    await expect(page.getByTestId("build-name")).toHaveValue("Infernus burst");
});

test("discarding a draft from its view takes its row out of My builds", async ({ page }) => {
    await openMine(page);
    await mineRow(page, "Infernus burst")
        .getByRole("button", { name: "More actions for Infernus burst", exact: true })
        .click();
    await page.getByRole("menuitem", { name: "Open", exact: true }).click();
    await expect(page).toHaveURL(/\/builds\/view\?source=draft&id=[^&]+$/);
    await page.getByTestId("discard-draft").click();
    const confirm = page.getByRole("alertdialog");
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(page).toHaveURL(/\/builds\/view\?source=draft&id=[^&]+$/);

    await page.getByTestId("discard-draft").click();
    await confirm.getByRole("button", { name: "Discard draft", exact: true }).click();
    await expect(page).toHaveURL(/\/builds$/);
    await openMine(page);
    await expect(mineRow(page, "Infernus test")).toBeVisible();
    await expect(mineRow(page, "Infernus burst")).toHaveCount(0);
});

test("discarding a draft from My builds asks first", async ({ page }) => {
    await openMine(page);
    const actions = mineRow(page, "Infernus burst").getByRole("button", {
        name: "More actions for Infernus burst",
        exact: true,
    });
    await actions.click();
    await page.getByRole("menuitem", { name: "Discard draft", exact: true }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(mineRow(page, "Infernus burst")).toBeVisible();

    await actions.click();
    await page.getByRole("menuitem", { name: "Discard draft", exact: true }).click();
    await confirm.getByRole("button", { name: "Discard draft", exact: true }).click();
    await expect(mineRow(page, "Infernus burst")).toHaveCount(0);
});

test("My builds lists another player's favourite with its author, edits a copy of it and unfavourites it", async ({
    page,
}) => {
    await openMine(page);
    const favourites = mineTab(page).getByTestId("favourites");
    const link = favourites.getByRole("link", { name: "Bullet Dance Crit", exact: true });
    const row = favourites
        .getByRole("listitem")
        .filter({ has: page.getByRole("link", { name: "Bullet Dance Crit", exact: true }) });
    await expect(row).toContainText("Haze");
    await expect(row).toContainText("By Brass Tack");
    await expect(link).toHaveAttribute("href", "/builds/view?source=local&id=381204");
    await expect(mineTab(page).getByRole("link", { name: "Bullet Dance Crit", exact: true })).toHaveCount(1);

    const actions = row.getByRole("button", { name: "More actions for Bullet Dance Crit", exact: true });
    await actions.click();
    await page.getByRole("menuitem", { name: "Edit a copy", exact: true }).click();
    await expect(page).toHaveURL(/\/builds\/edit\?source=local&id=381204$/);
    await expect(page.getByTestId("build-name")).toHaveValue("Bullet Dance Crit (copy)");

    await open(page, "/builds");
    await openMine(page);
    await actions.click();
    await page.getByRole("menuitem", { name: "Unfavourite", exact: true }).click();
    await expect(favourites).toHaveCount(0);
    await expect(mineRow(page, "Infernus test")).toBeVisible();
});

test("?hero= opens the Public tab on that hero", async ({ page }) => {
    await open(page, "/builds?hero=13");
    await expect(main(page).getByRole("tab", { name: "Public", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(heroSelect(page)).toHaveText("Haze");
    await expect(card(page, "Bullet Dance Crit")).toBeVisible();
});

test("a hero row on Stats links to that hero's public builds", async ({ page }) => {
    await open(page, "/stats");
    const row = main(page)
        .getByRole("listitem")
        .filter({ has: page.locator('a[href^="/builds?hero="]') })
        .nth(1);
    const hero = (await row.locator("p.font-heading").textContent())!.trim();
    const link = row.locator('a[href^="/builds?hero="]');
    const href = (await link.getAttribute("href"))!;
    expect(href).toMatch(/^\/builds\?hero=\d+$/);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${href.replace("?", "\\?")}$`));
    await expect(heroSelect(page)).toHaveText(hero);
});

test.describe("during a live match", () => {
    test.use({ scenario: "live-match" });

    test("the page opens on the player's own hero in the match", async ({ page }) => {
        await expect(heroSelect(page)).toHaveText("Lash");
    });
});
