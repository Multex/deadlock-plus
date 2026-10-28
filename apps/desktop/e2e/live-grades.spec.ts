import type { Locator, Page } from "@playwright/test";
import { openShot, type Shot } from "./support/shots";
import { expect, settle, test } from "./support/test";

interface DemoWindow {
    __DEADLOCK_PLUS_DEMO__: {
        handle: {
            invoke(command: string, args: object): unknown;
            set(command: string, handler: () => unknown): void;
            emit(event: string, payload: unknown): void;
        };
    };
}

type Match = Record<string, unknown> & { teams: { players: Record<string, unknown>[] }[] };

const LIVE: Shot = { name: "live-grades", scenario: "live-match", route: "/live" };

test.use({ scenario: "live-match" });

const strip = (page: Page) => page.getByRole("main").getByRole("button", { name: /^Overall / });
const tile = (page: Page, label: string) => page.getByRole("main").getByRole("button", { name: label, exact: true });
const overallNote = (page: Page) => strip(page).locator(".note");
const tip = (page: Page) => page.locator("[data-tooltip-content]");

/** Stands in for the reader: answers `get_live_match` with the changed match and pushes it as an event. */
async function changeMatch(page: Page, change: { clockSecs?: number; matchMode?: string; perspective?: string }) {
    await page.evaluate((fields) => {
        const { handle } = (window as unknown as DemoWindow).__DEADLOCK_PLUS_DEMO__;
        const match = { ...(handle.invoke("get_live_match", {}) as Match), ...fields };
        handle.set("get_live_match", () => match);
        handle.emit("live-match", match);
    }, change);
}

/**
 * Makes every Deadlock API analytics request answer 503 from before the app starts. The demo installs its own
 * `fetch` while the app loads; the accessor wraps whichever `fetch` the page holds when the app calls it.
 */
async function analyticsDown(page: Page) {
    await page.addInitScript(() => {
        let current = window.fetch;
        const wrap =
            (inner: typeof fetch): typeof fetch =>
            (input, init) => {
                const address = input instanceof Request ? input.url : String(input);
                if (new URL(address, location.href).pathname.startsWith("/v1/analytics/")) {
                    return Promise.resolve(new Response("503 Service Unavailable", { status: 503 }));
                }
                return inner(input, init);
            };
        Object.defineProperty(window, "fetch", {
            configurable: true,
            get: () => wrap(current),
            set: (next: typeof fetch) => {
                current = next;
            },
        });
    });
}

async function expectNoteUnclipped(page: Page, text: string) {
    const note = overallNote(page);
    await expect(note).toHaveText(text);
    const { scrollWidth, clientWidth, textWidth } = await note.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return {
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            textWidth: range.getBoundingClientRect().width,
        };
    });
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    // Italic glyphs lean past their advance width, and the note clips at its box.
    expect(textWidth + 2).toBeLessThanOrEqual(clientWidth);
}

async function hoverTip(page: Page, target: Locator): Promise<Locator> {
    await target.hover();
    await expect(tip(page)).toBeVisible();
    return tip(page);
}

test("in a ranked match the strip grades every stat against Lash at the lobby's rank", async ({ page }) => {
    await page.goto("/live");
    await settle(page);

    for (const name of [
        "Overall B",
        "Kills 9 S",
        "Deaths 3 A",
        "Assists 8 C",
        "Souls/min 1,319 A",
        "Dmg/min 907 D",
        "Obj dmg/min 132 Too early",
        "Healing 4,210 B",
    ]) {
        await expect(tile(page, name), name).toBeVisible();
    }

    const kills = await hoverTip(page, tile(page, "Kills 9 S"));
    await expect(kills).toContainText("Kills");
    await expect(kills).toContainText("Average: 4.7");
    await expect(kills).toContainText("Better than 93%");
    await expect(kills).toContainText("vs Average for Lash at Oracle");

    await page.mouse.move(0, 0);
    await expect(tip(page)).toHaveCount(0);
    const deaths = await hoverTip(page, tile(page, "Deaths 3 A"));
    await expect(deaths).toContainText("Fewer deaths than 80%");

    await page.mouse.move(0, 0);
    await expect(tip(page)).toHaveCount(0);
    const objective = await hoverTip(page, tile(page, "Obj dmg/min 132 Too early"));
    await expect(objective).toContainText("Objective damage per minute");
    await expect(objective).toContainText("Too early to grade");

    await page.mouse.move(0, 0);
    await expect(tip(page)).toHaveCount(0);
    await tile(page, "Healing 4,210 B").focus();
    await expect(tip(page)).toBeVisible();
    await expect(tip(page)).toContainText("Better than 60%");
    await expect(tip(page)).toContainText("Self heal 3,380");
    await expect(tip(page)).toContainText("Healing teammates 830");
    await expect(tip(page)).toContainText("vs Average for Lash at Oracle");
});

