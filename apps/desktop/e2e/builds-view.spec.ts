import type { Page } from "@playwright/test";
import { layoutBuild } from "@deadlock-plus/build-layout";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { LocalBuilds } from "@deadlock-plus/ipc-types/LocalBuilds";
import { screenDifferences } from "../src/lib/features/builds/shop-view";
import { open } from "./support/flows";
import { expect, test } from "./support/test";

const QHD = { width: 2560, height: 1440 };
const FHD = { width: 1920, height: 1080 };
const LOCAL_ID = 3;
const PUBLIC_ID = 381204;
const OWN_PUBLISHED_ID = 402117;

const shop = (page: Page) => page.getByTestId("shop");
const categories = (page: Page) => shop(page).locator("section.category");

// The resolution control starts on the user's own screen; most tests read the measured 1440p.
test.use({ screen: QHD });

function localBuilds(page: Page): Promise<LocalBuilds> {
    return page.evaluate(async () => {
        const host = window as unknown as {
            __DEADLOCK_PLUS_DEMO__: { handle: { invoke(command: string, args: object): unknown } };
        };
        return (await host.__DEADLOCK_PLUS_DEMO__.handle.invoke("builds_local", {})) as LocalBuilds;
    });
}

test("a bare URL shows the empty state", async ({ page }) => {
    await open(page, "/builds/view");
    await expect(page.getByTestId("build-empty")).toBeVisible();
    await expect(page.getByTestId("build-header")).toHaveCount(0);
});

test("an unknown build says it is missing", async ({ page }) => {
    await open(page, "/builds/view?source=local&id=999");
    await expect(page.getByTestId("build-missing")).toBeVisible();
});

test("a local build shows its status, shop, cost and ability order", async ({ page }) => {
    await open(page, `/builds/view?source=local&id=${LOCAL_ID}`);
    const build = (await localBuilds(page)).builds.find((b) => b.build.heroBuildId === LOCAL_ID)!.build;

    const header = page.getByTestId("build-header");
    await expect(header.getByRole("heading", { level: 1, name: build.name, exact: true })).toBeVisible();
    await expect(header.locator("[data-status]")).toHaveAttribute("data-status", "inGame");
    await expect(header.getByTestId("favourites")).toHaveCount(0);

    await expect(categories(page)).toHaveCount(build.modCategories.length);
    const cost = page.getByTestId("cost-line");
    await expect(cost).toHaveAttribute("data-total", /^[1-9]\d*$/);
    const optional = build.modCategories.filter((c) => c.optional).flatMap((c) => c.mods).length;
    const all = build.modCategories.flatMap((c) => c.mods).length;
    expect(Number(await cost.getAttribute("data-items"))).toBeLessThanOrEqual(all - optional);
    await expect(page.getByTestId("ability-order").getByRole("listitem").first()).toBeVisible();
    expect(await page.getByTestId("ability-order").getByRole("listitem").count()).toBeGreaterThan(4);
});

test("a public build shows its favourites and no local status", async ({ page }) => {
    await open(page, `/builds/view?source=public&id=${PUBLIC_ID}`);
    const header = page.getByTestId("build-header");
    await expect(header.getByRole("heading", { level: 1, name: "Bullet Dance Crit", exact: true })).toBeVisible();
    await expect(header.getByTestId("favourites")).toHaveAttribute("data-count", "9812");
    await expect(header.locator("[data-status]")).toHaveCount(0);
    await expect(categories(page).first()).toBeVisible();
});

test("1080p and 4K carry the unmeasured note; 1440p does not", async ({ page }) => {
    await open(page, `/builds/view?source=local&id=${LOCAL_ID}`);
    await expect(page.getByTestId("unmeasured")).toHaveCount(0);
    for (const name of ["1080p", "4K"]) {
        await page.getByRole("button", { name, exact: true }).click();
        await expect(page.getByTestId("unmeasured")).toBeVisible();
    }
    await page.getByRole("button", { name: "1440p", exact: true }).click();
    await expect(page.getByTestId("unmeasured")).toHaveCount(0);
});

