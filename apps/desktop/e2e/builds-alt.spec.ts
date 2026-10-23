import type { Locator, Page } from "@playwright/test";
import type { AbilityProperty } from "@deadlock-plus/ipc-types/AbilityProperty";
import type { AbilityTooltip } from "@deadlock-plus/ipc-types/AbilityTooltip";
import type { HeroStatsData } from "@deadlock-plus/ipc-types/HeroStatsData";
import { open } from "./support/flows";
import { expect, test } from "./support/test";

test.use({ viewport: { width: 1600, height: 1000 } });

const INFERNUS_BUILD = "/builds/view?source=local&id=3";
const ABRAMS_BUILD = "/builds/view?source=local&id=7";
const KELVIN_BUILD = "/builds/view?source=public&id=372846";
const SPIRIT_HAZE_BUILD = "/builds/view?source=public&id=377455";
const INFERNUS = 1;

/** What each of Infernus's four abilities shows for a spirit item, in slot order. */
const INFERNUS_SPIRIT_ROWS = ["Damage", "Damage Per Second", "Damage Per Second", "Damage"];

interface AltRow {
    label: string;
    sub: string | null;
    before: number;
    after: number;
    postfix: string | null;
}

interface AltGroup {
    kind: "ability" | "item" | "stat" | null;
    /** An owned item's art is drawn as an image; ability and stat icons are glyphs masked from theirs. */
    drawn: "image" | "glyph" | null;
    icon: string | null;
    rows: AltRow[];
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

async function leaveItem(page: Page): Promise<void> {
    await page.keyboard.up("Alt");
    await page.mouse.move(0, 0);
    await expect(itemTip(page)).toHaveCount(0);
}

/** The game's before -> after groups, without Deadlock+'s phase lines under them. */
function altGroups(tip: Locator): Promise<AltGroup[]> {
    return altPanel(tip)
        .locator(".body > .group")
        .evaluateAll((groups) => {
            const number = (el: Element | null) => Number(el!.textContent!.replace(/[^\d.-]/g, ""));
            return groups.map((group) => {
                const icon = group.querySelector(".icon")!;
                const img = icon.querySelector("img");
                const glyph = icon.querySelector<HTMLElement>(".glyph")?.style.getPropertyValue("--glyph") ?? "";
                return {
                    kind: (["ability", "item", "stat"] as const).find((k) => icon.classList.contains(k)) ?? null,
                    drawn: img ? "image" : glyph ? "glyph" : null,
                    icon: img?.getAttribute("src") ?? /url\("?([^")]+)"?\)/.exec(glyph)?.[1] ?? null,
                    rows: [...group.querySelectorAll(".row")].map((row) => ({
                        label: row.querySelector(".name")!.textContent!.trim(),
                        sub: row.querySelector(".sub")?.textContent?.trim() ?? null,
                        before: number(row.querySelector(".current")),
                        after: number(row.querySelector(".new")),
                        postfix: row.querySelector(".postfix")?.textContent?.trim() ?? null,
                    })),
                };
            });
        });
}

/** The groups once their rows read `labels`, group after group. */
async function groupsWhenShown(tip: Locator, labels: string[]): Promise<AltGroup[]> {
    const shown = async () => (await altGroups(tip)).flatMap((g) => g.rows.map((r) => r.label));
    await expect.poll(shown).toEqual(labels);
    return altGroups(tip);
}

function invoke<T>(page: Page, command: string, args: object): Promise<T> {
    return page.evaluate(
        async ([command, args]) => {
            const host = window as unknown as {
                __DEADLOCK_PLUS_DEMO__: { handle: { invoke(command: string, args: object): unknown } };
            };
            return (await host.__DEADLOCK_PLUS_DEMO__.handle.invoke(command, args)) as T;
        },
        [command, args] as const,
    );
}

const abilityTooltips = (page: Page) => invoke<AbilityTooltip[]>(page, "game_ability_tooltips", { locale: "english" });

/** The ability's untrained, unscaled cell with this label, and with this scaling stat when one is given. */
function rawCell(ability: AbilityTooltip, label: string, stat?: string): AbilityProperty {
    const cells = ability.sections.flatMap((s) => [...s.groups.flatMap((g) => g.cells), ...s.properties]);
    return cells.find((c) => c.label === label && (stat === undefined || c.scale?.stat === stat))!;
}