test("in the first minute the strip shows the values and holds back the letters", async ({ page }) => {
    await page.goto("/live");
    await settle(page);
    await expect(tile(page, "Kills 9 S")).toBeVisible();

    await changeMatch(page, { clockSecs: 42 });

    await expect(strip(page)).toHaveAccessibleName("Overall —");
    await expect(strip(page)).toContainText("Grades after 1:00");
    await expectNoteUnclipped(page, "Grades after 1:00");
    await expect(tile(page, "Kills 9 —")).toBeVisible();
    await expect(tile(page, "Healing 4,210 —")).toBeVisible();
    await expect(page.getByRole("main").getByRole("button", { name: / [EDCBAS]$/ })).toHaveCount(0);
});

test("with the Deadlock API down the strip says there are no targets and why", async ({ page }) => {
    await analyticsDown(page);
    await page.goto("/live");
    await settle(page);

    await expect(strip(page)).toHaveAccessibleName("Overall —");
    await expect(strip(page)).toContainText("No targets");
    await expectNoteUnclipped(page, "No targets");
    await expect(tile(page, "Kills 9 —")).toBeVisible();
    await expect(tile(page, "Souls/min 1,319 —")).toBeVisible();

    const reason = await hoverTip(page, strip(page));
    await expect(reason).toContainText("No targets: the Deadlock API is not responding.");
});

test("past the last point of the curve the grades go on and say the targets are frozen", async ({ page }) => {
    await page.goto("/live");
    await settle(page);
    await expect(tile(page, "Kills 9 S")).toBeVisible();

    await changeMatch(page, { clockSecs: 52 * 60 });

    await expect(strip(page)).toContainText("Targets frozen");
    await expectNoteUnclipped(page, "Targets frozen");
    await expect(strip(page)).toHaveAccessibleName(/^Overall [EDCBAS]$/);
    await expect(page.getByRole("main").getByRole("button", { name: /^Kills 9 [EDCBAS]$/ })).toBeVisible();
});

for (const [what, change] of [
    ["while spectating", { perspective: "spectating" }],
    ["in a bot match", { matchMode: "coopBot" }],
] as const) {
    test(`the strip is gone ${what} and the teams stay`, async ({ page }) => {
        await page.goto("/live");
        await settle(page);
        await expect(strip(page)).toBeVisible();

        await changeMatch(page, change);

        await expect(strip(page)).toHaveCount(0);
        await expect(page.getByRole("table", { name: "The Archmother" }).getByRole("row")).toHaveCount(8);
    });
}

test("the strip draws the lobby's rank art at 16 pixels", async ({ page }) => {
    await page.goto("/live");
    await settle(page);

    const art = strip(page).locator('img[src*="/ranks/"]');
    await expect(art).toHaveCount(1);
    const box = await art.boundingBox();
    expect({ width: box!.width, height: box!.height }).toEqual({ width: 16, height: 16 });
});

test("the Live page with the strip looks like its baseline and keeps both teams in the window", async ({ page }) => {
    test.skip(process.platform !== "win32", "baselines are made on Windows only; fonts render differently elsewhere");
    await openShot(page, LIVE);
    await expect(tile(page, "Kills 9 S")).toBeVisible();

    const total = await page.getByRole("table", { name: "The Archmother" }).getByRole("row").last().boundingBox();
    const main = await page.getByRole("main").boundingBox();
    expect(total!.y + total!.height).toBeLessThanOrEqual(main!.y + main!.height);
    expect(main!.y + main!.height).toBeLessThanOrEqual(900);

    await expect(page).toHaveScreenshot(`${LIVE.name}.png`);
});