/**
 * Gives every category a stored size, as builds the game wrote carry. The demo leaves some heights out, and
 * those get Deadlock+'s own Fit rule, which is not the game's layout under test here.
 */
async function storeEverySize(page: Page): Promise<void> {
    await page.addInitScript((height) => {
        type Invoke = (command: string, args: object) => unknown;
        const host = window as unknown as Record<string, { handle?: { invoke: Invoke } } | undefined>;
        let demo = host.__DEADLOCK_PLUS_DEMO__;
        Object.defineProperty(window, "__DEADLOCK_PLUS_DEMO__", {
            configurable: true,
            get: () => demo,
            set(next: typeof demo) {
                demo = next;
                const handle = next?.handle;
                if (!handle) return;
                const invoke = handle.invoke;
                handle.invoke = (command, args) => {
                    const result = invoke(command, args);
                    if (command !== "builds_local") return result;
                    return Promise.resolve(result).then((listed) => {
                        const local = listed as LocalBuilds;
                        for (const { build } of local.builds) {
                            for (const category of build.modCategories) category.height ??= height;
                        }
                        return local;
                    });
                };
            },
        });
    }, 402.75);
}

test("at actual size and 1440p the category boxes are the layout's own px", async ({ page }) => {
    await storeEverySize(page);
    await open(page, `/builds/view?source=local&id=${LOCAL_ID}`);
    const build = (await localBuilds(page)).builds.find((b) => b.build.heroBuildId === LOCAL_ID)!.build;
    await page.getByTestId("actual-size").click();
    await expect(page.getByTestId("actual-size")).toHaveAttribute("aria-pressed", "true");
    await expect(shop(page)).toHaveAttribute("data-mode", "native");
    await expect(shop(page)).toHaveAttribute("data-resolution", "1440");

    const expected = layoutBuild(
        build.modCategories.map((c) => ({ width: c.width!, height: c.height!, items: c.mods.length })),
        QHD,
    );
    const origin = (await shop(page).locator(".content").boundingBox())!;
    expect(Math.abs(origin.width - expected.contentWidth)).toBeLessThan(1 / 32);

    await expect(categories(page)).toHaveCount(expected.categories.length);
    for (const [i, { box }] of expected.categories.entries()) {
        const rect = (await categories(page).nth(i).boundingBox())!;
        const drawn = { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height };
        // The browser lays out in 1/64 px steps.
        for (const key of ["x", "y", "width", "height"] as const) {
            expect(Math.abs(drawn[key] - box[key]), `category ${i} ${key}: ${drawn[key]} vs ${box[key]}`).toBeLessThan(
                1 / 32,
            );
        }
    }
});

test("Copy as new writes a local copy of a public build and links to it", async ({ page }) => {
    await open(page, `/builds/view?source=public&id=${PUBLIC_ID}`);
    const before = (await localBuilds(page)).builds.length;
    await page.getByTestId("copy-as-new").click();

    const link = page.getByTestId("build-header").getByRole("status").getByRole("link");
    await expect(link).toHaveAttribute("href", /^\/builds\/view\?source=local&id=\d+$/);
    const after = await localBuilds(page);
    expect(after.builds).toHaveLength(before + 1);
    const id = Number(new URL((await link.getAttribute("href"))!, "http://x").searchParams.get("id"));
    const copy = after.builds.find((b) => b.build.heroBuildId === id)!;
    expect(copy.section).toBe("Unpublished");
    expect(copy.build.originBuildId).toBe(PUBLIC_ID);
    expect(copy.build.name).toBe("Bullet Dance Crit (copy)");

    await link.click();
    await expect(page.getByTestId("build-header").locator("[data-status]")).toHaveAttribute("data-status", "inGame");
});

