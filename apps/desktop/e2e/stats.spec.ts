import type { Page } from "@playwright/test";
import { open } from "./support/flows";
import { expect, test } from "./support/test";

const main = (page: Page) => page.getByRole("main");
const rankSection = (page: Page) => main(page).getByRole("region", { name: "Rank", exact: true });
const gamesSection = (page: Page) => main(page).getByRole("region", { name: "Your games", exact: true });
const matchCount = (page: Page) => gamesSection(page).getByText(/^\d+ matches(?! known)/);
const filter = (page: Page, name: string) => gamesSection(page).getByRole("button", { name, exact: true });

test.beforeEach(async ({ page }) => {
    await open(page, "/stats");
});

test("the rank section shows the rank, the next rank and what the next games do", async ({ page }) => {
    const section = rankSection(page);
    await expect(section.getByRole("heading", { level: 2, name: "Rank", exact: true })).toBeVisible();
    await expect(section.getByRole("progressbar")).toBeVisible();
    await expect(section.getByText(/^\d+ \/ \d+ to .+\. \d+ wins? in a row from here\.$/)).toBeVisible();
    for (const label of ["Next win", "Next loss", "Demotion shields", "Outlook"]) {
        await expect(section.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(section.getByText("Winrate to hold your rank")).toBeVisible();
    await expect(section.getByText("Your last 20", { exact: true })).toBeVisible();
    await expect(section.getByText(/^(Climbing|Sliding)$/)).toBeVisible();
    await expect(section.getByRole("img", { name: /over your last 20: (climbing|sliding)\./ })).toBeVisible();
});

test("the rank section holds the progress chart and comes before Your games", async ({ page }) => {
    const chart = rankSection(page).getByRole("group", { name: "Rank progress over your recent ranked matches" });
    await expect(chart).toBeVisible();
    await expect(chart.getByRole("img", { name: /(Promoted|Demoted) from / }).first()).toBeAttached();

    const rankBox = await rankSection(page).boundingBox();
    const gamesBox = await gamesSection(page).boundingBox();
    expect(rankBox!.y + rankBox!.height).toBeLessThanOrEqual(gamesBox!.y);
});

test("the filters sit in the Your games section and leave the rank section alone", async ({ page }) => {
    const games = gamesSection(page);
    await expect(games.getByRole("heading", { level: 2, name: "Your games", exact: true })).toBeVisible();
    await expect(rankSection(page).getByRole("button", { name: "All time", exact: true })).toHaveCount(0);

    const before = await rankSection(page).innerText();
    const count = await matchCount(page).innerText();

    await filter(page, "All time").click();
    await filter(page, "All modes").click();

    await expect(matchCount(page)).not.toHaveText(count);
    expect(await rankSection(page).innerText()).toBe(before);
});

test("there is no recent matches list or rank changes list", async ({ page }) => {
    await expect(main(page).getByRole("heading", { name: "Recent ranked matches" })).toHaveCount(0);
    await expect(main(page).getByRole("heading", { name: "Rank changes" })).toHaveCount(0);
});

test("/rank lands on /stats", async ({ page }) => {
    await open(page, "/rank");
    await expect(page).toHaveURL(/\/stats$/);
    await expect(rankSection(page)).toBeVisible();
});