const abilitySlot = (page: Page, slot: number) =>
    page.getByTestId("ability-order").locator(`[data-ability-slot="${slot}"]`).getByRole("img").first();

/** Each ability slot's name and icon, in slot order. */
async function heroAbilities(page: Page): Promise<{ name: string; icon: string }[]> {
    const out = [];
    for (const slot of [1, 2, 3, 4]) {
        const trigger = abilitySlot(page, slot);
        out.push({
            name: (await trigger.getAttribute("aria-label"))!,
            icon: (await trigger.locator("img").getAttribute("src"))!,
        });
    }
    return out;
}

test("holding ALT on an item swaps See Details for the hero's before and after, and letting go swaps back", async ({
    page,
}) => {
    await open(page, INFERNUS_BUILD);
    const tip = await hoverItem(page, "Extra Spirit");
    await expect(tip.getByText("See Details", { exact: true })).toBeVisible();
    await expect(tip.locator("kbd")).toHaveText("ALT");
    await expect(altPanel(tip)).toHaveCount(0);

    await page.keyboard.down("Alt");
    const groups = await groupsWhenShown(tip, INFERNUS_SPIRIT_ROWS);
    for (const row of groups.flatMap((g) => g.rows)) expect(row.after, row.label).toBeGreaterThan(row.before);
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
    const kit = await heroAbilities(page);
    const tooltips = await abilityTooltips(page);

    const hero = (await invoke<HeroStatsData | null>(page, "game_hero_stats", { heroId: INFERNUS }))!;
    const invested = (souls: number) =>
        Math.max(0, ...hero.investment.spirit.filter((t) => t.souls <= souls).map((t) => t.bonus));

    const tip = await hoverItem(page, "Extra Spirit");
    const bonus = Number(/\+(\d+)\s*Spirit Power/.exec(await tip.innerText())?.[1]);
    const cost = Number((await tip.locator(".cost").textContent())!.replace(/\D/g, ""));
    expect(bonus).toBeGreaterThan(0);
    // The build's first purchase: the hero gains the item's spirit power and the slot investment its cost reaches.
    const expected = bonus + invested(cost) - invested(0);
    await page.keyboard.down("Alt");
    const groups = await groupsWhenShown(tip, INFERNUS_SPIRIT_ROWS);
    expect(groups.map((g) => g.icon)).toEqual(kit.map((a) => a.icon));

    // Each row moves by its ability's factor times that gain. A trained tier moves only the base, which cancels out.
    // Both ends of a row are whole numbers.
    const gain = [-Infinity, Infinity];
    groups.forEach((group, i) => {
        const row = group.rows[0]!;
        const ability = tooltips.find((a) => a.name === kit[i]!.name)!;
        const cell = rawCell(ability, row.label, "ETechPower");
        expect(cell, `${ability.name}'s ${row.label}`).toBeDefined();
        const factor = cell.scale!.factor!;
        const moved = row.after - row.before;
        gain[0] = Math.max(gain[0]!, (moved - 1) / factor);
        gain[1] = Math.min(gain[1]!, (moved + 1) / factor);
    });
    expect(expected).toBeGreaterThanOrEqual(gain[0]!);
    expect(expected).toBeLessThanOrEqual(gain[1]!);
});

test("an ALT already held when the pointer arrives opens straight to the details", async ({ page }) => {
    await open(page, INFERNUS_BUILD);
    await page.keyboard.down("Alt");
    const tip = await hoverItem(page, "Improved Spirit");
    const groups = await groupsWhenShown(tip, INFERNUS_SPIRIT_ROWS);
    for (const row of groups.flatMap((g) => g.rows)) expect(row.after, row.label).toBeGreaterThan(row.before);
    await expect(tip.getByText("See Details", { exact: true })).toHaveCount(0);
});