test("favouriting a published build from its view shows it as a favourite in My builds", async ({ page }) => {
    await open(page, `/builds/view?source=public&id=${OWN_PUBLISHED_ID}`);
    const favourite = page.getByTestId("favourite");
    await expect(favourite).toHaveAttribute("aria-pressed", "false");
    await favourite.click();
    await expect(favourite).toHaveAttribute("aria-pressed", "true");
    const favourites = (await localBuilds(page)).builds.filter((b) => b.section === "Favorites");
    expect(favourites.map((b) => b.build.heroBuildId)).toContain(OWN_PUBLISHED_ID);

    const main = page.getByRole("main");
    await main.getByRole("link", { name: "Builds", exact: true }).click();
    await main.getByRole("tab", { name: "Mine", exact: true }).click();
    const row = main
        .getByRole("tabpanel", { name: "Mine" })
        .getByRole("listitem")
        .filter({ has: page.getByRole("link", { name: "Afterburn all day", exact: true }) });
    await expect(row.getByTestId("favourited")).toBeVisible();
});

/** The demo's build 3 lays out the same at 1080p and 1440p; this width gives 3 columns at 1080p, 4 at 1440p. */
async function widenFirstCategory(page: Page): Promise<void> {
    await page.addInitScript((width) => {
        type Invoke = (command: string, args: object) => unknown;
        const host = window as unknown as Record<string, { handle?: { invoke: Invoke } } | undefined>;
        let demo = host.__DEADLOCK_PLUS_DEMO__;
        Object.defineProperty(window, "__DEADLOCK_PLUS_DEMO__", {
            configurable: true,
            get: () => demo,
            set(next: typeof demo) {
                demo = next;
                const handle = next?.handle;
                if (!handle) return;
                const invoke = handle.invoke;
                handle.invoke = (command, args) => {
                    const result = invoke(command, args);
                    if (command !== "builds_local") return result;
                    return Promise.resolve(result).then((listed) => {
                        const local = listed as LocalBuilds;
                        for (const { build } of local.builds) {
                            const first = build.modCategories[0];
                            if (first && first.mods.length >= 4) first.width = width;
                        }
                        return local;
                    });
                };
            },
        });
    }, 339);
}

const flags = (page: Page) => categories(page).locator("header [data-screen-difference]");

test("on a 1440p screen the shop starts at 1440p and flags nothing", async ({ page }) => {
    await open(page, `/builds/view?source=local&id=${LOCAL_ID}`);
    await expect(shop(page)).toHaveAttribute("data-resolution", "1440");
    await expect(page.getByRole("button", { name: "1440p", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(categories(page).first()).toBeVisible();
    await expect(flags(page)).toHaveCount(0);
});

test.describe("on a 1080p screen", () => {
    test.use({ screen: FHD });

    test("the shop starts at 1080p", async ({ page }) => {
        await open(page, `/builds/view?source=local&id=${LOCAL_ID}`);
        await expect(shop(page)).toHaveAttribute("data-resolution", "1080");
        await expect(page.getByRole("button", { name: "1080p", exact: true })).toHaveAttribute("aria-pressed", "true");
    });

    test("categories that lay out differently than at 1440p are flagged with their columns", async ({ page }) => {
        await widenFirstCategory(page);
        await open(page, `/builds/view?source=local&id=${LOCAL_ID}`);
        const build: BuildView = (await localBuilds(page)).builds.find((b) => b.build.heroBuildId === LOCAL_ID)!.build;
        const expected = screenDifferences(build.modCategories, FHD);
        expect(expected.map((d) => d.index)).toContain(0);

        await expect(flags(page)).toHaveCount(expected.length);
        for (const d of expected) {
            const flag = categories(page).nth(d.index).locator("header [data-screen-difference]");
            await expect(flag).toHaveAttribute("data-columns", String(d.columns));
            await expect(flag).toHaveAttribute("data-reference-columns", String(d.referenceColumns));
        }
        await expect(page.getByTestId("screen-differences")).toHaveCount(0);
        await flags(page).first().hover();
        await expect(page.locator("[data-tooltip-content]")).toContainText("instead of");
    });
});
