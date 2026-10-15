import type { Page } from "@playwright/test";
import { open, sidebarTo, toast } from "./support/flows";
import { expect, test } from "./support/test";

const REPLAYS = 12;
const PINNED = 3;

const PARTIAL = 990000060;
const UNPINNED = 990000059;
const PINNED_MATCH = 990000058;
const ANOTHER_UNPINNED = 990000056;

// The app names the bin after the system the browser reports, which is the one the tests run on.
const BIN = process.platform === "win32" ? "Recycle Bin" : "Trash";

const select = (page: Page, matchId: number) =>
    page.getByRole("checkbox", { name: `Select match ${matchId}`, exact: true });
const rows = (page: Page) =>
    page.getByRole("listitem").filter({ has: page.getByRole("button", { name: /^Pin replay of match \d+$/ }) });
const row = (page: Page, matchId: number) => page.getByRole("listitem").filter({ has: select(page, matchId) });
const pin = (page: Page, matchId: number) =>
    page.getByRole("button", { name: `Pin replay of match ${matchId}`, exact: true });
const moreActions = (page: Page, matchId: number) =>
    page.getByRole("button", { name: `More actions for match ${matchId}`, exact: true });
const filter = (page: Page, label: string, count: number) =>
    page.getByRole("button", { name: `${label} (${count})`, exact: true });
const cleanUp = (page: Page) => page.getByRole("dialog", { name: "Clean up replays" });
const deleteQuestion = (page: Page, count: number) =>
    page.getByRole("alertdialog", { name: count === 1 ? "Delete 1 replay?" : `Delete ${count} replays?` });

test.beforeEach(async ({ page }) => {
    await open(page, "/demos");
    await expect(rows(page)).toHaveCount(REPLAYS);
    await expect(filter(page, "All", REPLAYS)).toHaveAttribute("aria-pressed", "true");
    await expect(filter(page, "Pinned", PINNED)).toBeVisible();
});

// The list is read from the backend again on every visit.
async function leaveAndReturn(page: Page) {
    await sidebarTo(page, "Mutes", /\/voice-bans$/);
    await sidebarTo(page, "Replays", /\/demos$/);
}

test("pinning a replay marks it, counts it, locks its checkbox and survives leaving the page", async ({ page }) => {
    await expect(pin(page, UNPINNED)).toHaveAttribute("aria-pressed", "false");
    await expect(select(page, UNPINNED)).toBeEnabled();

    await pin(page, UNPINNED).click();

    await expect(pin(page, UNPINNED)).toHaveAttribute("aria-pressed", "true");
    await expect(filter(page, "Pinned", PINNED + 1)).toBeVisible();
    await expect(select(page, UNPINNED)).toBeDisabled();

    await leaveAndReturn(page);
    await expect(pin(page, UNPINNED)).toHaveAttribute("aria-pressed", "true");
    await expect(filter(page, "Pinned", PINNED + 1)).toBeVisible();
});

test("unpinning a replay clears the mark, counts it out, frees its checkbox and survives leaving the page", async ({
    page,
}) => {
    await expect(pin(page, PINNED_MATCH)).toHaveAttribute("aria-pressed", "true");
    await expect(select(page, PINNED_MATCH)).toBeDisabled();

    await pin(page, PINNED_MATCH).click();

    await expect(pin(page, PINNED_MATCH)).toHaveAttribute("aria-pressed", "false");
    await expect(filter(page, "Pinned", PINNED - 1)).toBeVisible();
    await expect(select(page, PINNED_MATCH)).toBeEnabled();

    await leaveAndReturn(page);
    await expect(pin(page, PINNED_MATCH)).toHaveAttribute("aria-pressed", "false");
    await expect(filter(page, "Pinned", PINNED - 1)).toBeVisible();
});

