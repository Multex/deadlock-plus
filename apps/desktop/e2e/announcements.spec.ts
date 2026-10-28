import type { Page } from "@playwright/test";
import { keepKvAcrossReloads, kvWrites, open } from "./support/flows";
import { expect, test } from "./support/test";

const DISMISS = "Hide this notice";

interface FetchCounter {
    __DEADLOCK_PLUS_DEMO__?: {
        handle?: { invoke(c: string, a: object): unknown; set(c: string, h: () => unknown): void };
    };
    __announcementFetches?: number;
}

/** Counts the app's feed fetches from now on, answering each with the scenario's own feed. */
async function countFetches(page: Page): Promise<() => Promise<number>> {
    await page.waitForFunction(() => Boolean((window as FetchCounter).__DEADLOCK_PLUS_DEMO__?.handle));
    await page.evaluate(() => {
        const host = window as FetchCounter;
        const handle = host.__DEADLOCK_PLUS_DEMO__!.handle!;
        const feed = handle.invoke("get_announcements", {});
        host.__announcementFetches = 0;
        handle.set("get_announcements", () => {
            host.__announcementFetches!++;
            return feed;
        });
    });
    return () => page.evaluate(() => (window as FetchCounter).__announcementFetches ?? 0);
}

const notice = (page: Page, role: "status" | "alert", title: string) =>
    page.getByRole(role).filter({ has: page.getByText(title, { exact: true }) });

test.describe("announcements-info", () => {
    test.use({ scenario: "announcements-info" });

    test("shows the notice with its link, and a dismiss keeps it hidden after a restart", async ({ page }) => {
        await keepKvAcrossReloads(page);
        await open(page, "/");
        const banner = notice(page, "status", "Every theme is on the website now");
        await expect(banner).toBeVisible();
        await expect(banner.getByRole("button", { name: "Open the website" })).toBeVisible();

        await banner.getByRole("button", { name: DISMISS }).click();
        await expect(banner).toHaveCount(0);
        expect(await kvWrites(page)).toContainEqual({
            command: "kv_set",
            store: "app-settings",
            key: "announcementsDismissed",
            value: ["demo-website-themes"],
        });

        await page.reload();
        const fetches = await countFetches(page);
        await expect.poll(fetches).toBeGreaterThan(0);
        await expect(page.getByRole("button", { name: DISMISS })).toHaveCount(0);
        await expect(page.getByText("Every theme is on the website now")).toHaveCount(0);
    });
});

test.describe("announcements-warning", () => {
    test.use({ scenario: "announcements-warning" });

    test("shows the notice with its line breaks and a dismiss button", async ({ page }) => {
        await open(page, "/");
        const banner = notice(page, "status", "New matches may show up late today");
        await expect(banner).toBeVisible();
        await expect(banner.getByText(/Nothing is lost/)).toBeVisible();
        await expect(banner.getByRole("button", { name: DISMISS })).toBeVisible();
    });
});

test.describe("announcements-critical", () => {
    test.use({ scenario: "announcements-critical" });

    test("shows the notice as an alert on every page, with no way to dismiss it", async ({ page }) => {
        await open(page, "/");
        const title = "Deadlock+ 0.13.0 cannot update itself";
        await expect(notice(page, "alert", title)).toBeVisible();
        await expect(page.getByRole("button", { name: DISMISS })).toHaveCount(0);

        await page.getByRole("navigation").getByRole("link", { name: "Stats", exact: true }).click();
        await expect(page).toHaveURL(/\/stats$/);
        await expect(notice(page, "alert", title)).toBeVisible();
    });
});

test.describe("default, for contrast", () => {
    test("shows no announcement", async ({ page }) => {
        await page.goto("/");
        const fetches = await countFetches(page);
        await expect.poll(fetches).toBeGreaterThan(0);
        await expect(page.locator("[data-announcement]")).toHaveCount(0);
    });
});
