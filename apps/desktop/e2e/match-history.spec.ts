import type { Locator, Page } from "@playwright/test";
import { open } from "./support/flows";
import { expect, settle, test } from "./support/test";

const MATCHES = 60;
const PAGE_SIZE = 25;
// Pages hold whole play sessions, so they close at the first session that reaches PAGE_SIZE matches.
const PAGES = [28, 26, 6];
const NEWEST = 990000060;

const main = (page: Page) => page.getByRole("main");
const filters = (page: Page) => page.getByRole("group", { name: "Match filters" });
const option = (page: Page, group: string, name: string) =>
    filters(page).getByRole("group", { name: group, exact: true }).getByRole("button", { name, exact: true });
// The findings below the list are lists too, so only items holding a match link count as rows.
const rows = (page: Page) =>
    main(page)
        .getByRole("listitem")
        .filter({ has: page.getByRole("link") });
// The summary strip is a list of terms, each followed by its values.
const matchTotal = (page: Page) =>
    main(page).getByLabel("Summary of the matches in this list", { exact: true }).getByRole("definition").first();
const pager = (page: Page) => page.getByRole("navigation", { name: "Match history pages" });
const noResults = (page: Page) => main(page).getByText("No matches fit these filters.");

// A page closes only once it holds PAGE_SIZE matches, so a total just over PAGE_SIZE can still fit on one page.
async function expectTotal(page: Page, total: number, singlePage = total <= PAGE_SIZE) {
    await expect(matchTotal(page)).toHaveText(String(total));
    if (singlePage) await expect(rows(page)).toHaveCount(total);
    else await expect(pager(page)).toBeVisible();
}

async function expectEveryRow(page: Page, name: RegExp) {
    const links = rows(page).getByRole("link");
    await expect(links.first()).toBeVisible();
    for (const link of await links.all()) await expect(link).toHaveAccessibleName(name);
}

async function pickHero(page: Page, hero: string) {
    await filters(page).getByRole("combobox", { name: "Hero", exact: true }).click();
    await page.getByRole("listbox").getByRole("option", { name: hero, exact: true }).click();
    await expect(page.getByRole("listbox")).toBeHidden();
}

