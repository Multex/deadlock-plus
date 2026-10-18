import type { Page } from "@playwright/test";
import { open } from "./support/flows";
import { expect, test } from "./support/test";

const NEWEST = 990000060;

interface ExportWindow {
    __DEADLOCK_PLUS_DEMO__?: { handle?: { set(command: string, handler: (args: unknown) => unknown): void } };
    __E2E_SVG__?: string;
}

// html-to-image freezes every computed width and height into the image, then the image lays it all out again.
// Above 100% display or app scaling, WebView2 draws text a little wider and rounds fractional sizes up; headless
// Edge never does. Widening the letters and widths of the off-screen copy (`inert`) the same way reproduces it.
const WIDER_TEXT = "0.6px";
const WIDTH_ROUNDING_PX = 0.5;

async function exportScoreboard(page: Page, drift: boolean): Promise<void> {
    await page.evaluate(
        ([wider, rounding, on]) => {
            const host = window as unknown as ExportWindow;
            const imageSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!;
            Object.defineProperty(HTMLImageElement.prototype, "src", {
                ...imageSrc,
                set(value: string) {
                    if (value.startsWith("data:image/svg+xml")) host.__E2E_SVG__ = value;
                    imageSrc.set!.call(this, value);
                },
            });
            if (on) {
                const computed = window.getComputedStyle;
                window.getComputedStyle = (element, pseudo) => {
                    const style = computed(element, pseudo);
                    if (!element.closest("[inert]")) return style;
                    return new Proxy(style, {
                        get(target, key) {
                            if (key === "getPropertyValue")
                                return (name: string) => {
                                    const value = target.getPropertyValue(name);
                                    if (name === "letter-spacing") return wider;
                                    if (name === "width" && value.endsWith("px"))
                                        return `${parseFloat(value) + rounding}px`;
                                    return value;
                                };
                            const value = Reflect.get(target, key, target);
                            return typeof value === "function" ? value.bind(target) : value;
                        },
                    });
                };
            }
            host.__DEADLOCK_PLUS_DEMO__!.handle!.set("save_binary_file", () => true);
        },
        [WIDER_TEXT, WIDTH_ROUNDING_PX, drift] as const,
    );
    await page.getByRole("button", { name: "Save image", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Scoreboard image saved." })).toBeVisible();
}

interface Laid {
    scrollers: string[];
    teamNameLines: number[];
}

/** Lays out the exact markup the image was drawn from and reports what scrolls and how team names wrap. */
async function layOutImage(page: Page): Promise<Laid> {
    return page.evaluate(() => {
        const url = (window as unknown as ExportWindow).__E2E_SVG__!;
        const svg = decodeURIComponent(url.slice(url.indexOf(",") + 1));
        const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
        const root = doc.querySelector("foreignObject")!.firstElementChild!;
        const stage = document.createElement("div");
        stage.style.cssText = "position:absolute;top:0;left:0;visibility:hidden;";
        stage.append(document.importNode(root, true));
        document.body.append(stage);
        try {
            const scrollers = [...stage.querySelectorAll<HTMLElement>("*")]
                .filter((el) => {
                    const style = getComputedStyle(el);
                    const scrolls = (v: string) => v === "auto" || v === "scroll";
                    return (
                        (scrolls(style.overflowX) && el.scrollWidth > el.clientWidth) ||
                        (scrolls(style.overflowY) && el.scrollHeight > el.clientHeight)
                    );
                })
                .map((el) => el.className);
            const teamNameLines = [...stage.querySelectorAll<HTMLElement>(".team-name")].map((el) => {
                const range = document.createRange();
                range.selectNodeContents(el);
                return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
            });
            return { scrollers, teamNameLines };
        } finally {
            stage.remove();
        }
    });
}

test.describe("the scoreboard image", () => {
    test.beforeEach(async ({ page }) => {
        await open(page, `/match-history/${NEWEST}`);
    });

    for (const drift of [false, true]) {
        test(`has no scrollbars and keeps team names on one line${drift ? " when it draws a little larger" : ""}`, async ({
            page,
        }) => {
            await exportScoreboard(page, drift);
            const laid = await layOutImage(page);
            expect(laid.scrollers).toEqual([]);
            expect(laid.teamNameLines).toEqual([1, 1]);
        });
    }
});
