import type { Locator, Page } from "@playwright/test";
import { open, sidebarTo } from "./support/flows";
import { WINDOWS_UA } from "./support/platform";
import { expect, test } from "./support/test";

// Editions are cut at local midnight, so the scenario's matches only fall into the expected weeks in one zone.
// At the demo's "now" (Monday 12 October 2026, 19:30) the newest closed week is 5 to 11 October, the newest
// closed month is September, and three matches have been played since midnight.
test.use({ scenario: "dispatch", timezoneId: "UTC" });

const WEEKLY = "weekly-2026-10-05";
const MONTHLY = "monthly-2026-09";
const SO_FAR = "weekly-2026-10-12";

const urlWith = (id: string) => new RegExp(`[?&]edition=${id}$`);
const noEdition = /\/dispatch$/;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A weekly or this week so far, open in the room. */
const paper = (page: Page, edition: string) =>
    page.getByRole("main").getByRole("article", {
        name: new RegExp(`^Deadlock\\+ Dispatch, ${escapeRegExp(edition)}, `),
    });
/** A monthly, open in the room. */
const magazine = (page: Page, month: string) =>
    page.getByRole("main").getByRole("region", { name: new RegExp(`^The Monthly . ${month} . No\\. \\d+$`) });
const table = (page: Page) => page.getByRole("main").getByRole("group", { name: "Editions", exact: true });
const copy = (page: Page, name: string | RegExp) =>
    table(page).getByRole("button", { name: typeof name === "string" ? new RegExp(`^${escapeRegExp(name)}`) : name });
const weeklyCopy = (page: Page) => copy(page, "Weekly, Oct 5 to 11, No. 1");
const monthlyCopy = (page: Page) => copy(page, "Monthly, September 2026, No. 2");
const soFarCopy = (page: Page) => copy(page, "This week, Oct 12 to 18, Still printing");
const unread = (page: Page) => table(page).getByRole("button", { name: /, New$/ });
const navLink = (page: Page) => page.getByRole("navigation").getByRole("link", { name: "Dispatch", exact: true });
const navBadge = (page: Page) => navLink(page).getByRole("status");
const backToTable = (page: Page) => page.getByRole("main").getByRole("button", { name: "Table", exact: true });
const exportButton = (page: Page) => page.getByRole("main").getByRole("button", { name: "Export", exact: true });

/** The table is drawn and nothing is picked up. */
async function openTable(page: Page): Promise<void> {
    await open(page, "/dispatch");
    await expect(table(page)).toBeVisible();
}

async function openWeekly(page: Page): Promise<void> {
    await open(page, `/dispatch?edition=${WEEKLY}`);
    await expect(paper(page, "Weekly Edition")).toBeVisible();
}

test("opens from the sidebar on the table, with nothing picked up yet", async ({ page }) => {
    await open(page, "/");
    await sidebarTo(page, "Dispatch", /\/dispatch/);

    await expect(page.getByRole("heading", { level: 1, name: "Dispatch", exact: true })).toBeVisible();
    await expect(navLink(page)).toHaveAttribute("aria-current", "page");
    await expect(table(page)).toBeVisible();
    await expect(page).toHaveURL(noEdition);
    await expect(page.getByRole("main").getByRole("article")).toHaveCount(0);
});

