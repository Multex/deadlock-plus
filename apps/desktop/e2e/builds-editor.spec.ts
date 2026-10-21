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

test("an item added twice from the shop rail, a resize and its undo, then Save to game", async ({ page }) => {
    await openEditor(page);
    const before = await chips(page).count();
    const pipsBefore = await pips(page).count();
    const inFile = await itemsInFile(page);

    await page.locator('[data-rail-tab="weapon"]').click();
    // A tile that is not in the build yet carries no count.
    const tile = main(page).locator("button[data-tile]:not(:has(.count))").first();
    const name = await tile.locator(".name").textContent();
    const picked = main(page).locator("button[data-tile]").filter({ hasText: name! }).first();
    await picked.click();
    await expect(chips(page)).toHaveCount(before + 1);
    await expect(picked.locator(".count")).toBeVisible();
    await picked.click();
    await expect(chips(page)).toHaveCount(before + 2);
    await expect(pips(page)).toHaveCount(pipsBefore + 2);
    await expect(status(page)).not.toHaveAttribute("data-state", "saved");
    await page.keyboard.press("Escape");

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

test("widening the last category of a row stops at the row edge until it is pulled through", async ({ page }) => {
    await openEditor(page);
    const categories = canvas(page).locator("[data-category]");
    await canvas(page)
        .locator('[data-category="2"] header')
        .click({ position: { x: 30, y: 8 } });
    await page.getByTestId("category-remove").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
    await expect(categories).toHaveCount(2);

    const second = canvas(page).locator('[data-category="1"]');
    const top = (await second.boundingBox())!.y;
    await second.hover();
    const handle = (await second.locator(".handle.right").boundingBox())!;
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 4, y);
    const line = (await second.locator(".row-edge").boundingBox())!;
    const edge = line.x + line.width / 2;
    // The edge tag stays clear of the header, where the category menu sits.
    const edgeTag = (await second.locator(".row-edge span").boundingBox())!;
    expect(edgeTag.y + edgeTag.height).toBeLessThanOrEqual(top);

    for (let step = 1; step <= 8; step++) await page.mouse.move(x + ((edge + 40 - x) * step) / 8, y);
    const held = (await second.boundingBox())!;
    expect(held.y).toBe(top);
    expect(held.x + held.width).toBeLessThanOrEqual(edge + 1);
    await expect(page.locator(".resize-label")).toHaveAttribute("data-row-edge", "pulling");

    for (let step = 1; step <= 8; step++) await page.mouse.move(edge + 40 + (80 * step) / 8, y);
    await expect(page.locator(".resize-label")).toHaveAttribute("data-row-edge", "through");
    await page.mouse.up();
    expect((await second.boundingBox())!.y).toBeGreaterThan(top);
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

test("the inspector edits the build, the selected category and the selected item", async ({ page }) => {
    await openEditor(page);
    const inspector = page.getByTestId("inspector");
    await expect(inspector.getByTestId("inspector-build")).toBeVisible();
    await expect(page.getByTestId("category-name")).toHaveCount(0);

    const slot = inspector.locator('[data-slot="0"]');
    await slot.click();
    const tag = page.getByRole("menuitem").nth(0);
    const tagName = (await tag.textContent())!.trim();
    await tag.click();
    await expect(slot).toContainText(tagName);

    await chips(page).first().click();
    await expect(page.getByTestId("inspector-item-name")).toBeVisible();
    await expect(page.getByTestId("category-name")).toBeVisible();
    await page.locator("#inspector-item-note").fill("Buy first");
    await expect(page.locator("#inspector-item-note")).toHaveValue("Buy first");

    const first = canvas(page).locator('[data-category="0"]');
    const sizeTag = first.locator(".size-tag");
    const columns = page.getByTestId("category-columns");
    const columnsBefore = Number(await columns.textContent());
    const tagBefore = (await sizeTag.textContent())!.trim();
    await page.getByTestId("category-columns-more").click();
    await expect(columns).toHaveText(String(columnsBefore + 1));
    await expect(sizeTag).not.toHaveText(tagBefore);

    await page.getByTestId("category-optional").click();
    await expect(page.getByTestId("category-optional")).toHaveAttribute("data-state", "checked");

    // Compact all fits the widened category back, as one undo step.
    const widened = (await sizeTag.textContent())!.trim();
    await page.getByTestId("toolbar-compact-all").click();
    await expect(sizeTag).not.toHaveText(widened);
    const compacted = (await sizeTag.textContent())!.trim();
    await page.getByTestId("editor-undo").click();
    await expect(sizeTag).toHaveText(widened);
    await expect(page.getByTestId("category-optional")).toHaveAttribute("data-state", "checked");
    await page.getByTestId("editor-redo").click();
    await expect(sizeTag).toHaveText(compacted);
});

test("the toolbar adds a category and previews other resolutions", async ({ page }) => {
    await openEditor(page);
    const categories = canvas(page).locator("[data-category]");
    const count = await categories.count();
    await page.getByTestId("toolbar-add-category").click();
    await expect(categories).toHaveCount(count + 1);
    await expect(page.getByTestId("category-name")).toBeVisible();

    const resolution = page.getByTestId("toolbar-resolution");
    await expect(resolution.getByRole("button", { name: "1440p" })).toHaveAttribute("aria-pressed", "true");
    await resolution.getByRole("button", { name: "4K" }).click();
    await expect(resolution.getByRole("button", { name: "4K" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("ability-bar")).toBeVisible();
});

test("a width that loses a column at another resolution shows a layout issue that Fix all clears", async ({ page }) => {
    await openEditor(page);
    const issues = page.getByTestId("layout-issues");
    // The demo stores Lane and Late game without a height.
    await expect(issues).toHaveAttribute("data-count", "2");

    // Unsnapped, 1 px narrower stores 257 units: 3 columns at 1440p but 2 at 1080p and 4K.
    await page.getByTestId("toolbar-snap").click();
    const first = canvas(page).locator('[data-category="0"]');
    await first.hover();
    const handle = (await first.locator(".handle.right").boundingBox())!;
    const x = Math.round(handle.x + handle.width / 2);
    const y = Math.round(handle.y + handle.height / 2);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 1, y);
    await page.mouse.up();
    await expect(issues).toHaveAttribute("data-count", "3");
    await expect(first.getByTestId("category-layout-issue")).toBeVisible();

    await issues.click();
    await page.getByTestId("layout-fix-all").click();
    await expect(issues).toBeHidden();
    await expect(canvas(page).getByTestId("category-layout-issue")).toHaveCount(0);

    await page.getByTestId("editor-undo").click();
    await expect(issues).toHaveAttribute("data-count", "3");
});

test("editing an own published build says it is published in-game", async ({ page }) => {
    await open(page, "/builds/edit?source=public&id=402117");
    await expect(page.getByTestId("publish-note")).toBeVisible();
});
