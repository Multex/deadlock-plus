import type { Page } from "@playwright/test";
import { layoutBuild } from "@deadlock-plus/build-layout";
import type { LocalBuilds } from "@deadlock-plus/ipc-types/LocalBuilds";
import { open } from "./support/flows";
import { expect, test } from "./support/test";

const QHD = { width: 2560, height: 1440 };
const LOCAL_ID = 3;
const PUBLIC_ID = 381204;

const shop = (page: Page) => page.getByTestId("shop");
const categories = (page: Page) => shop(page).locator("section.category");

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
