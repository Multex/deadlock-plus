import type { Page } from "@playwright/test";
import { open } from "./support/flows";
import { expect, test } from "./support/test";

const main = (page: Page) => page.getByRole("main");
const publicTab = (page: Page) => main(page).getByRole("tabpanel", { name: "Public" });
const list = (page: Page) => main(page).getByTestId("build-list");
const rows = (page: Page) => list(page).locator("[data-row-link]");
const publicSelects = (page: Page) => publicTab(page).locator('button[aria-haspopup="listbox"]');
const heroSelect = (page: Page) => publicSelects(page).first();
const row = (page: Page, name: string) => list(page).getByRole("link", { name, exact: true });
const detail = (page: Page) => main(page).getByTestId("build-detail");
const overviewName = (page: Page) => detail(page).getByTestId("overview-name");
const mineTab = (page: Page) => main(page).getByRole("tabpanel", { name: "Mine" });
const rowItem = (page: Page, name: string) =>
    list(page)
        .getByRole("listitem")
        .filter({ has: page.getByRole("link", { name, exact: true }) });
const mineSelects = (page: Page) => mineTab(page).locator('button[aria-haspopup="listbox"]');
const mineHeroSelect = (page: Page) => mineSelects(page).first();

async function openMine(page: Page) {
    await main(page).getByRole("tab", { name: "Mine", exact: true }).click();
    await expect(rows(page).first()).toBeVisible();
}

async function pick(page: Page, select: ReturnType<typeof heroSelect>, name: string) {
    await select.click();
    await page.getByRole("option", { name, exact: true }).click();
    await expect(select).toHaveText(name);
}

const pickHero = (page: Page, name: string) => pick(page, heroSelect(page), name);
const pickMineHero = (page: Page, name: string) => pick(page, mineHeroSelect(page), name);

async function selectRow(page: Page, name: string) {
    await row(page, name).click();
    await expect(overviewName(page)).toHaveText(name);
}

test.beforeEach(async ({ page }) => {
    await open(page, "/builds");
});

test("the page opens on the hero of the newest match", async ({ page }) => {
    await expect(heroSelect(page)).toHaveText("Kelvin");
});

test("switching the hero shows that hero's builds, this week's top builds first", async ({ page }) => {
    await pickHero(page, "Haze");
    await expect(rows(page)).toHaveText(["Bullet Dance Crit", "Sleepy Spirit Haze"]);

    await pickHero(page, "Infernus");
    await expect(rows(page)).toHaveText(["Burn Everything", "Afterburn all day"]);
    await expect(row(page, "Bullet Dance Crit")).toHaveCount(0);
});

test("builds in another language than the app's and English are left out", async ({ page }) => {
    await pickHero(page, "Haze");
    await expect(row(page, "Bullet Dance Crit")).toBeVisible();
    await expect(row(page, "Хейз через пушку")).toHaveCount(0);
});

test("the first build is selected and its full shop shows beside the list", async ({ page }) => {
    await pickHero(page, "Haze");
    await expect(row(page, "Bullet Dance Crit")).toHaveAttribute("aria-current", "true");
    await expect(overviewName(page)).toHaveText("Bullet Dance Crit");
    await expect(detail(page).getByTestId("shop").locator("section.category").first()).toBeVisible();
    await expect(detail(page).getByTestId("ability-order")).toBeVisible();
    await expect(main(page).getByTestId("shop")).toHaveCount(1);
});

test("a row shows its core items, tags, favourites and win rate", async ({ page }) => {
    await pickHero(page, "Haze");
    const first = rowItem(page, "Bullet Dance Crit");
    await expect(first.locator("[data-slot]")).toHaveCount(6);
    await expect(first.locator('[title="Weapon"]')).toHaveCount(1);
    await expect(first.getByTestId("favourite-count")).toContainText("9,812");
    await expect(first.getByTestId("win-rate")).toContainText("win rate");
    await expect(first).toContainText("By Brass Tack");
});

test("clicking a row selects it, writes it to the URL and keeps the selection after Back", async ({ page }) => {
    await pickHero(page, "Haze");
    await selectRow(page, "Sleepy Spirit Haze");
    await expect(page).toHaveURL(/[?&]build=\d+(&|$)/);
    await expect(page).toHaveURL(/\/builds\?/);

    await detail(page).getByTestId("open-full-view").click();
    await expect(page).toHaveURL(/\/builds\/view\?source=public&id=\d+$/);
    await page.goBack();
    await expect(overviewName(page)).toHaveText("Sleepy Spirit Haze");
    await expect(row(page, "Sleepy Spirit Haze")).toHaveAttribute("aria-current", "true");
});

