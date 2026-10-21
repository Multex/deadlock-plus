import type { Page } from "@playwright/test";
import { open } from "./support/flows";
import { expect, test } from "./support/test";

const main = (page: Page) => page.getByRole("main");
const publicTab = (page: Page) => main(page).getByRole("tabpanel", { name: "Public" });
const cards = (page: Page) => publicTab(page).locator('a[href^="/builds/view"]');
const heroSelect = (page: Page) => main(page).locator('button[aria-haspopup="listbox"]');
const card = (page: Page, name: string) => publicTab(page).getByRole("link", { name, exact: true });

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
