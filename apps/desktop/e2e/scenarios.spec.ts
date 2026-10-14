import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { isDynamic, routePatterns, settingsCategories } from "./support/routes";
import { expect, settle, test } from "./support/test";

const STATIC_ROUTES = [
    ...routePatterns().filter((pattern) => !isDynamic(pattern)),
    ...settingsCategories().map((category) => `/settings/${category}`),
];

const APP_VERSION: string = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const [MAJOR, MINOR] = APP_VERSION.split(".").map(Number);
const NEXT_VERSION = `${MAJOR}.${MINOR + 1}.0`;

interface DemoState {
    scenario: string;
    unhandled: string[];
}

/** The scenario the page is really running, and every command it invoked that nothing answered. */
function demoState(page: Page): Promise<DemoState> {
    return page.evaluate(() => {
        const demo = (window as unknown as { __DEADLOCK_PLUS_DEMO__: { scenario: string; unhandled(): string[] } })
            .__DEADLOCK_PLUS_DEMO__;
        return { scenario: demo.scenario, unhandled: demo.unhandled() };
    });
}

/** Follows a link to `href` inside the running app, so the scenario's state survives the navigation. */
async function follow(page: Page, href: string) {
    await page.evaluate((target) => {
        const link = document.createElement("a");
        link.href = target;
        document.body.append(link);
        link.click();
        link.remove();
    }, href);
    await page.waitForURL((url) => url.pathname === href);
}

async function expectLoaded(page: Page, scenario: string, path: string) {
    await settle(page);
    expect(new URL(page.url()).pathname, "the route redirected").toBe(path);
    await expect(page.getByRole("main")).toBeVisible();
    expect(await demoState(page)).toEqual({ scenario, unhandled: [] });
}

/**
 * One test per static route of `scenario`. `broken` maps a route the app cannot show in this scenario to the
 * failure seen; such a route is skipped until the app is fixed. `open` gets the page to the route.
 */
function everyStaticRouteLoads(
    scenario: string,
    broken: Record<string, string> = {},
    open: (page: Page, path: string) => Promise<unknown> = (page, path) => page.goto(path),
) {
    for (const path of STATIC_ROUTES) {
        test(`${path} loads with every command answered`, async ({ page }) => {
            test.fixme(path in broken, broken[path]);
            await open(page, path);
            await expectLoaded(page, scenario, path);
        });
    }
}

const STATS_CARDS = ["Rank", "Recent form", "Last session"];

/** One of Home's cards that are filled from the match history. */
const statsCard = (page: Page, title: string) =>
    page.getByRole("region", { name: "Your Deadlock" }).getByRole("link", { name: new RegExp(`^${title}`) });

test("the route tree yields static routes to check", () => {
    expect(STATIC_ROUTES.length).toBeGreaterThan(15);
});