test("arrow keys move the selection and Enter opens the full view", async ({ page }) => {
    await open(page, "/builds?hero=12&sort=updated");
    await row(page, "Kelvin lane bully").focus();
    await page.keyboard.press("ArrowDown");
    await expect(overviewName(page)).toHaveText("Absolute Zero");
    await expect(row(page, "Absolute Zero")).toBeFocused();
    await page.keyboard.press("End");
    await expect(overviewName(page)).toHaveText("Kelvin Cold Bullets");
    await page.keyboard.press("ArrowDown");
    await expect(overviewName(page)).toHaveText("Kelvin Cold Bullets");
    await page.keyboard.press("ArrowUp");
    await expect(overviewName(page)).toHaveText("Frost Wall");

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/builds\/view\?source=public&id=384019$/);
});

test("the detail pane copies, favourites and edits a copy of a public build", async ({ page }) => {
    await pickHero(page, "Haze");
    await selectRow(page, "Sleepy Spirit Haze");
    await detail(page).getByTestId("copy-as-new").click();
    await expect(detail(page).getByRole("status")).toContainText("Copied as a new build.");

    const favourite = detail(page).getByTestId("favourite");
    await expect(favourite).toHaveAttribute("aria-pressed", "false");
    await favourite.click();
    await expect(favourite).toHaveAttribute("aria-pressed", "true");

    const edit = detail(page).getByTestId("edit-build");
    await expect(edit).toHaveText("Edit a copy");
    await edit.click();
    await expect(page).toHaveURL(/\/builds\/edit\?source=public&id=\d+$/);
});

test("a narrow window shows the detail in place of the list, with a way back", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await pickHero(page, "Haze");
    await expect(detail(page)).toBeHidden();
    await row(page, "Sleepy Spirit Haze").click();
    await expect(overviewName(page)).toHaveText("Sleepy Spirit Haze");
    await expect(list(page)).toBeHidden();
    await detail(page).getByTestId("back-to-list").click();
    await expect(row(page, "Sleepy Spirit Haze")).toBeVisible();
});

test("a hero with no public builds shows the empty state", async ({ page }) => {
    await pickHero(page, "Seven");
    await expect(main(page).getByRole("status")).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
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
    await expect(rows(page)).toHaveText(["Kelvin lane bully", "Absolute Zero", "Frost Wall", "Kelvin Cold Bullets"]);
});

test("?sort=updated lists the most recently updated builds first", async ({ page }) => {
    await open(page, "/builds?hero=12&sort=updated");
    await expect(rows(page)).toHaveText(["Kelvin lane bully", "Absolute Zero", "Frost Wall", "Kelvin Cold Bullets"]);
});

test("?min_fav= leaves out builds with fewer favourites", async ({ page }) => {
    await open(page, "/builds?hero=12&min_fav=1000");
    await expect(rows(page)).toHaveText(["Absolute Zero", "Frost Wall"]);
});

test("?lang=any also lists builds in other languages", async ({ page }) => {
    await open(page, "/builds?hero=13&lang=any");
    await expect(row(page, "Хейз через пушку")).toBeVisible();
});

test("filters stay after opening a build and going back", async ({ page }) => {
    await open(page, "/builds?hero=12&sort=updated");
    await row(page, "Frost Wall").click();
    await detail(page).getByTestId("open-full-view").click();
    await expect(page).toHaveURL(/\/builds\/view\?source=public&id=384019$/);
    await page.goBack();
    await expect(page).toHaveURL(/[?&]sort=updated(&|$)/);
    await expect(rows(page)).toHaveText(["Kelvin lane bully", "Absolute Zero", "Frost Wall", "Kelvin Cold Bullets"]);
    await expect(overviewName(page)).toHaveText("Frost Wall");
});

test("My builds lists a stored draft on its own Draft row, whose Edit opens the draft in the editor", async ({
    page,
}) => {
    await openMine(page);
    await expect(page).toHaveURL(/[?&]tab=mine(&|$)/);
    await expect(rowItem(page, "Infernus test")).toContainText("Local");
    await expect(rowItem(page, "Infernus burst")).toContainText("Draft");

    await selectRow(page, "Infernus burst");
    const edit = detail(page).getByTestId("edit-build");
    await expect(edit).toHaveAttribute("href", /^\/builds\/edit\?source=draft&id=[^&]+$/);
    await edit.click();
    await expect(page).toHaveURL(/\/builds\/edit\?source=draft&id=[^&]+$/);
    await expect(page.getByTestId("build-name")).toHaveValue("Infernus burst");
});

