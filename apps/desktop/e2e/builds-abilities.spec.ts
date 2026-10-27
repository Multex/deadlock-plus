import type { Page } from "@playwright/test";
import { openPracticeEditor } from "./support/build-editor";
import { expect, test } from "./support/test";

test.use({ viewport: { width: 1600, height: 1000 } });

// Levels follow the Deadlock API's Abrams level table: unlocks at levels 1, 3, 5 and 8; one ability point at
// each of levels 2, 4, 6 and 7.

const bar = (page: Page) => page.getByTestId("ability-bar");
const sequence = (page: Page) => page.getByTestId("ability-sequence");
const unlocksFirst = (page: Page) => page.getByTestId("ability-unlocks-first");

const ability = (page: Page, slot: number) => bar(page).locator(`[data-ability-slot="${slot}"]`).getByRole("button");

async function abilityNames(page: Page): Promise<string[]> {
    return Promise.all([1, 2].map(async (slot) => (await ability(page, slot).getAttribute("aria-label"))!));
}

/** Each taken step as "ability, kind: level", in stored order. */
function shownSteps(page: Page): Promise<string[]> {
    return sequence(page)
        .locator("li:has([data-step-chip])")
        .evaluateAll((items) =>
            items.map((li) => {
                const label = li.querySelector("[data-step-chip]")!.getAttribute("aria-label")!;
                const level = li.querySelector(":scope > span:last-child")!.textContent!.trim();
                const [, kind, name] = label.match(/^Step \d+: ([^,]+), (.+)$/)!;
                return `${name}, ${kind}: ${level}`;
            }),
        );
}

const levelOf = (page: Page, step: number) =>
    sequence(page).locator("li:has([data-step-chip])").nth(step).locator(":scope > span").last();

async function startOver(page: Page, slots: number[]) {
    await openPracticeEditor(page);
    await bar(page).getByRole("button", { name: "Clear", exact: true }).click();
    await expect(sequence(page).locator("[data-step-chip]")).toHaveCount(0);
    for (const slot of slots) await ability(page, slot).click();
    await expect(sequence(page).locator("[data-step-chip]")).toHaveCount(slots.length);
}

test("Unlocks first moves every unlock before the point steps, and each step keeps its level", async ({ page }) => {
    await startOver(page, [1, 1, 2, 1, 2]);
    const [one, two] = await abilityNames(page);
    const stored = [
        `${one}, Unlock: Lv 1`,
        `${one}, Tier 1: Lv 2`,
        `${two}, Unlock: Lv 3`,
        `${one}, Tier 2: Lv 6`,
        `${two}, Tier 1: Lv 7`,
    ];
    await expect.poll(() => shownSteps(page)).toEqual(stored);
    await expect(unlocksFirst(page)).toBeEnabled();

    await unlocksFirst(page).click();
    await expect
        .poll(() => shownSteps(page))
        .toEqual([
            `${one}, Unlock: Lv 1`,
            `${two}, Unlock: Lv 3`,
            `${one}, Tier 1: Lv 2`,
            `${one}, Tier 2: Lv 6`,
            `${two}, Tier 1: Lv 7`,
        ]);
    await expect(unlocksFirst(page)).toBeDisabled();
    // A step the game takes earlier than the one stored before it stands out.
    await expect(levelOf(page, 2)).toHaveClass(/font-semibold/);
    await expect(levelOf(page, 3)).not.toHaveClass(/font-semibold/);

    await page.getByTestId("editor-undo").click();
    await expect.poll(() => shownSteps(page)).toEqual(stored);
});

test("unlocks and ability points run as two queues", async ({ page }) => {
    await startOver(page, [1, 2, 1, 2]);
    const [one, two] = await abilityNames(page);
    // The first point arrives at level 2, before the second unlock at level 3.
    await expect
        .poll(() => shownSteps(page))
        .toEqual([`${one}, Unlock: Lv 1`, `${two}, Unlock: Lv 3`, `${one}, Tier 1: Lv 2`, `${two}, Tier 1: Lv 4`]);

    // Swapping two point steps swaps which point each takes.
    const chips = sequence(page).locator("[data-step-chip]");
    await chips.nth(3).focus();
    await page.keyboard.press("Alt+ArrowLeft");
    await expect
        .poll(() => shownSteps(page))
        .toEqual([`${one}, Unlock: Lv 1`, `${two}, Unlock: Lv 3`, `${two}, Tier 1: Lv 3`, `${one}, Tier 1: Lv 4`]);

    // Passing an unlock changes nothing but the stored order: the point step still waits for its own unlock.
    await expect(chips.nth(2)).toBeFocused();
    await page.keyboard.press("Alt+ArrowLeft");
    await expect
        .poll(() => shownSteps(page))
        .toEqual([`${one}, Unlock: Lv 1`, `${two}, Tier 1: Lv 3`, `${two}, Unlock: Lv 3`, `${one}, Tier 1: Lv 4`]);
});