test("a pinned replay offers no delete in its menu until it is unpinned", async ({ page }) => {
    await moreActions(page, PINNED_MATCH).click();
    await expect(page.getByRole("menuitem", { name: "Delete (unpin first)", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");

    await pin(page, PINNED_MATCH).click();
    await moreActions(page, PINNED_MATCH).click();

    await expect(page.getByRole("menuitem", { name: "Delete", exact: true })).toBeEnabled();
});

test("each status filter lists only its own replays", async ({ page }) => {
    for (const [label, count] of [
        ["Ready", 7],
        ["Older build", 4],
        ["Partial", 1],
        ["Pinned", PINNED],
    ] as const) {
        await filter(page, label, count).click();
        await expect(filter(page, label, count)).toHaveAttribute("aria-pressed", "true");
        await expect(rows(page)).toHaveCount(count);
        await expect(page.getByText(new RegExp(`^${count} replays?, `))).toBeVisible();
    }

    await filter(page, "Pinned", PINNED).click();
    await expect(rows(page).getByRole("button", { name: /^Pin replay of match \d+$/, pressed: false })).toHaveCount(0);

    await filter(page, "All", REPLAYS).click();
    await expect(rows(page)).toHaveCount(REPLAYS);
});

test("the clean-up dialog lists what its rules match and closing it deletes nothing", async ({ page }) => {
    await page.getByRole("button", { name: "Clean up", exact: true }).click();
    const dialog = cleanUp(page);

    await expect(dialog.getByRole("switch", { name: "Unfinished downloads", exact: true })).toBeChecked();
    await expect(dialog.getByRole("switch", { name: "Older game build", exact: true })).not.toBeChecked();
    await expect(dialog.getByText("1 replay match, 62.4 MB")).toBeVisible();
    await expect(dialog.getByRole("listitem").filter({ hasText: `Match ${PARTIAL}` })).toBeVisible();

    await dialog.getByRole("button", { name: "Close", exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(rows(page)).toHaveCount(REPLAYS);
});

test("turning a clean-up rule on widens the match list, skips pinned replays and is remembered", async ({ page }) => {
    await page.getByRole("button", { name: "Clean up", exact: true }).click();
    const dialog = cleanUp(page);
    await expect(dialog.getByText("1 replay match, 62.4 MB")).toBeVisible();

    await dialog.getByRole("switch", { name: "Older game build", exact: true }).click();

    // Four replays are from an older build and one of them is pinned.
    await expect(dialog.getByText(/^4 replays match, /)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Review 4 replays", exact: true })).toBeEnabled();
    await expect(dialog.getByRole("listitem").filter({ hasText: "Match 990000033" })).toHaveCount(0);

    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await leaveAndReturn(page);
    await page.getByRole("button", { name: "Clean up", exact: true }).click();

    await expect(cleanUp(page).getByRole("switch", { name: "Older game build", exact: true })).toBeChecked();
    await expect(cleanUp(page).getByText(/^4 replays match, /)).toBeVisible();
});

test("reviewing a clean-up and cancelling the delete question keeps every replay", async ({ page }) => {
    await page.getByRole("button", { name: "Clean up", exact: true }).click();
    await cleanUp(page).getByRole("button", { name: "Review 1 replay", exact: true }).click();

    const question = deleteQuestion(page, 1);
    await expect(question.getByText("Frees 62.4 MB.", { exact: false })).toBeVisible();
    await expect(cleanUp(page)).toBeHidden();
    await question.getByRole("button", { name: "Cancel", exact: true }).click();

    await expect(question).toBeHidden();
    await expect(rows(page)).toHaveCount(REPLAYS);

    await leaveAndReturn(page);
    await expect(rows(page)).toHaveCount(REPLAYS);
});

test("reviewing a clean-up and confirming deletes the matched replay", async ({ page }) => {
    await page.getByRole("button", { name: "Clean up", exact: true }).click();
    await cleanUp(page).getByRole("button", { name: "Review 1 replay", exact: true }).click();
    await deleteQuestion(page, 1)
        .getByRole("button", { name: `Move to ${BIN}`, exact: true })
        .click();

    await expect(toast(page, "Deleted 1 replay")).toBeVisible();
    await expect(deleteQuestion(page, 1)).toBeHidden();
    await expect(row(page, PARTIAL)).toHaveCount(0);
    await expect(filter(page, "All", REPLAYS - 1)).toBeVisible();

    await leaveAndReturn(page);
    await expect(rows(page)).toHaveCount(REPLAYS - 1);
    await expect(row(page, PARTIAL)).toHaveCount(0);
});

test("selecting several replays and deleting them permanently removes exactly those", async ({ page }) => {
    const deleteSelected = (count: number) => page.getByRole("button", { name: `Delete selected (${count})` });
    await expect(deleteSelected(0)).toBeDisabled();

    await select(page, UNPINNED).check();
    await select(page, ANOTHER_UNPINNED).check();
    await deleteSelected(2).click();

    const question = deleteQuestion(page, 2);
    const permanent = question.getByRole("radio", { name: /^Delete permanently/ });
    await expect(question.getByRole("radio", { name: new RegExp(`^Move to ${BIN}`) })).toBeChecked();
    await permanent.click();
    await expect(permanent).toBeChecked();
    await question.getByRole("button", { name: "Delete permanently", exact: true }).click();

    await expect(toast(page, "Deleted 2 replays")).toBeVisible();
    await expect(rows(page)).toHaveCount(REPLAYS - 2);
    await expect(row(page, UNPINNED)).toHaveCount(0);
    await expect(row(page, ANOTHER_UNPINNED)).toHaveCount(0);
    await expect(deleteSelected(0)).toBeDisabled();

    await leaveAndReturn(page);
    await expect(rows(page)).toHaveCount(REPLAYS - 2);
    await expect(row(page, PINNED_MATCH)).toBeVisible();
});

test("selecting the page skips pinned replays", async ({ page }) => {
    await page.getByRole("checkbox", { name: "Select this page", exact: true }).check();

    await expect(page.getByRole("button", { name: `Delete selected (${REPLAYS - PINNED})` })).toBeEnabled();
    await expect(select(page, PINNED_MATCH)).not.toBeChecked();
    await expect(select(page, UNPINNED)).toBeChecked();
});

test("Home's saved replays count follows a delete", async ({ page }) => {
    await sidebarTo(page, "Home", /\/$/);
    await page.getByRole("link", { name: `${REPLAYS} Saved replays` }).click();
    await expect(page).toHaveURL(/\/demos$/);
    await expect(rows(page)).toHaveCount(REPLAYS);

    await moreActions(page, UNPINNED).click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await deleteQuestion(page, 1)
        .getByRole("button", { name: `Move to ${BIN}`, exact: true })
        .click();
    await expect(rows(page)).toHaveCount(REPLAYS - 1);

    await sidebarTo(page, "Home", /\/$/);
    await expect(page.getByRole("link", { name: `${REPLAYS - 1} Saved replays` })).toBeVisible();
});

test("every replay row has its own pin, menu and checkbox name", async ({ page }) => {
    for (const name of [/^Pin replay of match \d+$/, /^More actions for match \d+$/, /^Select match \d+$/]) {
        const role = name.source.startsWith("^Select") ? "checkbox" : "button";
        const labels = await page
            .getByRole(role, { name })
            .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
        expect(labels).toHaveLength(REPLAYS);
        expect(new Set(labels).size).toBe(REPLAYS);
    }
});
