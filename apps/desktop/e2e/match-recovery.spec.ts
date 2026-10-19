import type { Page } from "@playwright/test";
import { keepKvAcrossReloads, open } from "./support/flows";
import { expect, settle, test } from "./support/test";

const MATCHES = 60;
const MISSING = 28;
// Not in the scenario's history, so the API answers 404 for it.
const UNKNOWN_MATCH = "/match-history/123456";
const CONSENT =
    "Fills in matches the Deadlock API is missing, yours and other players'. Uses the Steam login saved on this PC.";
// The newest match has a grade, and the missing-details presets leave it without details.
const NEWEST = 990000060;

const main = (page: Page) => page.getByRole("main");
const strip = (page: Page) => main(page).getByLabel("Match coverage", { exact: true });
const detailsTile = (page: Page) => strip(page).getByRole("definition").first();
const rows = (page: Page) =>
    main(page)
        .getByRole("listitem")
        .filter({ has: page.getByRole("link") });
const rowsWith = (page: Page, text: string) => rows(page).filter({ hasText: text });
const rowOf = (page: Page, matchId: number) =>
    rows(page).filter({ has: page.locator(`a[href="/match-history/${matchId}"]`) });
const panel = (page: Page) => page.getByRole("dialog", { name: "Recover matches" });
const replayTile = (page: Page) =>
    strip(page)
        .getByRole("definition")
        .filter({ hasText: /\/ 12$/ });
const panelButton = (page: Page, name: string) => panel(page).getByRole("button", { name, exact: true });
const statusBar = (page: Page) => page.getByRole("contentinfo");

/** Opens the newest list row that has no details and returns the text of the row it came from. */
async function openFirstMissing(page: Page): Promise<string> {
    await open(page, "/match-history");
    const row = rowsWith(page, "No details").first();
    await expect(row).toBeVisible();
    const text = (await row.innerText()).replace(/\s+/g, " ");
    await row.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/match-history\/\d+$/);
    await settle(page);
    return text;
}