test.describe("new-user", () => {
    test.use({ scenario: "new-user" });

    /** A page load lands on the setup; skipping it is the shortest way into the app as a new user. */
    async function skipSetup(page: Page) {
        await page.goto("/");
        await page.waitForURL("**/onboarding");
        await page.getByRole("button", { name: "Skip" }).click();
        await page.waitForURL((url) => url.pathname === "/");
    }

    everyStaticRouteLoads("new-user", {}, async (page, path) => {
        await skipSetup(page);
        if (path !== "/") await follow(page, path);
    });

    const NO_ACCOUNT = "No Steam account found, so there is no history to load.";
    const EMPTY_STATES: Record<string, string> = {
        "/demos": "No replays saved yet.",
        "/match-history": NO_ACCOUNT,
        "/rank": NO_ACCOUNT,
        "/sessions": NO_ACCOUNT,
        "/stats": NO_ACCOUNT,
        "/voice-bans": "No Steam account found.",
        "/server-picker": "Unblock all (0)",
    };

    for (const [path, text] of Object.entries(EMPTY_STATES)) {
        test(`${path} says there is nothing yet`, async ({ page }) => {
            await skipSetup(page);
            await follow(page, path);
            await settle(page);
            await expect(page.getByRole("main").getByText(text)).toBeVisible();
        });
    }

    test("Home counts no replays and greets nobody by name", async ({ page }) => {
        await skipSetup(page);
        await settle(page);
        await expect(page.getByRole("link", { name: "Saved replays" })).toContainText("0");
        await expect(page.getByRole("main")).not.toContainText("Lantern");
    });

    test("Home stops waiting for a rank, form and session when there is no Steam account", async ({ page }) => {
        await skipSetup(page);
        await settle(page);
        await expect(page.getByRole("main").getByText("Loading...")).toHaveCount(0);
        for (const card of STATS_CARDS) await expect(statsCard(page, card)).toContainText("No Steam account found");
    });

    test("Home counts the blocked regions before Server Picker has ever been opened", async ({ page }) => {
        await skipSetup(page);
        await settle(page);
        await expect(page.getByRole("link", { name: "Blocked regions" })).toHaveText(/^\s*0\s*Blocked regions\s*$/);
    });

    test("Mutes offers no import or export without a Steam account, and reports no error", async ({ page }) => {
        await skipSetup(page);
        await follow(page, "/voice-bans");
        await settle(page);
        await expect(page.getByRole("main").getByText("No Steam account found.")).toBeVisible();
        await expect(page.getByRole("alert")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
        await expect(page.getByRole("button", { name: "Export all", exact: true })).toBeDisabled();
    });
});

test.describe("live-match", () => {
    test.use({ scenario: "live-match" });

    everyStaticRouteLoads("live-match");

    const hiddenKing = (page: Page) => page.getByRole("table", { name: "The Hidden King" });
    const archmother = (page: Page) => page.getByRole("table", { name: "The Archmother" });

    /** Stands in for the Rust side: answers the status commands with a new state and pushes it as events. */
    async function changeLive(page: Page, phase: "postMatch" | "menus", connected: boolean) {
        await page.evaluate(
            ([phase, connected]) => {
                const { handle } = (
                    window as unknown as {
                        __DEADLOCK_PLUS_DEMO__: {
                            handle: {
                                invoke(command: string, args: object): unknown;
                                set(command: string, handler: () => unknown): void;
                                emit(event: string, payload: unknown): void;
                            };
                        };
                    }
                ).__DEADLOCK_PLUS_DEMO__;
                const state = { phase, matchPresent: phase === "postMatch" };
                const before = handle.invoke("get_live_match", {}) as Record<string, unknown>;
                const match =
                    phase === "postMatch"
                        ? before
                        : { ...before, clockSecs: null, matchMode: null, gameMode: null, yourSide: null, teams: [] };
                const poll = handle.invoke("network_poll", { sinceT: null }) as {
                    snapshot: Record<string, unknown>;
                };
                const snapshot = connected ? poll.snapshot : { ...poll.snapshot, relay: null };

                handle.set("get_live_state", () => state);
                handle.set("get_live_match", () => match);
                handle.set("network_snapshot", () => snapshot);
                handle.set("network_poll", () => ({ snapshot, tail: [] }));
                handle.emit("live-snapshot", state);
                handle.emit("live-match", match);
            },
            [phase, connected] as const,
        );
    }

    test("Live shows both teams, the server and the ping, and nothing says the game is closed", async ({ page }) => {
        await page.goto("/live");
        await settle(page);
        const main = page.getByRole("main");

        await expect(hiddenKing(page).getByRole("row")).toHaveCount(8);
        await expect(archmother(page).getByRole("row")).toHaveCount(8);
        await expect(hiddenKing(page)).toContainText("Lantern");
        await expect(archmother(page)).toContainText("Tin Whistle");
        // Your own team is listed first.
        await expect(page.getByRole("table").first()).toHaveAccessibleName("The Hidden King");
        await expect(main.getByText("23:41")).toBeVisible();
        await expect(main.getByText("Ranked", { exact: true })).toBeVisible();

        await expect(main.getByText("Deadlock running", { exact: true })).toBeVisible();
        await expect(main.getByText("Frankfurt (Germany)")).toBeVisible();
        await expect(main.getByText("over 300 pings")).toBeVisible();
        await expect(page.getByTitle("Open Live")).toContainText("In match");
        await expect(page.getByTitle("Open Live")).toContainText("23:41");
        for (const closed of ["Deadlock is not running", "Deadlock isn't running.", "Deadlock not running"]) {
            await expect(page.getByText(closed, { exact: true }), closed).toHaveCount(0);
        }
    });

    test("every page agrees the game is running", async ({ page }) => {
        await page.goto("/");
        await settle(page);
        await expect(page.getByRole("main").getByText("Running", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Launch" })).toHaveCount(0);
    });

    test("the match finishes: the status bar says so and the board stays up with the result", async ({ page }) => {
        await page.goto("/live");
        await settle(page);
        await expect(page.getByTitle("Open Live")).toContainText("In match");

        await changeLive(page, "postMatch", true);

        await expect(page.getByTitle("Open Live")).toContainText("Match finished");
        await expect(page.getByTitle("Open Live")).not.toContainText("23:41");
        await expect(hiddenKing(page).getByRole("row")).toHaveCount(8);
        await expect(archmother(page).getByRole("row")).toHaveCount(8);
    });

    test("the player leaves mid-match: the board gives way to the menus and the server card empties", async ({
        page,
    }) => {
        await page.goto("/live");
        await settle(page);
        const main = page.getByRole("main");
        await expect(hiddenKing(page)).toBeVisible();
        await expect(main.getByText("Frankfurt (Germany)")).toBeVisible();

        await changeLive(page, "menus", false);

        // The phase arrives as an event; the server card follows on the page's next poll, a second later.
        await expect(main.getByText("In the menus")).toBeVisible();
        await expect(page.getByRole("table")).toHaveCount(0);
        await expect(main.getByText("Not connected to a match server yet. Start or join a match.")).toBeVisible();
        await expect(main.getByText("Frankfurt (Germany)")).toHaveCount(0);
        await expect(page.getByTitle("Open Live")).toHaveCount(0);
        await expect(page.getByTitle("Deadlock is running")).toBeVisible();
    });
});

const HISTORY_PAGES = ["/", "/stats", "/rank", "/sessions", "/match-history"];
const NO_CONNECTION = "A network request failed. Check your connection and try again.";

/**
 * Records the address of every request the page makes, from before the app starts, and returns a reader of
 * them. The demo answers Deadlock API requests inside the page, so the network never sees those.
 */
async function recordRequests(page: Page): Promise<() => Promise<string[]>> {
    await page.addInitScript(() => {
        const native = window.fetch;
        let current = native;
        const seen: string[] = [];
        const recorded: typeof fetch = (input, init) => {
            seen.push(input instanceof Request ? input.url : String(input));
            return current(input, init);
        };
        // The demo keeps the fetch it finds as its way out to the network, then assigns its own.
        Object.defineProperty(window, "fetch", {
            configurable: true,
            get: () => (current === native ? native : recorded),
            set: (next: typeof fetch) => (current = next),
        });
        (window as unknown as { __E2E_REQUESTS__: string[] }).__E2E_REQUESTS__ = seen;
    });
    return () => page.evaluate(() => (window as unknown as { __E2E_REQUESTS__: string[] }).__E2E_REQUESTS__);
}

for (const [scenario, historyError, matchError] of [
    ["offline", NO_CONNECTION, NO_CONNECTION],
    ["api-down", "The Deadlock API returned an error (503).", "The Deadlock API returned an error (503)."],
] as const) {
    test.describe(scenario, () => {
        test.use({ scenario });

        everyStaticRouteLoads(scenario);

        for (const path of HISTORY_PAGES) {
            test(`${path} asks for the match history once and leaves a failure alone`, async ({ page }) => {
                const requests = await recordRequests(page);
                await page.goto(path);
                await settle(page);
                await page.waitForTimeout(2000);

                const history = (await requests()).filter((url) => new URL(url).pathname.endsWith("/match-history"));
                expect(history.length).toBeGreaterThan(0);
                expect(history.length).toBeLessThanOrEqual(2);
            });
        }

        for (const path of HISTORY_PAGES.filter((path) => path !== "/")) {
            test(`${path} says the history could not load, and why`, async ({ page }) => {
                await page.goto(path);
                await settle(page);
                await expect(page.getByRole("main").getByRole("alert")).toHaveText(
                    `Could not load your match history. ${historyError}`,
                );
            });
        }

        test("Home says its rank, form and session could not load", async ({ page }) => {
            await page.goto("/");
            await settle(page);
            await expect(page.getByRole("main").getByText("Loading...")).toHaveCount(0);
            for (const card of STATS_CARDS)
                await expect(statsCard(page, card)).toContainText("Couldn't load. Try again later.");
        });

        test("the status bar reports the API as unreachable", async ({ page }) => {
            await page.goto("/alerts");
            await settle(page);
            await expect(page.getByTitle("Deadlock API is unreachable")).toHaveText("Deadlock API offline");
        });

        test("a match page says it could not load, and why", async ({ page }) => {
            await page.goto("/match-history/990000060");
            await settle(page);
            await expect(page.getByRole("main")).toContainText(`Could not load this match. ${matchError}`);
            expect(await demoState(page)).toEqual({ scenario, unhandled: [] });
        });

        test("Mutes lists the muted players by id when their names cannot be looked up", async ({ page }) => {
            await page.goto("/voice-bans");
            await settle(page);
            const main = page.getByRole("main");
            await expect(main.getByText("14 of 14 muted")).toBeVisible();
            await expect(main.getByText("Unknown player").first()).toBeVisible();
            await expect(main.getByText("76561198050265743")).toBeVisible();
        });

        test("Replays still lists the files on this PC, naming heroes by id", async ({ page }) => {
            await page.goto("/demos");
            await settle(page);
            await expect(page.getByRole("main").getByText("12 replays, 3.4 GB")).toBeVisible();
            await expect(
                page
                    .getByRole("main")
                    .getByText(/^Hero \d+ · /)
                    .first(),
            ).toBeVisible();
        });
    });
}

test.describe("update-available", () => {
    test.use({ scenario: "update-available" });

    everyStaticRouteLoads("update-available");

    test("the launch check announces the new version in a toast and in the title bar", async ({ page }) => {
        await page.goto("/");
        await settle(page);
        await expect(page.getByText(`Deadlock+ ${NEXT_VERSION} is available`)).toBeVisible();
        await page.getByRole("button", { name: `Update ${NEXT_VERSION} available` }).click();
        await expect(page).toHaveURL(/\/settings\/about$/);
    });

    test("Settings offers the install, and a click starts the download", async ({ page }) => {
        await page.goto("/settings/about");
        await settle(page);
        const main = page.getByRole("main");
        await expect(main.getByText(`Version ${NEXT_VERSION} is available.`)).toBeVisible();
        await expect(main.getByRole("button", { name: "Check now" })).toHaveCount(0);

        await main.getByRole("button", { name: `Install ${NEXT_VERSION}` }).click();

        await expect(main.getByText(`Downloading ${NEXT_VERSION}. Deadlock+ restarts when it finishes.`)).toBeVisible();
        await expect(page.getByRole("button", { name: "Update downloading" })).toBeVisible();
        await expect(main.getByRole("button", { name: "Check now" })).toBeDisabled();
    });
});

test.describe("default, for contrast", () => {
    test("no update is offered", async ({ page }) => {
        await page.goto("/settings/about");
        await settle(page);
        await expect(page.getByRole("main").getByText("You're on the latest version.")).toBeVisible();
        await expect(page.getByRole("button", { name: /^Update .* available$/ })).toHaveCount(0);
    });

    test("Stats falls back to its saved copy when the API drops mid-session", async ({ page }) => {
        await page.goto("/stats");
        await settle(page);
        const main = page.getByRole("main");
        await expect(main.getByText(/Couldn't reach the Deadlock API/)).toHaveCount(0);

        await page.evaluate(() => {
            window.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
        });
        await main.getByRole("button", { name: "Refresh" }).click();

        await expect(main.getByText(/^Couldn't reach the Deadlock API. Showing the copy saved /)).toBeVisible();
        expect((await demoState(page)).unhandled).toEqual([]);
    });
});
