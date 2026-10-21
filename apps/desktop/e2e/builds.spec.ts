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

test("My builds lists a stored draft on its own Draft row, which opens the draft", async ({ page }) => {
    await openMine(page);
    await expect(mineRow(page, "Infernus test")).toContainText("In game");
    const draft = mineRow(page, "Infernus burst");
    await expect(draft).toContainText("Draft");
    const link = draft.getByRole("link", { name: "Infernus burst", exact: true });
    await expect(link).toHaveAttribute("href", /^\/builds\/view\?source=draft&id=[^&]+$/);

    await link.click();
    const header = page.getByTestId("build-header");
    await expect(header.getByRole("heading", { level: 1, name: "Infernus burst", exact: true })).toBeVisible();
    await expect(header.locator("[data-status]")).toHaveAttribute("data-status", "draft");
    await expect(page.getByTestId("copy-as-new")).toBeVisible();
});

test("discarding a draft from its view takes its row out of My builds", async ({ page }) => {
    await openMine(page);
    await mineRow(page, "Infernus burst").getByRole("link", { name: "Infernus burst", exact: true }).click();
    await page.getByTestId("discard-draft").click();
    await expect(page).toHaveURL(/\/builds$/);
    await openMine(page);
    await expect(mineRow(page, "Infernus test")).toBeVisible();
    await expect(mineRow(page, "Infernus burst")).toHaveCount(0);
});