test.describe("the list", () => {
    test.beforeEach(async ({ page }) => {
        await open(page, "/match-history");
        await expectTotal(page, MATCHES);
    });

    test("the mode filter keeps only matches of that mode", async ({ page }) => {
        await option(page, "Mode", "Ranked").click();
        await expect(option(page, "Mode", "Ranked")).toHaveAttribute("aria-pressed", "true");
        await expectTotal(page, 53);
        await expectEveryRow(page, /^\S+( & \S+)? Ranked /);

        await option(page, "Mode", "Unranked").click();
        await expectTotal(page, 7);
        await expectEveryRow(page, / Unranked /);

        await option(page, "Mode", "Street Brawl").click();
        await expect(noResults(page)).toBeVisible();
        await expect(rows(page)).toHaveCount(0);

        await option(page, "Mode", "All modes").click();
        await expectTotal(page, MATCHES);
    });

    test("the outcome filter keeps only wins, only losses, or matches with no result", async ({ page }) => {
        await option(page, "Outcome", "Win").click();
        await expectTotal(page, 33);
        await expect(main(page).getByText("33W 0L", { exact: true })).toBeVisible();
        await expectEveryRow(page, / Win( Grade [^,]+, score [\d.]+, \S+)? \d/);

        await option(page, "Outcome", "Loss").click();
        await expectTotal(page, 27, true);
        await expect(main(page).getByText("0W 27L", { exact: true })).toBeVisible();
        await expectEveryRow(page, / Loss( Grade [^,]+, score [\d.]+, \S+)? \d/);

        await option(page, "Outcome", "Not scored").click();
        await expect(noResults(page)).toBeVisible();

        await option(page, "Outcome", "All outcomes").click();
        await expectTotal(page, MATCHES);
    });

    test("the date window keeps only matches inside it", async ({ page }) => {
        await option(page, "Date window", "7 days").click();
        await expect(option(page, "Date window", "7 days")).toHaveAttribute("aria-pressed", "true");
        await expectTotal(page, 19);
        await expect(pager(page)).toHaveCount(0);

        // The scenario holds three weeks of matches, so the wider windows hold all of them.
        for (const window of ["30 days", "90 days", "All time"]) {
            await option(page, "Date window", window).click();
            await expect(option(page, "Date window", window)).toHaveAttribute("aria-pressed", "true");
            await expectTotal(page, MATCHES);
        }
    });

    test("the hero menu keeps only matches on the picked hero", async ({ page }) => {
        await pickHero(page, "Abrams");
        await expect(filters(page).getByRole("combobox", { name: "Hero", exact: true })).toHaveText(/Abrams/);
        await expectTotal(page, 11);
        await expectEveryRow(page, /^Abrams /);

        await pickHero(page, "Wraith");
        await expectTotal(page, 2);
        await expectEveryRow(page, /^Wraith /);

        await pickHero(page, "All heroes");
        await expectTotal(page, MATCHES);
    });

    test("filters combine, and Clear filters removes all of them", async ({ page }) => {
        await expect(filters(page).getByRole("button", { name: "Clear filters", exact: true })).toHaveCount(0);

        await pickHero(page, "Abrams");
        await option(page, "Outcome", "Loss").click();
        await expectTotal(page, 3);
        await expectEveryRow(page, /^Abrams .* Loss( Grade [^,]+, score [\d.]+, \S+)? \d/);

        await filters(page).getByRole("button", { name: "Clear filters", exact: true }).click();

        await expectTotal(page, MATCHES);
        await expect(option(page, "Outcome", "All outcomes")).toHaveAttribute("aria-pressed", "true");
        await expect(filters(page).getByRole("combobox", { name: "Hero", exact: true })).toHaveText(/All heroes/);
    });

    test("Custom matches switches to custom games and locks the mode filter", async ({ page }) => {
        const custom = filters(page).getByRole("button", { name: "Custom matches", exact: true });
        await custom.click();

        await expect(custom).toHaveAttribute("aria-pressed", "true");
        await expect(option(page, "Mode", "Ranked")).toBeDisabled();
        await expect(noResults(page)).toBeVisible();

        await main(page).getByRole("button", { name: "Clear filters", exact: true }).last().click();

        await expect(custom).toHaveAttribute("aria-pressed", "false");
        await expect(option(page, "Mode", "Ranked")).toBeEnabled();
        await expectTotal(page, MATCHES);
    });

    test("the pager walks through every page and stops at both ends", async ({ page }) => {
        const previous = pager(page).getByRole("button", { name: "Previous page", exact: true });
        const next = pager(page).getByRole("button", { name: "Next page", exact: true });
        const firstMatch = () => rows(page).getByRole("link").first();

        await expect(pager(page).getByText("Page 1 of 3")).toBeVisible();
        await expect(previous).toBeDisabled();
        await expect(firstMatch()).toHaveAttribute("href", `/match-history/${NEWEST}`);

        await expect(rows(page)).toHaveCount(PAGES[0]);

        await next.click();
        await expect(pager(page).getByText("Page 2 of 3")).toBeVisible();
        await expect(rows(page)).toHaveCount(PAGES[1]);
        await expect(firstMatch()).toHaveAttribute("href", `/match-history/${NEWEST - PAGES[0]}`);
        await expect(previous).toBeEnabled();

        await next.click();
        await expect(pager(page).getByText("Page 3 of 3")).toBeVisible();
        await expect(rows(page)).toHaveCount(PAGES[2]);
        await expect(next).toBeDisabled();

        await previous.click();
        await expect(pager(page).getByText("Page 2 of 3")).toBeVisible();
    });

    test("changing a filter on a later page goes back to the first page", async ({ page }) => {
        await pager(page).getByRole("button", { name: "Next page", exact: true }).click();
        await pager(page).getByRole("button", { name: "Next page", exact: true }).click();
        await expect(pager(page).getByText("Page 3 of 3")).toBeVisible();

        await option(page, "Outcome", "Win").click();

        await expect(pager(page).getByText("Page 1 of 2")).toBeVisible();
        await expect(rows(page)).toHaveCount(27);
    });

    test("a match row opens that match, and Back returns to the list", async ({ page }) => {
        await rows(page).getByRole("link").first().click();

        await expect(page).toHaveURL(new RegExp(`/match-history/${NEWEST}$`));
        await expect(page.getByRole("heading", { level: 1, name: `Match ${NEWEST}` })).toBeVisible();
        await expect(page.getByRole("table", { name: "Scoreboard" })).toBeVisible();

        await page.getByRole("link", { name: "Back to match history", exact: true }).click();

        await expect(page).toHaveURL(/\/match-history$/);
        await expectTotal(page, MATCHES);
    });

    test("a graded match row shows your grade letter and place beside the result", async ({ page }) => {
        const first = rows(page).getByRole("link").first();
        const grade = first.getByTitle(/^Grade /);

        await expect(grade).toHaveText(/^Grade ([SABCDEF][+-]?), score \d+\.\d, (\d+(st|nd|rd|th))\s*\1\s*\2$/);
        const label = (await grade.getAttribute("title"))!;
        const [, letter, place] = label.match(/^Grade (\S+), score [\d.]+, (\S+)$/)!;
        await expect(grade.getByText(letter!, { exact: true })).toBeVisible();
        await expect(grade.getByText(place!, { exact: true })).toBeVisible();
        await expect(first).toHaveAccessibleName(new RegExp(label.replace(/[.+]/g, "\\$&")));
    });
});

