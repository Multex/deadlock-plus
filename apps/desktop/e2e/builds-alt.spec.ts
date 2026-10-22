import type { Locator, Page } from "@playwright/test";
import type { AbilityProperty } from "@deadlock-plus/ipc-types/AbilityProperty";
import type { AbilityTooltip } from "@deadlock-plus/ipc-types/AbilityTooltip";
import { open } from "./support/flows";
import { expect, test } from "./support/test";

test.use({ viewport: { width: 1600, height: 1000 } });

const INFERNUS_BUILD = "/builds/view?source=local&id=3";
const ABRAMS_BUILD = "/builds/view?source=local&id=7";

interface AltRow {
    label: string;
    sub: string | null;
    before: number;
    after: number;
    icon: string | null;
}

const card = (page: Page, name: string) =>
    page.getByTestId("shop").locator(".item-card").filter({ hasText: name }).first();
const itemTip = (page: Page) => page.locator("[data-item-tooltip]");
const altPanel = (tip: Locator) => tip.locator(".panel");

async function hoverItem(page: Page, name: string): Promise<Locator> {
    await card(page, name).hover();
    const tip = itemTip(page);
    await expect(tip).toHaveCount(1);
    await expect(tip).toContainText(name);
    return tip;
}

/** The game's before -> after rows, without Deadlock+'s phase lines under them. */
function altRows(tip: Locator): Promise<AltRow[]> {
    return altPanel(tip)
        .locator(".body > .group .row")
        .evaluateAll((rows) => {
            const number = (el: Element | null) => Number(el!.textContent!.replace(/[^\d.-]/g, ""));
            return rows.map((row) => ({
                label: row.querySelector(".name")!.textContent!.trim(),
                sub: row.querySelector(".sub")?.textContent?.trim() ?? null,
                before: number(row.querySelector(".current")),
                after: number(row.querySelector(".new")),
                icon: row.closest(".group")!.querySelector("img")?.getAttribute("src") ?? null,
            }));
        });
}

async function rowsWhenShown(tip: Locator, labels: string[]): Promise<AltRow[]> {
    await expect.poll(async () => (await altRows(tip)).map((r) => r.label)).toEqual(labels);
    return altRows(tip);
}

function abilityTooltips(page: Page): Promise<AbilityTooltip[]> {
    return page.evaluate(async () => {
        const host = window as unknown as {
            __DEADLOCK_PLUS_DEMO__: { handle: { invoke(command: string, args: object): unknown } };
        };
        const { handle } = host.__DEADLOCK_PLUS_DEMO__;
        return (await handle.invoke("game_ability_tooltips", { locale: "english" })) as AbilityTooltip[];
    });
}

/** The ability's untrained, unscaled cell with this label. */
function rawCell(ability: AbilityTooltip, label: string): AbilityProperty {
    const cells = ability.sections.flatMap((s) => [...s.groups.flatMap((g) => g.cells), ...s.properties]);
    return cells.find((c) => c.label === label)!;
}

const abilitySlot = (page: Page, slot: number) =>
    page.getByTestId("ability-order").locator(`[data-ability-slot="${slot}"]`).getByRole("img").first();

test("holding ALT on an item swaps See Details for the hero's before and after, and letting go swaps back", async ({
    page,
}) => {
    await open(page, INFERNUS_BUILD);
    const tip = await hoverItem(page, "Extra Spirit");
    await expect(tip.getByText("See Details", { exact: true })).toBeVisible();
    await expect(tip.locator("kbd")).toHaveText("ALT");
    await expect(altPanel(tip)).toHaveCount(0);

    await page.keyboard.down("Alt");
    const rows = await rowsWhenShown(tip, [
        "Spirit Power",
        "Damage",
        "Damage Per Second",
        "Damage Per Second",
        "Damage",
    ]);
    for (const row of rows) expect(row.after, row.label).toBeGreaterThan(row.before);
    await expect(tip.getByText("See Details", { exact: true })).toHaveCount(0);
    const phases = altPanel(tip).locator(".phases");
    await expect(phases).toContainText("Deadlock+ stats");
    for (const phase of ["Early game", "Mid game", "Late game"]) await expect(phases).toContainText(phase);

    await page.keyboard.up("Alt");
    await expect(altPanel(tip)).toHaveCount(0);
    await expect(tip.getByText("See Details", { exact: true })).toBeVisible();
});

