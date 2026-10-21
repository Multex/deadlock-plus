import type { Locator, Page } from "@playwright/test";
import type { LocalBuilds } from "@deadlock-plus/ipc-types/LocalBuilds";
import { open } from "./support/flows";
import { expect, test } from "./support/test";

const BUILD = "Abrams practice";
const BUILD_ID = 7;

test.use({ viewport: { width: 1600, height: 1000 } });

const main = (page: Page) => page.getByRole("main");
const canvas = (page: Page) => main(page).locator('[role="application"]');
const chips = (page: Page) => canvas(page).locator("[data-item]");
const pips = (page: Page) => canvas(page).locator("[data-item]:has(.copies)");
const status = (page: Page) => page.getByTestId("editor-status");

function localBuilds(page: Page): Promise<LocalBuilds> {
    return page.evaluate(async () => {
        const host = window as unknown as {
            __DEADLOCK_PLUS_DEMO__: { handle: { invoke(command: string, args: object): unknown } };
        };
        return (await host.__DEADLOCK_PLUS_DEMO__.handle.invoke("builds_local", {})) as LocalBuilds;
    });
}

async function itemsInFile(page: Page): Promise<number> {
    const listed = await localBuilds(page);
    const build = listed.builds.find((b) => b.section === "Unpublished" && b.build.heroBuildId === BUILD_ID)!.build;
    return build.modCategories.reduce((n, c) => n + c.mods.length, 0);
}

async function openEditor(page: Page) {
    await open(page, "/builds");
    await main(page).getByRole("tab", { name: "Mine", exact: true }).click();
    const row = main(page)
        .getByRole("tabpanel", { name: "Mine" })
        .getByRole("listitem")
        .filter({ has: page.getByRole("link", { name: BUILD, exact: true }) });
    await row.getByRole("button", { name: `More actions for ${BUILD}` }).click();
    await page.getByTestId("edit-build").click();
    await expect(page).toHaveURL(new RegExp(`/builds/edit\\?source=local&id=${BUILD_ID}$`));
    await expect(page.getByTestId("build-name")).toHaveValue(BUILD);
    await expect(chips(page).first()).toBeVisible();
}

async function dragBy(page: Page, handle: Locator, dx: number) {
    const box = (await handle.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let step = 1; step <= 8; step++) await page.mouse.move(x + (dx * step) / 8, y);
    await page.mouse.up();
}

test("an item added twice from the picker, a resize and its undo, then Save to game", async ({ page }) => {
    await openEditor(page);
    const before = await chips(page).count();
    const pipsBefore = await pips(page).count();
    const inFile = await itemsInFile(page);

    // A card that is not in the build yet carries no count.
    const card = main(page).locator("button[data-card]:not(:has(.count))").first();
    const name = await card.locator(".name").textContent();
    const picked = main(page).locator("button[data-card]").filter({ hasText: name! }).first();
    await picked.click();
    await expect(chips(page)).toHaveCount(before + 1);
    await expect(picked.locator(".count")).toBeVisible();
    await picked.click();
    await expect(chips(page)).toHaveCount(before + 2);
    await expect(pips(page)).toHaveCount(pipsBefore + 2);
    await expect(status(page)).not.toHaveAttribute("data-state", "saved");

    const first = canvas(page).locator('[data-category="0"]');
    const tag = first.locator(".size-tag");
    const tagBefore = (await tag.textContent())!.trim();
    const widthBefore = (await first.boundingBox())!.width;
    await dragBy(page, first.locator(".handle.right"), 160);
    expect((await first.boundingBox())!.width).toBeGreaterThan(widthBefore);
    await expect(tag).not.toHaveText(tagBefore);

    await page.getByTestId("editor-undo").click();
    await expect(tag).toHaveText(tagBefore);
    expect(Math.abs((await first.boundingBox())!.width - widthBefore)).toBeLessThan(1);
    await expect(chips(page)).toHaveCount(before + 2);

    await page.getByTestId("save-to-game").click();
    await expect(status(page)).toHaveAttribute("data-state", "saved");
    expect(await itemsInFile(page)).toBe(inFile + 2);
});

test("New build opens an unnamed build for the hero, and Save to game asks for a name", async ({ page }) => {
    await open(page, "/builds");
    await main(page).getByRole("tab", { name: "Mine", exact: true }).click();
    await main(page).getByTestId("new-build").first().click();
    await expect(page).toHaveURL(/\/builds\/edit\?new=\d+$/);
    const name = page.getByTestId("build-name");
    await expect(name).toHaveValue("");
    await expect(canvas(page).locator("[data-category]")).toHaveCount(1);
    await expect(status(page)).toHaveAttribute("data-state", "unsaved");

    await page.getByTestId("save-to-game").click();
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("aria-invalid", "true");
});

test("editing an own published build says it is published in-game", async ({ page }) => {
    await open(page, "/builds/edit?source=public&id=402117");
    await expect(page.getByTestId("publish-note")).toBeVisible();
});