test("discarding a draft from its view takes its row out of My builds", async ({ page }) => {
    await openMine(page);
    await selectRow(page, "Infernus burst");
    await detail(page).getByTestId("open-full-view").click();
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
    await expect(rowItem(page, "Infernus test")).toBeVisible();
    await expect(rowItem(page, "Infernus burst")).toHaveCount(0);
});

test("discarding a draft from My builds asks first", async ({ page }) => {
    await openMine(page);
    await selectRow(page, "Infernus burst");
    await detail(page).getByTestId("discard-draft").click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(rowItem(page, "Infernus burst")).toBeVisible();

    await detail(page).getByTestId("discard-draft").click();
    await confirm.getByRole("button", { name: "Discard draft", exact: true }).click();
    await expect(rowItem(page, "Infernus burst")).toHaveCount(0);
});

test("deleting a local build from My builds asks first", async ({ page }) => {
    await openMine(page);
    await selectRow(page, "Infernus test");
    await detail(page).getByTestId("delete-build").click();
    const confirm = page.getByRole("alertdialog");
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(rowItem(page, "Infernus test")).toBeVisible();

    await detail(page).getByTestId("delete-build").click();
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(rowItem(page, "Infernus test")).toHaveCount(0);
});

test("a published build can only be deleted in-game", async ({ page }) => {
    await openMine(page);
    await selectRow(page, "Afterburn all day");
    await expect(detail(page).getByTestId("delete-in-game")).toBeDisabled();
    await expect(detail(page).getByTestId("delete-build")).toHaveCount(0);
});

test("copying and favouriting an own build from My builds", async ({ page }) => {
    await openMine(page);
    await selectRow(page, "Infernus test");
    await detail(page).getByTestId("copy-as-new").click();
    await expect(rowItem(page, "Infernus test (copy)")).toBeVisible();

    await selectRow(page, "Infernus test");
    const favourite = detail(page).getByTestId("favourite");
    await expect(favourite).toHaveAttribute("aria-pressed", "false");
    await favourite.click();
    await expect(favourite).toHaveAttribute("aria-pressed", "true");
    await expect(rowItem(page, "Infernus test").getByTestId("favourited")).toBeVisible();
});

test("My builds lists another player's favourite with its author, edits a copy of it and unfavourites it", async ({
    page,
}) => {
    await openMine(page);
    await expect(row(page, "Bullet Dance Crit")).toHaveCount(0);
    const showFavourites = mineTab(page).getByRole("button", { name: "Favourites", exact: true });
    await showFavourites.click();
    await expect(page).toHaveURL(/[?&]view=favourites(&|$)/);
    const favourite = rowItem(page, "Bullet Dance Crit");
    await expect(favourite).toContainText("Haze");
    await expect(favourite).toContainText("By Brass Tack");
    await expect(row(page, "Bullet Dance Crit")).toHaveAttribute("href", "/builds/view?source=local&id=381204");

    await selectRow(page, "Bullet Dance Crit");
    await detail(page).getByTestId("edit-copy").click();
    await expect(page).toHaveURL(/\/builds\/edit\?source=local&id=381204$/);
    await expect(page.getByTestId("build-name")).toHaveValue("Bullet Dance Crit (copy)");

    await open(page, "/builds?tab=mine&view=favourites");
    await detail(page).getByTestId("favourite").click();
    await expect(favourite).toHaveCount(0);
    await expect(mineTab(page)).toContainText("You have no favourites yet.");
    await mineTab(page).getByRole("button", { name: "My builds", exact: true }).click();
    await expect(rowItem(page, "Infernus test")).toBeVisible();
});

test("My builds shows a published build as Public with its favourites and version", async ({ page }) => {
    await openMine(page);
    const published = rowItem(page, "Afterburn all day");
    await expect(published).toContainText("Public");
    await expect(published).toContainText("Version 4");
    await expect(published.getByTestId("favourite-count")).toContainText("37");
    await expect(rowItem(page, "Infernus test").getByTestId("favourite-count")).toHaveCount(0);
    await expect(rowItem(page, "Infernus test")).not.toContainText("Version");
    await expect(mineTab(page)).not.toContainText("In game");
    await expect(mineTab(page)).not.toContainText("Published");
});