test("a weapon item's row carries the item's condition, and melee gets no rows", async ({ page }) => {
    await open(page, ABRAMS_BUILD);
    const tip = await hoverItem(page, "Close Quarters");
    for (const text of ["Passive", "Weapon Damage", "Close Range"]) await expect(tip).toContainText(text);

    await page.keyboard.down("Alt");
    const [weapon] = await groupsWhenShown(tip, ["Bullet Damage"]);
    expect(weapon!.kind).toBe("ability");
    expect(weapon!.icon).toMatch(/weapon_damage/);
    const [bullet] = weapon!.rows;
    expect(bullet!.sub).toBe("within Range");
    expect(bullet!.after).toBeGreaterThan(bullet!.before);
    await expect(altPanel(tip)).not.toContainText("Melee");
    await leaveItem(page);

    // Melee Lifesteal's melee damage bonus is always on, but how much of it reaches each melee hit is in no game file.
    const lifesteal = await hoverItem(page, "Melee Lifesteal");
    await expect(lifesteal).toContainText("Melee Damage");
    await page.keyboard.down("Alt");
    await expect(altPanel(lifesteal).locator(".phases")).toBeVisible();
    expect(await altGroups(lifesteal)).toEqual([]);
    await expect(altPanel(lifesteal)).not.toContainText("Melee");
});

test("the same item's ALT rows follow each build's hero", async ({ page }) => {
    async function spiritGroups(route: string) {
        await open(page, route);
        const kit = await heroAbilities(page);
        await page.keyboard.down("Alt");
        const tip = await hoverItem(page, "Extra Spirit");
        await expect.poll(async () => (await altGroups(tip)).length).toBeGreaterThan(0);
        const groups = await altGroups(tip);
        await leaveItem(page);
        return { kit, groups };
    }
    const infernus = await spiritGroups(INFERNUS_BUILD);
    const kelvin = await spiritGroups(KELVIN_BUILD);
    for (const { kit, groups } of [infernus, kelvin]) {
        const icons = kit.map((a) => a.icon);
        for (const group of groups) expect(icons).toContain(group.icon);
    }
    expect(kelvin.groups.map((g) => g.rows)).not.toEqual(infernus.groups.map((g) => g.rows));
});

test("the ALT column groups the hero's abilities in slot order, then owned items, then hero stats", async ({
    page,
}) => {
    await open(page, SPIRIT_HAZE_BUILD);
    const kit = await heroAbilities(page);
    const strikeArt = await card(page, "Spirit Strike").locator(".art img").getAttribute("src");

    await page.keyboard.down("Alt");
    const groups = await groupsWhenShown(await hoverItem(page, "Echo Shard"), [
        "Damage",
        "Wake Up Delay",
        "Duration",
        "Duration",
        "Spirit Damage",
        "Spirit Resist",
    ]);
    expect(groups.map((g) => [g.kind, g.drawn])).toEqual([
        ["ability", "glyph"],
        ["ability", "glyph"],
        ["ability", "glyph"],
        ["item", "image"],
        ["stat", "glyph"],
    ]);
    // Haze's third ability, Fixation, has no value that spirit power or cooldown reduction changes.
    expect(groups.slice(0, 3).map((g) => g.icon)).toEqual([kit[0]!.icon, kit[1]!.icon, kit[3]!.icon]);
    expect(groups[3]!.icon).toBe(strikeArt);
    expect(groups[4]!.icon).toMatch(/armor_spirit/);
    const resist = groups[4]!.rows[0]!;
    expect(resist.postfix).toBe("%");
    expect(resist.after).toBeGreaterThan(resist.before);
});

test("the ALT column's Modifies heading shows only on an item with a build note", async ({ page }) => {
    await open(page, INFERNUS_BUILD);
    const heading = (tip: Locator) => altPanel(tip).locator(".heading");

    // Extra Charge's note names an imbue target but has no text.
    for (const name of ["Extra Spirit", "Extra Charge"]) {
        const tip = await hoverItem(page, name);
        await page.keyboard.down("Alt");
        await expect(altPanel(tip)).toHaveCount(1);
        await expect(heading(tip)).toHaveCount(0);
        await leaveItem(page);
    }

    const tip = await hoverItem(page, "Mystic Vulnerability");
    await expect(tip).toContainText("Rush it on a winning lane");
    await page.keyboard.down("Alt");
    await expect(heading(tip)).toHaveText("Modifies");
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