test.describe("the table", () => {
    test("lays out this week so far, the newest weekly and monthly, and the past weeks bundled by month", async ({
        page,
    }) => {
        await openTable(page);
        await expect(weeklyCopy(page)).toBeVisible();
        await expect(monthlyCopy(page)).toBeVisible();
        await expect(soFarCopy(page)).toBeVisible();
        await expect(copy(page, /^Sep . 4, Weeklies, Sep 2026$/)).toBeVisible();
        await expect(copy(page, /^2025 . \d+, Weeklies, 2025$/)).toBeVisible();
        // No season has ended at the demo's "now", and the closed 2025 year is still only a proof.
        await expect(copy(page, /^Collector's Copy, /)).toHaveCount(0);
        await expect(copy(page, /^Year-End Special, /)).toHaveCount(1);
        await expect(copy(page, "Year-End Special, 2025, Proof, print this edition")).toHaveCount(1);
    });

    test("picking the monthly with the mouse opens it and puts it in the URL", async ({ page }) => {
        await openTable(page);

        await monthlyCopy(page).click();

        await expect(page).toHaveURL(urlWith(MONTHLY));
        await expect(magazine(page, "September 2026")).toBeVisible();
        await expect(paper(page, "Weekly Edition")).toHaveCount(0);
    });

    test("picking This week so far shows the unfinished paper", async ({ page }) => {
        await openTable(page);

        await soFarCopy(page).click();

        await expect(page).toHaveURL(urlWith(SO_FAR));
        await expect(paper(page, "This week so far")).toBeVisible();
        // The week is not out yet, so there is no reveal to replay.
        await expect(page.getByRole("main").getByRole("button", { name: "Replay the reveal" })).toHaveCount(0);
    });

    test("a link with ?edition= opens that edition", async ({ page }) => {
        await open(page, `/dispatch?edition=${MONTHLY}`);
        await expect(magazine(page, "September 2026")).toBeVisible();
        await expect(page).toHaveURL(urlWith(MONTHLY));
    });

    test("an unknown ?edition= leaves the table in view", async ({ page }) => {
        await open(page, "/dispatch?edition=weekly-1999-01-04");
        await expect(table(page)).toBeVisible();
        await expect(weeklyCopy(page)).toBeVisible();
        await expect(page.getByRole("main").getByRole("article")).toHaveCount(0);
        await expect(backToTable(page)).toHaveCount(0);
    });

    test("Enter on a copy opens it, and Escape puts it back and returns focus to it", async ({ page }) => {
        await openTable(page);
        await weeklyCopy(page).focus();

        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(urlWith(WEEKLY));
        await expect(paper(page, "Weekly Edition")).toBeVisible();
        await expect(page.locator("[data-room] :focus")).toHaveCount(1);

        await page.keyboard.press("Escape");
        await expect(page).toHaveURL(noEdition);
        await expect(paper(page, "Weekly Edition")).toHaveCount(0);
        await expect(weeklyCopy(page)).toBeFocused();
    });

    test("the Table button puts the copy back and returns focus to it", async ({ page }) => {
        await open(page, `/dispatch?edition=${SO_FAR}`);
        await expect(paper(page, "This week so far")).toBeVisible();

        await backToTable(page).click();

        await expect(page).toHaveURL(noEdition);
        await expect(soFarCopy(page)).toBeFocused();
    });
});

const spread = (page: Page) => page.getByRole("main").getByRole("group", { name: "Weeklies, Sep 2026" });

test.describe("bundles", () => {
    const september = (page: Page) => copy(page, /^Sep . 4, Weeklies, Sep 2026$/);

    test("past weeks lie in a bundle per month, and a click deals one out", async ({ page }) => {
        await openTable(page);
        await expect(september(page)).toHaveAttribute("aria-expanded", "false");

        await september(page).click();

        await expect(spread(page)).toBeVisible();
        await expect(spread(page).getByRole("button", { name: /^Weekly, / })).toHaveCount(4);
        await expect(september(page)).toHaveAttribute("aria-expanded", "true");
    });

    test("Enter deals a bundle out and moves focus into it, and Escape gathers it back", async ({ page }) => {
        await openTable(page);
        await september(page).focus();

        await page.keyboard.press("Enter");
        await expect(spread(page)).toBeVisible();
        await expect(
            spread(page)
                .getByRole("button", { name: /^Weekly, / })
                .first(),
        ).toBeFocused();

        await page.keyboard.press("Escape");
        await expect(spread(page)).toHaveCount(0);
        await expect(september(page)).toBeFocused();
        await expect(page).toHaveURL(noEdition);
    });
});

test("the sidebar badge counts unseen editions and goes away once both are opened", async ({ page }) => {
    await open(page, "/");
    await expect(navBadge(page)).toHaveAccessibleName("2 unread");

    // The table opens nothing by itself: both stay unread until picked up.
    await sidebarTo(page, "Dispatch", /\/dispatch/);
    await expect(table(page)).toBeVisible();
    await expect(navBadge(page)).toHaveAccessibleName("2 unread");
    await expect(unread(page)).toHaveCount(2);

    await weeklyCopy(page).click();
    await expect(paper(page, "Weekly Edition")).toBeVisible();
    await expect(navBadge(page)).toHaveAccessibleName("1 unread");

    await backToTable(page).click();
    await expect(weeklyCopy(page)).toHaveAccessibleName("Weekly, Oct 5 to 11, No. 1");
    await expect(unread(page)).toHaveCount(1);
    await monthlyCopy(page).click();
    await expect(magazine(page, "September 2026")).toBeVisible();
    await expect(navBadge(page)).toHaveCount(0);

    await backToTable(page).click();
    await expect(unread(page)).toHaveCount(0);
});

test.describe("printing a past edition", () => {
    test("prints a week on request, shows it and lays it on the table as issued", async ({ page }) => {
        await openTable(page);
        await copy(page, /^Sep . 4, Weeklies, Sep 2026$/).click();
        const proof = spread(page).getByRole("button", {
            name: "Weekly, Sep 28 to Oct 4, Proof, print this edition",
            exact: true,
        });
        await expect(proof).toBeVisible();

        await proof.click();

        await expect(page).toHaveURL(urlWith("weekly-2026-09-28"));
        await expect(paper(page, "Weekly Edition")).toBeVisible();
        await expect(paper(page, "Weekly Edition")).toHaveAccessibleName(/, Sep 28 to Oct 4, 2026$/);

        await backToTable(page).click();
        await copy(page, /^Sep . 4, Weeklies, Sep 2026$/).click();
        await expect(spread(page).getByRole("button", { name: /^Weekly, Sep 28 to Oct 4, No\. \d+$/ })).toHaveCount(1);
        await expect(proof).toHaveCount(0);
    });

    test("a printed edition stays out of the unread count", async ({ page }) => {
        await open(page, "/");
        await expect(navBadge(page)).toHaveAccessibleName("2 unread");
        await sidebarTo(page, "Dispatch", /\/dispatch/);

        await copy(page, "Monthly, August 2026, Proof, print this edition").click();

        await expect(page).toHaveURL(urlWith("monthly-2026-08"));
        await expect(magazine(page, "August 2026")).toBeVisible();
        await expect(navBadge(page)).toHaveAccessibleName("2 unread");
        await backToTable(page).click();
        await expect(copy(page, /^Monthly, August 2026, No\. \d+$/)).toHaveCount(1);
    });
});

test.describe("the monthly", () => {
    const previous = (page: Page) => page.getByRole("main").getByRole("button", { name: "Previous pages" });
    const next = (page: Page) => page.getByRole("main").getByRole("button", { name: "Next pages" });

    test("opens on its cover, turns with the arrow keys and stops at the cover", async ({ page }) => {
        await open(page, `/dispatch?edition=${MONTHLY}`);
        await expect(magazine(page, "September 2026")).toBeFocused();
        await expect(previous(page)).toBeDisabled();

        await page.keyboard.press("ArrowLeft");
        await expect(previous(page)).toBeDisabled();

        await page.keyboard.press("ArrowRight");
        await expect(previous(page)).toBeEnabled();
        await page.keyboard.press("ArrowLeft");
        await expect(previous(page)).toBeDisabled();

        await next(page).click();
        await expect(previous(page)).toBeEnabled();
    });

    test("Escape closes the open magazine first, then puts it back on the table", async ({ page }) => {
        await open(page, `/dispatch?edition=${MONTHLY}`);
        await expect(magazine(page, "September 2026")).toBeFocused();
        await page.keyboard.press("ArrowRight");
        await expect(previous(page)).toBeEnabled();

        await page.keyboard.press("Escape");
        await expect(previous(page)).toBeDisabled();
        await expect(page).toHaveURL(urlWith(MONTHLY));

        await page.keyboard.press("Escape");
        await expect(page).toHaveURL(noEdition);
        await expect(monthlyCopy(page)).toBeFocused();
    });
});

test.describe("the Export dialog", () => {
    const dialog = (page: Page, name: string | RegExp = /^Deadlock\+ Dispatch, Weekly Edition, /) =>
        page.getByRole("dialog", { name });
    const pages = (page: Page) => dialog(page).getByRole("radiogroup", { name: "Pages", exact: true });
    const shapes = (page: Page) => dialog(page).getByRole("radiogroup", { name: "Made for", exact: true });

    interface SaveWindow {
        __DEADLOCK_PLUS_DEMO__?: {
            handle?: { set(command: string, handler: (args: unknown) => unknown): void };
        };
        __E2E_SAVED__?: { size: number; head: number[] }[];
    }

    async function captureSaves(page: Page): Promise<void> {
        await page.evaluate(() => {
            const host = window as unknown as SaveWindow;
            host.__E2E_SAVED__ = [];
            host.__DEADLOCK_PLUS_DEMO__!.handle!.set("save_binary_file", (args) => {
                const bytes = args instanceof Uint8Array ? args : new Uint8Array();
                host.__E2E_SAVED__!.push({ size: bytes.length, head: [...bytes.slice(0, 8)] });
                return true;
            });
        });
    }

    async function savedPngs(page: Page): Promise<{ size: number; head: number[] }[]> {
        await expect(page.getByText("Dispatch image saved.")).toBeVisible();
        const saved = await page.evaluate(() => (window as unknown as SaveWindow).__E2E_SAVED__!);
        expect(saved).toHaveLength(1);
        expect(saved[0]!.head).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        return saved;
    }

    const pick = (radios: Locator, name: string) => radios.getByRole("radio", { name, exact: true });

    test("Export opens on the front page with Save image and Copy image, and Escape closes it", async ({ page }) => {
        await openWeekly(page);
        await expect(exportButton(page)).toBeEnabled();
        await exportButton(page).click();

        await expect(dialog(page)).toBeVisible();
        await expect(dialog(page).getByRole("button", { name: "Save image", exact: true })).toBeEnabled();
        await expect(dialog(page).getByRole("button", { name: "Copy image", exact: true })).toBeEnabled();
        await expect(pick(pages(page), "Front page")).toBeChecked();
        await expect(shapes(page)).toHaveCount(0);

        await page.keyboard.press("Escape");
        await expect(dialog(page)).toHaveCount(0);
        await expect(paper(page, "Weekly Edition")).toBeVisible();
        await expect(exportButton(page)).toBeFocused();
    });

    test("a card export offers the three shapes, tall first", async ({ page }) => {
        await openWeekly(page);
        await exportButton(page).click();
        await pick(pages(page), "Lead story").click();

        await expect(shapes(page)).toBeVisible();
        await expect(shapes(page).getByRole("radio")).toHaveCount(3);
        await expect(shapes(page).getByRole("radio").first()).toHaveAccessibleName(/ Tall 9:16$/);
        await expect(shapes(page).getByRole("radio", { name: / Tall 9:16$/ })).toBeChecked();

        await shapes(page)
            .getByRole("radio", { name: / Square 1:1$/ })
            .click();
        await expect(shapes(page).getByRole("radio", { name: / Square 1:1$/ })).toBeChecked();
        await expect(shapes(page).getByRole("radio", { name: / Tall 9:16$/ })).not.toBeChecked();
    });

    test("Save image hands a PNG to the save dialog and says so", async ({ page }) => {
        await openWeekly(page);
        await exportButton(page).click();
        await expect(dialog(page)).toBeVisible();
        await captureSaves(page);

        await dialog(page).getByRole("button", { name: "Save image", exact: true }).click();

        const saved = await savedPngs(page);
        expect(saved[0]!.size).toBeGreaterThan(10_000);
    });

    test("a card saves as a PNG too", async ({ page }) => {
        await openWeekly(page);
        await exportButton(page).click();
        await pick(pages(page), "Lead story").click();
        await captureSaves(page);

        await dialog(page).getByRole("button", { name: "Save image", exact: true }).click();

        await savedPngs(page);
    });

    test("a monthly offers Video first, and Picture for its pages", async ({ page }) => {
        await open(page, `/dispatch?edition=${MONTHLY}`);
        await expect(magazine(page, "September 2026")).toBeVisible();
        await exportButton(page).click();

        const monthly = dialog(page, /^Deadlock\+ Dispatch, Monthly Edition, September 2026$/);
        const formats = monthly.getByRole("radiogroup", { name: "Format", exact: true });
        await expect(formats.getByRole("radio").first()).toHaveAccessibleName("Video");
        await expect(formats.getByRole("radio", { name: "Video", exact: true })).toBeChecked();
        await expect(monthly.getByRole("button", { name: "Save video", exact: true })).toBeVisible();

        await formats.getByRole("radio", { name: /Picture$/ }).click();
        await expect(monthly.getByRole("radiogroup", { name: "Pages", exact: true })).toBeVisible();
        await expect(monthly.getByRole("button", { name: "Save image", exact: true })).toBeEnabled();
        await expect(monthly.getByRole("button", { name: "Save video", exact: true })).toHaveCount(0);
    });
});

test.describe("specials", () => {
    test.use({ scenario: "dispatch-specials" });

    const collectors = (page: Page) => copy(page, /^Collector's Copy, .*, New$/);
    const yearEnd = (page: Page) => copy(page, /^Year-End Special, 2026, No\. \d+, New$/);

    test("a Collector's Copy and a Year-End Special lie on the table, unread", async ({ page }) => {
        await openTable(page);
        await expect(collectors(page)).toHaveCount(1);
        await expect(yearEnd(page)).toHaveCount(1);
        await expect(navBadge(page)).toHaveAccessibleName("4 unread");
    });

    test("the Year-End Special opens folded, as the Year-End Special", async ({ page }) => {
        await openTable(page);

        await yearEnd(page).click();

        await expect(page).toHaveURL(/[?&]edition=year_end-2026$/);
        await expect(
            page.getByRole("main").getByRole("button", { name: "Unfold the Year-End Special", exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("main")).toContainText("Year-End Special");
    });

    test("the Collector's Copy opens as Beta Season 1's Collector's Copy", async ({ page }) => {
        await openTable(page);

        await collectors(page).click();

        await expect(page).toHaveURL(/[?&]edition=collectors-season_1$/);
        await expect(
            page
                .getByRole("main")
                .getByRole("region", { name: /^Deadlock\+ Dispatch, Beta Season 1 Collector's Copy\./ }),
        ).toBeVisible();
    });
});

test.describe("the notification setting", () => {
    test.use({ userAgent: WINDOWS_UA });

    test("Settings > Notifications has a New Dispatch edition switch, on, with its delivery choice", async ({
        page,
    }) => {
        await open(page, "/settings/notifications");
        const main = page.getByRole("main");

        await expect(main.getByRole("switch", { name: "New Dispatch edition", exact: true })).toBeChecked();
        await expect(main.getByRole("combobox", { name: "New Dispatch edition Shows as", exact: true })).toContainText(
            "Desktop, not while in game",
        );
    });
});

test.describe("in the default scenario", () => {
    test.use({ scenario: "default" });

    test("the table prints its own papers from the 60 demo matches", async ({ page }) => {
        await openTable(page);
        await expect(page.getByRole("heading", { level: 1, name: "Dispatch", exact: true })).toBeVisible();
        await expect(copy(page, /^Sep . \d+, Weeklies, Sep 2026$/)).toBeVisible();

        await weeklyCopy(page).click();

        await expect(paper(page, "Weekly Edition").getByRole("heading", { level: 1 })).toHaveText("Deadlock+ Dispatch");
    });
});