test.describe("a match", () => {
    const minimap = (page: Page) => page.getByRole("group", { name: "Minimap with player positions" });
    const deathMap = (page: Page) => page.getByRole("button", { name: "Death map", exact: true });

    test.beforeEach(async ({ page }) => {
        await open(page, `/match-history/${NEWEST}`);
    });

    test("a match URL loaded directly shows the summary, the scoreboard and every card", async ({ page }) => {
        await expect(page.getByRole("heading", { level: 1, name: `Match ${NEWEST}` })).toBeVisible();
        await expect(
            page.getByRole("region", { name: "Match summary" }).getByRole("heading", { name: "Win" }),
        ).toBeVisible();
        const scoreboard = page.getByRole("table", { name: "Scoreboard" });
        await expect(scoreboard.getByRole("img", { name: "Kelvin", exact: true }).first()).toBeVisible();
        for (const card of ["Replay", "Ping", "Souls and damage", "Purchases"]) {
            await expect(page.getByRole("heading", { level: 2, name: card, exact: true })).toBeVisible();
        }
    });

    test("item slots stay square after artwork loads and when the board is resized", async ({ page }) => {
        const items = page.getByRole("table", { name: "Scoreboard" }).getByRole("list", { name: "Items", exact: true });
        await expect(items).toHaveCount(12);
        await expect(items.getByRole("img").first()).toBeVisible();

        for (const width of [1280, 1480, 1920]) {
            await page.setViewportSize({ width, height: 900 });
            const sizes = await items.evaluateAll((lists) =>
                lists.flatMap((list) =>
                    [...list.children].flatMap((tile) =>
                        [tile, ...tile.querySelectorAll("img")].map((element) => {
                            const { width, height } = element.getBoundingClientRect();
                            return { width, height };
                        }),
                    ),
                ),
            );

            expect(sizes.length).toBeGreaterThanOrEqual(12 * 12);
            for (const size of sizes) {
                expect(size.width).toBeGreaterThan(0);
                expect(
                    Math.abs(size.width - size.height),
                    `item tile or artwork at viewport width ${width}`,
                ).toBeLessThan(1);
            }
        }
    });

    test("every graded player shows a grade with a score and a place, and a tie shares the place", async ({ page }) => {
        const scoreboard = page.getByRole("table", { name: "Scoreboard" });
        const grades = scoreboard.getByRole("button", {
            name: /^Grade [SABCDEF][+-]?, score \d+\.\d, \d+(st|nd|rd|th)$/,
        });

        await expect(scoreboard.getByRole("rowheader", { name: "Grade", exact: true })).toBeVisible();
        await expect(grades).toHaveCount(12);
        await expect(scoreboard.getByRole("button", { name: /, 1st$/ })).toHaveCount(1);
        await expect(scoreboard.getByRole("button", { name: /, 2nd$/ })).toHaveCount(2);
        await expect(scoreboard.getByRole("button", { name: /, 3rd$/ })).toHaveCount(0);
        await expect(scoreboard.getByRole("button", { name: /early/i })).toHaveCount(0);

        await grades.first().hover();
        const tooltip = page.locator("[data-tooltip-content]");
        await expect(tooltip).toContainText(/Last hits [+−]?[\d,]+ · \d+(st|nd|rd|th)/);
        await expect(tooltip).toContainText("Team farm bonus");
    });

    test("a leaver match and a game-captured match flag their grades", async ({ page }) => {
        const scoreboard = page.getByRole("table", { name: "Scoreboard" });
        const grades = scoreboard.getByRole("button", { name: /^Grade / });
        const leaver = scoreboard.getByRole("button", { name: /^Someone left this match early/ });
        const unchecked = scoreboard.getByRole("button", { name: /^Early leavers not checked/ });

        await open(page, `/match-history/${NEWEST - 1}`);
        await expect(grades).toHaveCount(11);
        await expect(leaver).toHaveCount(1);
        await expect(unchecked).toHaveCount(0);

        await open(page, `/match-history/${NEWEST - 2}`);
        await expect(grades).toHaveCount(12);
        await expect(leaver).toHaveCount(0);
        await expect(unchecked).toHaveCount(1);
    });

    test("an id that is not a number says the match is not valid", async ({ page }) => {
        await page.goto("/match-history/not-a-match");
        await settle(page);

        await expect(page.getByRole("alert")).toBeVisible();
        await expect(page.getByRole("table", { name: "Scoreboard" })).toHaveCount(0);
    });

    test("Death map swaps the moving players for the player's deaths, and back", async ({ page }) => {
        const player = minimap(page).getByRole("button", { name: "Lantern · Kelvin", exact: true });
        const deaths = minimap(page).getByRole("button", { name: /^Death of Lantern at / });
        await expect(deathMap(page)).toHaveAttribute("aria-pressed", "false");
        await expect(player).toBeVisible();
        await expect(page.getByRole("button", { name: "Camps", exact: true })).toHaveAttribute("aria-pressed", "true");

        await deathMap(page).click();

        await expect(deathMap(page)).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByRole("toolbar", { name: "Step through deaths" }).getByRole("status")).toHaveText(
            "4 deaths",
        );
        await expect(deaths).toHaveCount(4);
        await expect(player).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Camps", exact: true })).toHaveCount(0);

        await deathMap(page).click();

        await expect(deathMap(page)).toHaveAttribute("aria-pressed", "false");
        await expect(player).toBeVisible();
        await expect(deaths).toHaveCount(0);
    });

    test("every player menu on the page has its own name", async ({ page }) => {
        await deathMap(page).click();
        const names = [
            "Player for death map",
            "Player for souls and damage",
            "Player for purchases",
            "Player for damage",
            "Player for accolades",
        ];
        for (const name of names) {
            await expect(page.getByRole("combobox", { name, exact: true })).toHaveCount(1);
        }
        await expect(page.getByRole("combobox", { name: "Player", exact: true })).toHaveCount(0);
    });

    test("the death map's player menu shows another player's deaths", async ({ page }) => {
        await deathMap(page).click();
        await expect(minimap(page).getByRole("button", { name: /^Death of / })).toHaveCount(4);

        await page.getByRole("combobox", { name: "Player for death map", exact: true }).click();
        await page
            .getByRole("listbox")
            .getByRole("option", { name: /Cinderblock/ })
            .click();

        await expect(
            minimap(page)
                .getByRole("button", { name: /^Death of Cinderblock at / })
                .first(),
        ).toBeVisible();
        await expect(minimap(page).getByRole("button", { name: /^Death of Lantern at / })).toHaveCount(0);
    });

    test("the Camps button hides and shows the neutral camps", async ({ page }) => {
        const toggle = page.getByRole("button", { name: "Camps", exact: true });
        const camps = minimap(page).getByRole("button", { name: / camp$/ });
        // Camps spawn as the match goes on, so the replay is moved to its end first.
        await page.getByRole("slider", { name: "Match time" }).focus();
        await page.keyboard.press("End");
        await expect(main(page).getByText("31:56 / 31:56")).toBeVisible();
        await expect(camps.first()).toBeVisible();

        await toggle.click();

        await expect(toggle).toHaveAttribute("aria-pressed", "false");
        await expect(camps).toHaveCount(0);

        await toggle.click();

        await expect(toggle).toHaveAttribute("aria-pressed", "true");
        await expect(camps.first()).toBeVisible();
    });

    test.describe("the purchases stepper", () => {
        const previous = (page: Page) => page.getByRole("button", { name: "Previous action", exact: true });
        const next = (page: Page) => page.getByRole("button", { name: "Next action", exact: true });
        const slider = (page: Page) => page.getByRole("slider", { name: "Purchase step" });
        const step = (page: Page, at: number): Locator => main(page).getByText(`${at} of 26`, { exact: true });

        test.beforeEach(async ({ page }) => {
            await next(page).scrollIntoViewIfNeeded();
            await expect(step(page, 1)).toBeVisible();
            await expect(previous(page)).toBeDisabled();
        });

        test("Next and Previous move one action at a time", async ({ page }) => {
            await expect(main(page).getByText("No items held")).toBeVisible();

            await next(page).click();
            await expect(step(page, 2)).toBeVisible();
            await expect(previous(page)).toBeEnabled();

            await next(page).click();
            await expect(step(page, 3)).toBeVisible();
            // The third action is the first item bought, so the held items are no longer empty.
            await expect(main(page).getByText("No items held")).toHaveCount(0);

            await previous(page).click();
            await previous(page).click();
            await expect(step(page, 1)).toBeVisible();
            await expect(previous(page)).toBeDisabled();
        });

        test("the slider steps with the arrow keys and jumps to both ends", async ({ page }) => {
            await slider(page).focus();
            await page.keyboard.press("ArrowRight");
            await page.keyboard.press("ArrowRight");
            await expect(step(page, 3)).toBeVisible();

            await page.keyboard.press("ArrowLeft");
            await expect(step(page, 2)).toBeVisible();

            await page.keyboard.press("End");
            await expect(step(page, 26)).toBeVisible();
            await expect(next(page)).toBeDisabled();

            await page.keyboard.press("Home");
            await expect(step(page, 1)).toBeVisible();
            await expect(previous(page)).toBeDisabled();
        });

        test("an entry in the action list jumps straight to it", async ({ page }) => {
            const actions = page.getByRole("list", { name: "All actions" });

            await actions.getByRole("button", { name: "5:07 Extra Spirit Bought Extra Spirit", exact: true }).click();

            await expect(step(page, 6)).toBeVisible();
            await expect(previous(page)).toBeEnabled();
        });

        test("the slider names the action it is on for assistive technology", async ({ page }) => {
            await expect(slider(page)).toHaveAttribute("aria-valuetext", "0:15 Unlocked Frost Grenade");

            await next(page).click();

            await expect(slider(page)).toHaveAttribute("aria-valuetext", "0:57 Unlocked Arctic Beam");
        });
    });
});