test("a spirit item moves each ability's row by that ability's spirit scaling", async ({ page }) => {
    await open(page, INFERNUS_BUILD);
    const napalmIcon = await abilitySlot(page, 1).locator("img").getAttribute("src");
    const napalm = (await abilityTooltips(page)).find((a) => a.name === "Napalm")!;
    const damage = rawCell(napalm, "Damage");
    expect(damage.scale?.stat).toBe("ETechPower");
    const factor = damage.scale!.factor!;

    await hoverItem(page, "Extra Spirit");
    await page.keyboard.down("Alt");
    const rows = await rowsWhenShown(itemTip(page), [
        "Spirit Power",
        "Damage",
        "Damage Per Second",
        "Damage Per Second",
        "Damage",
    ]);
    const spirit = rows[0]!;
    const row = rows.find((r) => r.icon === napalmIcon && r.label === "Damage")!;
    expect(row, "Napalm's Damage row").toBeDefined();
    // Both sides of a row are rounded for display, so allow one either way.
    expect(Math.abs(row.before - (damage.value! + factor * spirit.before))).toBeLessThanOrEqual(1);
    expect(Math.abs(row.after - (damage.value! + factor * spirit.after))).toBeLessThanOrEqual(1);
});

test("an ALT already held when the pointer arrives opens straight to the details", async ({ page }) => {
    await open(page, INFERNUS_BUILD);
    await page.keyboard.down("Alt");
    const tip = await hoverItem(page, "Extra Health");
    const [health] = await rowsWhenShown(tip, ["Max Health"]);
    expect(health!.after).toBeGreaterThan(health!.before);
    await expect(tip.getByText("See Details", { exact: true })).toHaveCount(0);
});

test("a weapon item's row carries the item's condition, and melee gets no rows", async ({ page }) => {
    await open(page, ABRAMS_BUILD);
    const tip = await hoverItem(page, "Close Quarters");
    for (const text of ["Passive", "Weapon Damage", "Close Range"]) await expect(tip).toContainText(text);

    await page.keyboard.down("Alt");
    const [bullet] = await rowsWhenShown(tip, ["Bullet Damage"]);
    expect(bullet!.sub).toBe("within Range");
    expect(bullet!.after).toBeGreaterThan(bullet!.before);
    await page.keyboard.up("Alt");
    await page.mouse.move(0, 0);
    await expect(itemTip(page)).toHaveCount(0);

    const lifesteal = await hoverItem(page, "Melee Lifesteal");
    await page.keyboard.down("Alt");
    const [health] = await rowsWhenShown(lifesteal, ["Max Health"]);
    expect(health!.after).toBeGreaterThan(health!.before);
    await expect(altPanel(lifesteal)).not.toContainText("Melee");
});

test("the same item's ALT rows follow each build's hero", async ({ page }) => {
    async function maxHealth(route: string): Promise<AltRow> {
        await open(page, route);
        await page.keyboard.down("Alt");
        const [row] = await rowsWhenShown(await hoverItem(page, "Extra Health"), ["Max Health"]);
        await page.keyboard.up("Alt");
        return row!;
    }
    const infernus = await maxHealth(INFERNUS_BUILD);
    const abrams = await maxHealth(ABRAMS_BUILD);
    expect(abrams.before).not.toBe(infernus.before);
    expect(abrams.after).not.toBe(infernus.after);
});

test.describe("ability tooltips on a build", () => {
    const abilityTip = (page: Page) => page.locator("[data-tooltip-content]");

    test("show the hero's spirit-scaled values and the step each ability maxes out", async ({ page }) => {
        await open(page, INFERNUS_BUILD);
        const napalm = (await abilityTooltips(page)).find((a) => a.name === "Napalm")!;
        const damage = rawCell(napalm, "Damage");

        await abilitySlot(page, 1).hover();
        const tip = abilityTip(page);
        await expect(tip).toContainText("Napalm");
        for (const text of ["On Hit:", "Move Speed", "Napalm Effects:", "Lifesteal"]) {
            await expect(tip).toContainText(text);
        }
        // The build's order trains Napalm a third time at step 11: "u3 u1 3 u2 1 u4 3 1 4 3 1".
        await expect(tip).toContainText("Reaches Tier 3 at step 11.");
        const shown = tip.locator(".panel").filter({ has: page.locator(".box > .name", { hasText: /^Damage$/ }) });
        await expect(shown).toHaveCount(1);
        await expect(shown.locator(".scaling")).toContainText(String(damage.scale!.factor));
        // By step 11 the build's items have given the hero spirit power, so the value is past its base.
        const value = Number((await shown.locator(".box .value").textContent())!.replace(/[^\d.-]/g, ""));
        expect(value).toBeGreaterThan(damage.value!);

        await page.mouse.move(0, 0);
        await expect(tip).toBeHidden();
        await abilitySlot(page, 4).hover();
        await expect(tip).toContainText("Concussive Combustion");
        for (const text of ["Explosion Delay", "Stun"]) await expect(tip).toContainText(text);
        // Steps 9, 12 and 13 train the ultimate.
        await expect(tip).toContainText("Reaches Tier 3 at step 13.");
    });
});