test("My builds and Favourites filter by hero, with New build for that hero", async ({ page }) => {
    await openMine(page);
    await expect(mineHeroSelect(page)).toHaveText("All heroes");
    await pickMineHero(page, "Haze");
    await expect(rowItem(page, "Bullet Dance Crit (copy)")).toBeVisible();
    await expect(rowItem(page, "Infernus test")).toHaveCount(0);
    await mineTab(page).getByRole("button", { name: "Favourites", exact: true }).click();
    await expect(row(page, "Bullet Dance Crit")).toBeVisible();

    await pickMineHero(page, "Kelvin");
    await expect(mineTab(page)).toContainText("You have no Kelvin favourites yet.");
    await mineTab(page).getByRole("button", { name: "My builds", exact: true }).click();
    await expect(mineTab(page)).toContainText("You have no Kelvin builds yet.");
    await expect(mineTab(page).getByTestId("new-build")).toHaveAttribute("href", "/builds/edit?new=12");

    await pickMineHero(page, "All heroes");
    await expect(rowItem(page, "Infernus test")).toBeVisible();
    await expect(rowItem(page, "Bullet Dance Crit (copy)")).toBeVisible();
});

test("My builds filters by status and writes it to the URL", async ({ page }) => {
    await openMine(page);
    await pick(page, mineSelects(page).nth(2), "Public");
    await expect(page).toHaveURL(/[?&]status=public(&|$)/);
    await expect(rows(page)).toHaveText(["Afterburn all day"]);

    await pick(page, mineSelects(page).nth(2), "Draft");
    await expect(rows(page)).toHaveText(["Infernus burst"]);

    await open(page, "/builds?tab=mine&status=local&mhero=13");
    await expect(rows(page)).toHaveText(["Bullet Dance Crit (copy)"]);
    await mineTab(page).getByRole("button", { name: "Clear filters", exact: true }).click();
    await expect(rows(page).filter({ hasText: "Afterburn all day" })).toHaveCount(1);
});

test("My builds sorts by name and by favourites", async ({ page }) => {
    await openMine(page);
    await pick(page, mineSelects(page).nth(1), "Name");
    await expect(page).toHaveURL(/[?&]msort=name(&|$)/);
    const names = await rows(page).allTextContents();
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));

    await pick(page, mineSelects(page).nth(1), "Most favourited");
    await expect(rows(page).first()).toHaveText("Afterburn all day");
});

test("My builds filters by tag and by name", async ({ page }) => {
    await openMine(page);
    const all = await rows(page).count();
    await mineTab(page).getByRole("searchbox", { name: "Search builds" }).fill("infernus");
    await expect(rows(page)).toHaveText(["Infernus burst", "Infernus test"]);
    await expect(page).toHaveURL(/[?&]mq=infernus(&|$)/);
    await mineTab(page).getByRole("searchbox", { name: "Search builds" }).fill("");
    await expect(rows(page)).toHaveCount(all);

    await pick(page, mineSelects(page).nth(3), "Weapon");
    await expect(page).toHaveURL(/[?&]mtag=\d+(&|$)/);
    await expect(rows(page)).toHaveCount(0);
    await expect(mineTab(page)).toContainText("No builds match these filters.");

    await mineTab(page).getByRole("button", { name: "Favourites", exact: true }).click();
    await expect(rows(page)).toHaveText(["Bullet Dance Crit"]);
    await expect(rowItem(page, "Bullet Dance Crit").locator('[title="Weapon"]')).toHaveCount(1);
    await pick(page, mineSelects(page).nth(3), "Spirit");
    await expect(rows(page)).toHaveCount(0);
});

test("?hero= opens the Public tab on that hero", async ({ page }) => {
    await open(page, "/builds?hero=13");
    await expect(main(page).getByRole("tab", { name: "Public", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(heroSelect(page)).toHaveText("Haze");
    await expect(row(page, "Bullet Dance Crit")).toBeVisible();
});

test("a hero row on Stats links to that hero's public builds", async ({ page }) => {
    await open(page, "/stats");
    const statRow = main(page)
        .getByRole("listitem")
        .filter({ has: page.locator('a[href^="/builds?hero="]') })
        .nth(1);
    const hero = (await statRow.locator("p.font-heading").textContent())!.trim();
    const link = statRow.locator('a[href^="/builds?hero="]');
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
