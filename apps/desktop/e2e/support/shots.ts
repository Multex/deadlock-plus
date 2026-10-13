import type { Locator, Page } from "@playwright/test";
import { expect, settle } from "./test";

type Role = Parameters<Page["getByRole"]>[0];

/** A tight portrait crop of the shot's most telling part, made for phones. */
export interface Detail {
    /** The element the crop is placed on: its role and accessible name, or text it shows. */
    target: { role: Role; name?: string | RegExp } | { text: string | RegExp };
    /** Width of the cropped region in CSS pixels. The height is five quarters of it. */
    width?: number;
    /** Space kept around the element where the crop starts at its edge. */
    padding?: number;
    /**
     * The crop is centred on an element that fits in it, and starts at the top left of one that does not.
     * "start" puts it at the element's top left either way.
     */
    anchor?: "start";
    /**
     * Window width for the crop alone. A phone shows about a third of the full window's width, so rows that
     * span it lose their right half; in a narrow window the page lays them out again to fit.
     */
    viewport?: number;
    /** Runs after the full picture is taken and the window is resized, before the crop. */
    steps?: (page: Page) => Promise<void>;
}

export interface Shot {
    /** File name without the extension. */
    name: string;
    /** Id of the demo scenario the page runs on. */
    scenario: string;
    route: string;
    /** Viewport height when the page needs more than the default. */
    height?: number;
    /** Runs after the page settles, before the picture. */
    steps?: (page: Page) => Promise<void>;
    /** Made for the website only: no baseline is kept, so the visual comparison leaves it out. */
    websiteOnly?: true;
    /** Written beside the full picture as `<name>-mobile.webp`. */
    detail?: Detail;
}

const WIDTH = 1480;
const HEIGHT = 900;

/** Every picture of the app: the website's screenshots, and the pages the visual comparison checks. */
export const SHOTS: Shot[] = [
    {
        name: "home",
        scenario: "default",
        route: "/",
        detail: {
            target: { role: "button", name: "Launch Deadlock" },
            anchor: "start",
            viewport: 652,
            width: 547,
            padding: 13,
            steps: collapseSidebar,
        },
    },
    {
        name: "server-picker",
        scenario: "default",
        route: "/server-picker",
        detail: {
            target: { role: "button", name: "Presets" },
            anchor: "start",
            viewport: 664,
            width: 549,
            padding: 8,
            steps: collapseSidebar,
        },
    },
    {
        name: "match-history",
        scenario: "default",
        route: "/match-history",
        detail: { target: { text: /^Matches$/ }, anchor: "start", width: 468, padding: 24 },
    },
    {
        name: "match",
        scenario: "default",
        route: "/match-history/990000056",
        height: 1500,
        detail: { target: { role: "table", name: "Scoreboard" }, width: 472, padding: 4 },
    },
    {
        name: "stats",
        scenario: "default",
        route: "/stats",
        detail: {
            target: { text: /^Winrate$/ },
            anchor: "start",
            viewport: 670,
            width: 559,
            padding: 26,
            steps: collapseSidebar,
        },
    },
    {
        name: "rank",
        scenario: "default",
        route: "/rank",
        detail: {
            target: { role: "heading", name: "Rank" },
            anchor: "start",
            viewport: 664,
            width: 553,
            padding: 10,
            steps: collapseSidebar,
        },
    },
    {
        name: "sessions",
        scenario: "default",
        route: "/sessions",
        detail: {
            target: { text: /Nice work/ },
            anchor: "start",
            viewport: 584,
            width: 467,
            padding: 7,
            steps: collapseSidebar,
        },
    },
    { name: "mutes", scenario: "default", route: "/voice-bans" },
    {
        name: "replays",
        scenario: "default",
        route: "/demos",
        detail: { target: { role: "button", name: /^All \(/ }, anchor: "start", width: 480, padding: 8 },
    },
    {
        name: "storage",
        scenario: "default",
        route: "/storage",
        detail: { target: { text: "Total found" }, anchor: "start", width: 480, padding: 24 },
    },
    {
        name: "performance",
        scenario: "default",
        route: "/performance",
        steps: async (page) => {
            await page.getByRole("tab", { name: /^Compare/ }).click();
            await expect(page.getByRole("tab", { name: /^Compare/ })).toHaveAttribute("aria-selected", "true");
        },
        detail: {
            target: { role: "table" },
            anchor: "start",
            viewport: 574,
            width: 463,
            padding: 10,
            steps: collapseSidebar,
        },
    },
    {
        name: "live",
        scenario: "live-match",
        route: "/live",
        height: 1440,
        websiteOnly: true,
        detail: { target: { role: "table", name: "The Hidden King" }, anchor: "start", width: 520, padding: 8 },
    },
    {
        name: "discord-presence",
        scenario: "live-match",
        route: "/settings/discord",
        height: 1560,
        websiteOnly: true,
        steps: async (page) => {
            const states = page.getByRole("navigation", { name: "Activity states" });
            await page.getByRole("radio", { name: /^Detailed/ }).click();
            await states.getByRole("button", { name: /^In a match/ }).click();
            await states.getByRole("button", { name: /^Ranked/ }).click();
            // The preview is redrawn a moment after the choice, not with it. Its hero and rank pictures are
            // decorative, so they have no role or name to wait on.
            const preview = page.getByRole("group", { name: "Activity preview" });
            await expect(preview).toContainText("Playing Ranked");
            await expect
                .poll(() =>
                    preview
                        .locator("img")
                        .evaluateAll((all) => all.map((img) => (img as HTMLImageElement).naturalWidth > 0)),
                )
                .toEqual([true, true]);
            // The website's cards show the top of the picture, and the preview is the part worth showing.
            await scrollInMain(page.getByRole("heading", { name: "Presence editor" }), 36);
            // The pointer is still where the last click was, and would light up the row now under it.
            await page.mouse.move(0, 0);
        },
        detail: {
            target: { role: "group", name: "Activity preview" },
            width: 300,
            padding: 12,
            // Hidden, not removed, so the card stays where it is. The frame is taller than the card and would
            // otherwise take in the state's title and reset button above it and the editor's helper line below.
            steps: async (page) => {
                const extras = [
                    page.getByText("In a match: Ranked", { exact: true }),
                    page.getByRole("button", { name: "Reset this state" }),
                    page.getByText("Click a line, then insert a variable into it."),
                    page.getByRole("button", { name: "Insert variable" }),
                ];
                for (const extra of extras) {
                    await extra.first().evaluate((el) => {
                        el.style.visibility = "hidden";
                    });
                }
            },
        },
    },
];

/** Takes a page that runs the shot's scenario to the state the picture is taken in. */
export async function openShot(page: Page, shot: Shot): Promise<void> {
    await page.setViewportSize({ width: WIDTH, height: shot.height ?? HEIGHT });
    await page.goto(shot.route);
    await settle(page);
    await shot.steps?.(page);
    await settle(page);
}

/** Leaves the navigation as a strip of icons, which gives a narrow window's width to the page. */
export async function collapseSidebar(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
}

/**
 * Scrolls the app's content so the element sits `gap` pixels below its top edge. `scrollIntoView` would
 * also move the window frame, which is not meant to scroll.
 */
export async function scrollInMain(target: Locator, gap: number): Promise<void> {
    await target.evaluate((element, below) => {
        const main = element.closest("main");
        if (!main) return;
        main.scrollTop += element.getBoundingClientRect().top - main.getBoundingClientRect().top - below;
    }, gap);
}
