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
    /** Viewport width when the page needs more than the default. */
    width?: number;
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
            viewport: 658,
            width: 549,
            padding: 11,
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
            viewport: 710,
            width: 593,
            padding: 7,
            steps: collapseSidebar,
        },
    },
    {
        name: "match-history",
        scenario: "default",
        route: "/match-history",
        detail: {
            target: { role: "heading", name: "Sessions" },
            anchor: "start",
            viewport: 876,
            width: 765,
            padding: 10,
            // Narrower, the matches overflow their rows; wider, a third session no longer fits. The crop is
            // taller than the window, so the window grows to hold it.
            steps: async (page) => {
                await collapseSidebar(page);
                await page.setViewportSize({ width: 876, height: 1100 });
                // At this width each match's mode name is cut to a stray letter. Its icon still names the mode.
                await page.locator("main li p > span.truncate").evaluateAll((labels) =>
                    labels.forEach((label) => {
                        for (const el of [label, label.nextElementSibling]) {
                            if (el instanceof HTMLElement) el.style.display = "none";
                        }
                    }),
                );
            },
        },
    },
    {
        name: "match",
        scenario: "default",
        route: "/match-history/990000056",
        height: 1523,
        detail: { target: { role: "table", name: "Scoreboard" }, width: 472, padding: 4 },
    },
    {
        name: "builds",
        scenario: "default",
        route: "/builds",
        // Tall enough for the open build's pane to end below its shop, above the ability order.
        height: 1030,
        websiteOnly: true,
        detail: {
            target: { role: "heading", name: /^Builds$/ },
            anchor: "start",
            viewport: 640,
            width: 568,
            padding: 10,
            steps: collapseSidebar,
        },
    },
    {
        name: "build",
        scenario: "default",
        route: "/builds/view?source=local&id=3",
        height: 1160,
        websiteOnly: true,
        detail: {
            target: { role: "region", name: /^Shop$/ },
            anchor: "start",
            // Lane, Mid game and Late game side by side take the page's whole left column. The crop stops before
            // the shop's cost badge and the abilities panel, and the page's bottom edge moves it up to the header.
            width: 823,
            padding: 6,
        },
    },
    {
        name: "build-editor",
        scenario: "default",
        route: "/builds/edit?source=public&id=402117",
        // Wide enough, with the sidebar collapsed, for the ability order to show all 16 steps. Tall enough for
        // the canvas to hold the categories at Fit without scrolling.
        width: 1680,
        height: 1115,
        websiteOnly: true,
        steps: async (page) => {
            await collapseSidebar(page);
            for (const [slot, tag] of [
                [1, "Spirit"],
                [2, "Damage"],
                [3, "Afterburn"],
            ] as const) {
                await page.getByRole("button", { name: `Tag ${slot}: empty` }).click();
                await page.getByRole("menuitem", { name: tag, exact: true }).click();
            }
            // The demo's builds keep category sizes the editor flags as layout issues. Fix all keeps the
            // columns each category shows, so the layout stays the game's.
            await page.getByRole("button", { name: /layout issue/ }).click();
            await page.getByRole("menuitem", { name: /^Fix all/ }).click();
            await expect(page.getByRole("button", { name: /layout issue/ })).toHaveCount(0);
            await expect(page.getByTestId("editor-status")).toHaveAttribute("data-state", "draft");
            const zoomIn = page.getByTestId("toolbar-zoom-in");
            while (await zoomIn.isEnabled()) await zoomIn.click();
            await expect(page.getByTestId("toolbar-zoom")).toContainText("Fit");
            await page.mouse.move(0, 0);
        },
        detail: {
            target: { role: "application", name: "Build items" },
            anchor: "start",
            // Ends between Mid game and Late game, and below the souls timeline's axis.
            width: 618,
            padding: 6,
        },
    },
    {
        name: "stats",
        scenario: "default",
        route: "/stats",
        detail: {
            target: { role: "region", name: "Rank" },
            anchor: "start",
            viewport: 721,
            width: 610,
            padding: 10,
            steps: collapseSidebar,
        },
    },
    { name: "mutes", scenario: "default", route: "/voice-bans" },
    {
        name: "replays",
        scenario: "default",
        route: "/demos",
        detail: {
            target: { role: "button", name: /^All \(/ },
            anchor: "start",
            viewport: 656,
            width: 535,
            padding: 5,
            steps: collapseSidebar,
        },
    },
    {
        name: "storage",
        scenario: "default",
        route: "/settings/storage",
        detail: {
            target: { role: "heading", name: "Storage" },
            anchor: "start",
            viewport: 654,
            width: 557,
            padding: 10,
            steps: collapseSidebar,
        },
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
            viewport: 576,
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
        detail: { target: { role: "table", name: "The Hidden King" }, anchor: "start", width: 513, padding: 8 },
    },
    {
        name: "discord-presence",
        scenario: "live-match",
        route: "/presence",
        height: 1529,
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
            await scrollInMain(page.getByRole("heading", { name: "Presence editor" }), 33);
            // The pointer is still where the last click was, and would light up the row now under it.
            await page.mouse.move(0, 0);
        },
        detail: {
            target: { role: "group", name: "Activity preview" },
            width: 300,
            padding: 12,
            viewport: 870,
            // Hidden, not removed, so the card stays where it is. The frame is taller than the card and would
            // otherwise take in the state's title and reset button above it and the editor's helper line below.
            steps: async (page) => {
                const extras = [
                    page.getByText("In a match: Ranked", { exact: true }),
                    page.getByRole("button", { name: "Reset this state" }),
                    page.getByText("Click a line, then insert a value into it."),
                    page.getByRole("button", { name: "Insert value" }),
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
    await page.setViewportSize({ width: shot.width ?? WIDTH, height: shot.height ?? HEIGHT });
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
