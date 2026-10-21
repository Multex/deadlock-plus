import type { Page } from "@playwright/test";
import { open } from "./support/flows";
import { expect, test } from "./support/test";

const main = (page: Page) => page.getByRole("main");
const publicTab = (page: Page) => main(page).getByRole("tabpanel", { name: "Public" });
const cards = (page: Page) => publicTab(page).locator('a[href^="/builds/view"]');
const publicSelects = (page: Page) => publicTab(page).locator('button[aria-haspopup="listbox"]');
const heroSelect = (page: Page) => publicSelects(page).first();
const card = (page: Page, name: string) => publicTab(page).getByRole("link", { name, exact: true });
const mineTab = (page: Page) => main(page).getByRole("tabpanel", { name: "Mine" });
const mineRow = (page: Page, name: string) =>
    mineTab(page)
        .getByRole("listitem")
        .filter({ has: page.getByRole("link", { name, exact: true }) });

const mineHeroSelect = (page: Page) => mineTab(page).locator('button[aria-haspopup="listbox"]');

async function openMine(page: Page) {
    await main(page).getByRole("tab", { name: "Mine", exact: true }).click();
    await expect(mineTab(page).getByRole("listitem").first()).toBeVisible();
}

async function pickMineHero(page: Page, name: string) {
    await mineHeroSelect(page).click();
    await page.getByRole("option", { name, exact: true }).click();
    await expect(mineHeroSelect(page)).toHaveText(name);
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

test("switching the hero shows that hero's builds, this week's top builds first", async ({ page }) => {
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

test("heroes still in development are not offered", async ({ page }) => {
    await heroSelect(page).click();
    await expect(page.getByRole("option", { name: "Haze", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "Skyrunner", exact: true })).toHaveCount(0);
});

test("picking a hero and a sort writes both to the URL", async ({ page }) => {
    await pickHero(page, "Haze");
    await expect(page).toHaveURL(/[?&]hero=13(&|$)/);
    await pickHero(page, "Kelvin");
    await expect(page).toHaveURL(/[?&]hero=12(&|$)/);
    await publicSelects(page).nth(1).click();
    // Sorts in order: popular, this week, favourites, recently updated.
    await page.getByRole("option").nth(3).click();
    await expect(page).toHaveURL(/[?&]sort=updated(&|$)/);
    await expect(cards(page)).toHaveText(["Kelvin lane bully", "Absolute Zero", "Frost Wall", "Kelvin Cold Bullets"]);
});

test("?sort=updated lists the most recently updated builds first", async ({ page }) => {
    await open(page, "/builds?hero=12&sort=updated");
    await expect(cards(page)).toHaveText(["Kelvin lane bully", "Absolute Zero", "Frost Wall", "Kelvin Cold Bullets"]);
});

test("?min_fav= leaves out builds with fewer favourites", async ({ page }) => {
    await open(page, "/builds?hero=12&min_fav=1000");
    await expect(cards(page)).toHaveText(["Absolute Zero", "Frost Wall"]);
});

test("?lang=any also lists builds in other languages", async ({ page }) => {
    await open(page, "/builds?hero=13&lang=any");
    await expect(card(page, "Хейз через пушку")).toBeVisible();
});

test("filters stay after opening a build and going back", async ({ page }) => {
    await open(page, "/builds?hero=12&sort=updated");
    await card(page, "Frost Wall").click();
    await expect(page).toHaveURL(/\/builds\/view\?source=public&id=384019$/);
    await page.goBack();
    await expect(page).toHaveURL(/[?&]sort=updated(&|$)/);
    await expect(cards(page)).toHaveText(["Kelvin lane bully", "Absolute Zero", "Frost Wall", "Kelvin Cold Bullets"]);
});

test("My builds lists a stored draft on its own Draft row, which opens the draft in the editor", async ({ page }) => {
    await openMine(page);
    await expect(mineRow(page, "Infernus test")).toContainText("Local");
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
    await expect(mineTab(page).getByRole("link", { name: "Bullet Dance Crit", exact: true })).toHaveCount(0);
    const showFavourites = mineTab(page).getByRole("button", { name: "Favourites", exact: true });
    await showFavourites.click();
    const favourites = mineTab(page).getByTestId("favourites");
    const link = favourites.getByRole("link", { name: "Bullet Dance Crit", exact: true });
    const row = favourites
        .getByRole("listitem")
        .filter({ has: page.getByRole("link", { name: "Bullet Dance Crit", exact: true }) });
    await expect(row).toContainText("Haze");
    await expect(row).toContainText("By Brass Tack");
    await expect(link).toHaveAttribute("href", "/builds/view?source=local&id=381204");

    const actions = row.getByRole("button", { name: "More actions for Bullet Dance Crit", exact: true });
    await actions.click();
    await page.getByRole("menuitem", { name: "Edit a copy", exact: true }).click();
    await expect(page).toHaveURL(/\/builds\/edit\?source=local&id=381204$/);
    await expect(page.getByTestId("build-name")).toHaveValue("Bullet Dance Crit (copy)");

    await open(page, "/builds");
    await openMine(page);
    await showFavourites.click();
    await actions.click();
    await page.getByRole("menuitem", { name: "Unfavourite", exact: true }).click();
    await expect(favourites).toHaveCount(0);
    await expect(mineTab(page)).toContainText("You have no favourites yet.");
    await mineTab(page).getByRole("button", { name: "My builds", exact: true }).click();
    await expect(mineRow(page, "Infernus test")).toBeVisible();
});

test("My builds shows a published build as Public with its favourites and version", async ({ page }) => {
    await openMine(page);
    const published = mineRow(page, "Afterburn all day");
    await expect(published).toContainText("Public");
    await expect(published).toContainText("Version 4");
    await expect(published.getByTestId("favourite-count")).toContainText("37");
    await expect(mineRow(page, "Infernus test").getByTestId("favourite-count")).toHaveCount(0);
    await expect(mineRow(page, "Infernus test")).not.toContainText("Version");
    await expect(mineTab(page)).not.toContainText("In game");
    await expect(mineTab(page)).not.toContainText("Published");
});

test("My builds and Favourites filter by hero, with New build for a hero that has none", async ({ page }) => {
    await openMine(page);
    await expect(mineHeroSelect(page)).toHaveText("All heroes");
    await pickMineHero(page, "Haze");
    await expect(mineRow(page, "Bullet Dance Crit (copy)")).toBeVisible();
    await expect(mineRow(page, "Infernus test")).toHaveCount(0);
    await mineTab(page).getByRole("button", { name: "Favourites", exact: true }).click();
    await expect(mineTab(page).getByRole("link", { name: "Bullet Dance Crit", exact: true })).toBeVisible();

    await pickMineHero(page, "Kelvin");
    await expect(mineTab(page)).toContainText("You have no Kelvin favourites yet.");
    await mineTab(page).getByRole("button", { name: "My builds", exact: true }).click();
    await expect(mineTab(page)).toContainText("You have no Kelvin builds yet.");
    await expect(mineTab(page).getByTestId("new-build")).toHaveAttribute("href", "/builds/edit?new=12");

    await pickMineHero(page, "All heroes");
    await expect(mineRow(page, "Infernus test")).toBeVisible();
    await expect(mineRow(page, "Bullet Dance Crit (copy)")).toBeVisible();
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