/** Loads the list, then moves to Settings > Match sharing without a reload, so the stats stay in memory. */
async function openSharingAfterList(page: Page): Promise<void> {
    await open(page, "/match-history");
    await expect(rows(page).first()).toBeVisible();
    await page.getByRole("complementary").getByRole("link", { name: "Settings", exact: true }).click();
    await page.getByRole("link", { name: "Match sharing", exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/sharing$/);
}

async function openPanelFromSharing(page: Page): Promise<void> {
    await main(page).getByRole("link", { name: "Open in Match History" }).click();
    await expect(page).toHaveURL(/\/match-history$/);
    await settle(page);
    await expect(rows(page).first()).toBeVisible();
    await expect(panel(page)).toBeVisible();
}

test.describe("nothing missing", () => {
    test("the strip counts every match and offers no recovery", async ({ page }) => {
        await open(page, "/match-history");
        await expect(detailsTile(page)).toHaveText(`${MATCHES}/ ${MATCHES}`);
        await expect(strip(page).getByRole("button")).toHaveCount(0);
        await expect(rowsWith(page, "No details")).toHaveCount(0);
        await expect(rowOf(page, NEWEST)).toContainText("Grade");
        await expect(statusBar(page).getByRole("link", { name: /^Recover/ })).toHaveCount(0);
    });

    test("an unknown match id shows what is missing, not an error", async ({ page }) => {
        await open(page, UNKNOWN_MATCH);
        await expect(main(page).getByText("The Deadlock API doesn't have this match yet")).toBeVisible();
        await expect(main(page).getByText(/Could not load this match/)).toHaveCount(0);
        await expect(main(page).getByRole("button", { name: "Recover this match" })).toBeVisible();
    });
});

test.describe("some matches missing", () => {
    test.use({ scenario: "recovery-missing" });

    test("the strip counts the missing matches and offers to recover them", async ({ page }) => {
        await open(page, "/match-history");
        await expect(detailsTile(page)).toHaveText(`${MATCHES - MISSING}/ ${MATCHES}`);
        await expect(strip(page).getByRole("button", { name: `Recover ${MISSING} missing` })).toBeVisible();
    });

    test("a row without details says so and hides its grade", async ({ page }) => {
        await open(page, "/match-history");
        // The preset spreads the missing matches evenly. The spread start times leave every row past the 12 recent
        // ones in a session of its own, so the first page closes at 25 matches and holds 12 of the 28 missing.
        await expect(rows(page)).toHaveCount(25);
        const missing = rowsWith(page, "No details");
        await expect(missing).toHaveCount(12);
        await expect(rowOf(page, NEWEST)).toContainText("No details");
        for (const row of await missing.all()) await expect(row).not.toContainText("Grade");
        await expect(rows(page).filter({ hasText: "Grade" }).first()).toBeVisible();
    });

    test("the panel starts, pauses, resumes and cancels a run", async ({ page }) => {
        await open(page, "/match-history");
        await strip(page)
            .getByRole("button", { name: `Recover ${MISSING} missing` })
            .click();
        await expect(panel(page)).toContainText(`${MISSING}missing`);
        await expect(panel(page)).toContainText("Last run yesterday: 22 submitted, nothing left");
        await expect(panel(page).getByText("Steam accounts, today")).toBeVisible();
        await expect(panel(page).getByText("0/40", { exact: true })).toHaveCount(3);

        await panelButton(page, `Recover ${MISSING}`).click();
        await expect(panelButton(page, "Pause")).toBeVisible();
        await expect(panelButton(page, "Cancel")).toBeVisible();
        await expect(panel(page)).toContainText(new RegExp(`\\d+/ ${MISSING}`));
        await expect(panel(page)).toContainText(/About .+ left/);

        await panelButton(page, "Pause").click();
        await expect(panel(page).getByText("Paused", { exact: true })).toBeVisible();
        await expect(panel(page)).toContainText(/Paused: \d+ left/);
        await expect(panelButton(page, "Pause")).toHaveCount(0);
        await expect(statusBar(page).getByRole("link", { name: "Recovery paused" })).toBeVisible();

        await panelButton(page, "Resume").click();
        await expect(panelButton(page, "Pause")).toBeVisible();
        await expect(panel(page).getByText("Paused", { exact: true })).toHaveCount(0);

        await panelButton(page, "Cancel").click();
        await expect(panel(page)).toContainText(/Stopped after \d+ match(es)?\. Run it again to continue\./);
        await expect(panel(page)).toContainText(/Last run just now: \d+ submitted/);
        await expect(panelButton(page, "Pause")).toHaveCount(0);
        await expect(statusBar(page).getByRole("link", { name: /^Recover/ })).toHaveCount(0);
    });

    test("rows in a run say Recovering and hide their grade", async ({ page }) => {
        await open(page, "/match-history");
        await strip(page)
            .getByRole("button", { name: `Recover ${MISSING} missing` })
            .click();
        await panelButton(page, `Recover ${MISSING}`).click();
        await panelButton(page, "Pause").click();
        await panel(page).getByRole("button", { name: "Close" }).click();
        const recovering = rowsWith(page, "Recovering");
        await expect(recovering.first()).toBeVisible();
        for (const row of await recovering.all()) await expect(row).not.toContainText("Grade");
        await expect(strip(page).getByRole("button", { name: new RegExp(`^Paused \\d+ / ${MISSING}$`) })).toBeVisible();
    });

    test("Settings > Match sharing opens the panel in Match History", async ({ page }) => {
        await open(page, "/settings/sharing");
        await main(page).getByRole("link", { name: "Open in Match History" }).click();
        await expect(page).toHaveURL(/\/match-history$/);
        await expect(panel(page)).toBeVisible();
    });

    test("the panel opened from Settings stays open when the list was already loaded", async ({ page }) => {
        await openSharingAfterList(page);
        await openPanelFromSharing(page);
    });

    test("the panel opened from Settings stays open while stale stats reload", async ({ page }) => {
        await page.clock.install();
        await openSharingAfterList(page);
        await page.clock.fastForward("06:00");
        await openPanelFromSharing(page);
    });

    test("a match without details shows its summary and replay state", async ({ page }) => {
        const rowText = await openFirstMissing(page);
        const outcome = main(page).getByRole("heading", { level: 2 });
        await expect(outcome).toHaveText(/^(Victory|Defeat|Unscored|Win|Loss)/);
        const meta = outcome.locator("xpath=following-sibling::p");
        const mode = /(Ranked|Unranked|Street Brawl)/.exec(rowText)?.[1];
        const kda = /\d+ \/ \d+ \/ \d+/.exec(rowText)?.[0];
        expect(mode).toBeTruthy();
        expect(kda).toBeTruthy();
        await expect(meta).toContainText(mode!);
        await expect(meta).toContainText(kda!);
        await expect(main(page).getByText("Match details", { exact: true })).toBeVisible();
        await expect(main(page).getByText("Missing", { exact: true })).toBeVisible();
        await expect(main(page).getByText("Replay", { exact: true })).toBeVisible();
        await expect(main(page).getByText("Not available yet", { exact: true })).toBeVisible();
    });

    test("a missing match offers to recover it while the game is closed", async ({ page }) => {
        await openFirstMissing(page);
        await expect(main(page).getByText("Takes about 20 seconds.")).toBeVisible();
        await expect(main(page).getByText(CONSENT)).toHaveCount(0);

        await main(page).getByRole("button", { name: "Recover this match" }).click();
        await expect(main(page).getByText("Recovering", { exact: true })).toBeVisible();
        await expect(main(page).getByText(/^About \d+ s left$/)).toBeVisible();
    });
});

test.describe("a run in progress", () => {
    test.use({ scenario: "recovery-running" });

    test("the status bar shows the run and leads to Match History", async ({ page }) => {
        await open(page, "/");
        const item = statusBar(page).getByRole("link", { name: /^Recovering \d+ \/ 31$/ });
        await expect(item).toBeVisible();
        await item.click();
        await expect(page).toHaveURL(/\/match-history$/);
    });

    test("the strip shows the run's progress instead of the recover action", async ({ page }) => {
        await open(page, "/match-history");
        await expect(strip(page).getByRole("button", { name: /^Recovering \d+ \/ 31$/ })).toBeVisible();
        await expect(strip(page).getByRole("button", { name: /^Recover \d+ missing$/ })).toHaveCount(0);
    });
});

test.describe("a paused run", () => {
    test.use({ scenario: "recovery-paused" });

    test("the panel and the status bar say it is paused", async ({ page }) => {
        await open(page, "/match-history");
        await strip(page).getByRole("button", { name: "Paused 40 / 100" }).click();
        await expect(panel(page).getByText("Paused", { exact: true })).toBeVisible();
        await expect(panelButton(page, "Resume")).toBeVisible();
        await expect(statusBar(page).getByRole("link", { name: "Recovery paused" })).toBeVisible();
    });
});

test.describe("Steam's daily limit", () => {
    test.use({ scenario: "recovery-limit" });

    test("the panel says when the run continues and which accounts are spent", async ({ page }) => {
        await open(page, "/match-history");
        await strip(page).getByRole("button", { name: "Recovering 120 / 180" }).click();
        await expect(panel(page).getByText("Steam's daily limit", { exact: true })).toBeVisible();
        await expect(panel(page)).toContainText("Continues tomorrow on its own");
        await expect(panel(page).getByText("40/40", { exact: true })).toHaveCount(3);
        await expect(statusBar(page).getByRole("link", { name: "Recovery: Steam's daily limit" })).toBeVisible();
    });
});

test.describe("background recovery off", () => {
    test.use({ scenario: "recovery-gc-off" });

    test("a missing match shows what recovering it means before the button", async ({ page }) => {
        await openFirstMissing(page);
        await expect(main(page).getByText(CONSENT)).toBeVisible();
        await expect(main(page).getByText("Background recovery stays off.")).toBeVisible();
        await expect(main(page).getByRole("button", { name: "Recover this match" })).toBeVisible();
    });

    test("the recovery panel shows what recovering means before the first run", async ({ page }) => {
        await open(page, "/match-history");
        await strip(page)
            .getByRole("button", { name: `Recover ${MISSING} missing` })
            .click();
        await expect(panel(page).getByText(CONSENT)).toBeVisible();
    });
});

test.describe("Deadlock open", () => {
    test.use({ scenario: "recovery-game-open" });

    test("with sharing on, a missing match is picked up in the game", async ({ page }) => {
        await openFirstMissing(page);
        await expect(
            main(page).getByText("Open this match in Deadlock's Match History and Deadlock+ will pick it up."),
        ).toBeVisible();
        await expect(main(page).getByRole("button", { name: "Recover this match" })).toHaveCount(0);
    });

    test("with sharing off, a missing match leads to the setting that turns it on", async ({ page }) => {
        await keepKvAcrossReloads(page);
        await open(page, "/settings/sharing");
        const share = page.getByRole("switch", { name: "Share my matches", exact: true });
        await share.click();
        await expect(share).toHaveAttribute("aria-checked", "false");

        await openFirstMissing(page);
        await expect(main(page).getByText(/^Turn on Share my matches and Deadlock\+ will pick it up/)).toBeVisible();
        await main(page).getByRole("link", { name: "Open Match sharing settings" }).click();
        await expect(page).toHaveURL(/\/settings\/sharing$/);
        await expect(share).toBeVisible();
    });
});

test.describe("a run with details and replays", () => {
    test.use({ scenario: "recovery-replay-run" });

    // The scenario's run takes the first two of the three recent matches that have details and no replay.
    const QUEUED_REPLAY = 990000059;
    const LEFT_OUT_REPLAY = 990000053;
    // 25 days old: past the 21 days Steam hands replays out, still inside the 30 days they are kept.
    const AGED_REPLAY = 990000048;

    test("the panel shows the details step, then the replays step", async ({ page }) => {
        await open(page, "/match-history");
        await strip(page)
            .getByRole("button", { name: /^Recovering \d+ \/ 23$/ })
            .click();
        const steps = panel(page).getByRole("group", { name: "Recovery progress" });
        await expect(steps.getByRole("progressbar")).toHaveCount(2);
        await expect(steps.getByRole("progressbar", { name: "Missing details" })).toHaveAttribute(
            "aria-valuemax",
            "21",
        );
        await expect(steps.getByRole("progressbar", { name: "Recent replays" })).toHaveAttribute("aria-valuenow", "0");
        await expect(panel(page).getByRole("listitem").filter({ hasText: "Recent replays" })).toHaveText(
            /^Recent replays\s*0 \/ 2$/,
        );
        await expect(panel(page).getByRole("listitem").filter({ hasText: "Missing details" })).toHaveText(
            /^Missing details\s*\d+ \/ 21$/,
        );
    });

    test("a recent match with no replay offers to recover it, and the run takes it on", async ({ page }) => {
        await open(page, `/match-history/${LEFT_OUT_REPLAY}`);
        await expect(main(page).getByText("No replay yet", { exact: true })).toBeVisible();
        const recover = main(page).getByRole("button", { name: "Recover replay" });
        await expect(recover).toHaveAttribute("title", "Counts toward the 40 matches a day.");

        await recover.click();
        await expect(main(page).getByText("Recovering replay", { exact: true })).toBeVisible();
        await expect(recover).toHaveCount(0);
        await expect(statusBar(page).getByRole("link", { name: /^Recovering \d+ \/ 24$/ })).toBeVisible();
    });

    test("a match whose replay is already in the run says so", async ({ page }) => {
        await open(page, `/match-history/${QUEUED_REPLAY}`);
        await expect(main(page).getByText("Recovering replay", { exact: true })).toBeVisible();
        await expect(main(page).getByRole("button", { name: "Recover replay" })).toHaveCount(0);
    });

    test("a match past 21 days says its replay can't be recovered", async ({ page }) => {
        await open(page, `/match-history/${AGED_REPLAY}`);
        await expect(main(page).getByText("Replay can't be recovered", { exact: true })).toBeVisible();
        await expect(main(page).getByRole("button", { name: "Recover replay" })).toHaveCount(0);
    });
});

test.describe("replays missing", () => {
    test.use({ scenario: "recovery-replays" });

    test("the replay tile counts recent matches that have a replay", async ({ page }) => {
        await open(page, "/match-history");
        await expect(replayTile(page)).toHaveText("9/ 12");
        const pips = strip(page).getByRole("img", { name: "Replays: 9 of 12 recent matches" });
        await expect(pips.locator("span")).toHaveCount(12);
        await expect(detailsTile(page)).toHaveText(`${MATCHES}/ ${MATCHES}`);
    });
});