test.describe("sessions", () => {
    const sessionCards = (page: Page) => main(page).getByRole("heading", { level: 3, name: /, \d{1,2}:\d{2}/ });

    test.beforeEach(async ({ page }) => {
        await open(page, "/match-history");
        await expectTotal(page, MATCHES);
    });

    test("the list is grouped under one card per play session", async ({ page }) => {
        await expect(sessionCards(page).first()).toHaveText(/(Today|Yesterday), \d/);
        await expect(
            main(page)
                .getByText(/^(Excellent|Good|Rough|Even) session$/)
                .first(),
        ).toBeVisible();
        await expect(main(page).getByRole("term").filter({ hasText: "Rank change" }).first()).toBeVisible();
    });

    test("the highlighted session gets a trophy heading", async ({ page }) => {
        await expect(
            main(page).getByRole("heading", {
                name: /^(Your best recent session|Nice work\. Your last session went well\.|Excellent last session\. Well played\.)$/,
            }),
        ).toHaveCount(1);
    });

    test("the findings are open by default and fold away", async ({ page }) => {
        await expect(main(page).getByText("Patterns", { exact: true })).toHaveCount(0);
        await expect(main(page).getByRole("heading", { level: 2, name: "What your results say" })).toBeVisible();
        const stop = main(page).getByText("Where to stop", { exact: true });
        await expect(stop).toBeVisible();

        const hide = main(page).getByRole("button", { name: "Hide" });
        await expect(hide).toHaveAttribute("aria-expanded", "true");
        await hide.click();
        await expect(stop).toBeHidden();
        const show = main(page).getByRole("button", { name: "Show" });
        await expect(show).toHaveAttribute("aria-expanded", "false");
        await show.click();
        await expect(stop).toBeVisible();
    });

    test("the break reminder switch sits right above the session list", async ({ page }) => {
        const sw = main(page).getByRole("switch", { name: "Break reminder" });
        await expect(sw).toBeVisible();
        const switchBox = await sw.boundingBox();
        const firstCard = await sessionCards(page).first().boundingBox();
        const findings = await main(page)
            .getByRole("heading", { level: 2, name: "What your results say" })
            .boundingBox();
        expect(switchBox!.y).toBeLessThan(firstCard!.y);
        expect(firstCard!.y).toBeLessThan(findings!.y);
    });

    test("/sessions lands on match history", async ({ page }) => {
        await open(page, "/sessions");
        await expect(page).toHaveURL(/\/match-history$/);
        await expect(sessionCards(page).first()).toBeVisible();
    });
});
