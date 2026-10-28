import type { Locator, Page } from "@playwright/test";
import { forgetKv, keepKvAcrossReloads, kvWrites, open } from "./support/flows";
import { WINDOWS_UA } from "./support/platform";
import { settingsCategories } from "./support/routes";
import { expect, settle, test } from "./support/test";

// The control counts below are the Windows pages.
test.use({ userAgent: WINDOWS_UA });

const CATEGORIES = settingsCategories();

// Controls the loop found on each page on 2026-10-16, with every "Advanced" disclosure open. A page that
// renders fewer has lost a control or changed how it exposes one, and the loop would otherwise pass without
// having tried it.
const FLOOR: Record<string, number> = {
    appearance: 4,
    language: 1,
    startup: 8,
    notifications: 13,
    overlay: 3,
    privacy: 1,
    sharing: 2,
    diagnostics: 2,
    about: 1,
};
const TOTAL_FLOOR = 35;

type Kept = "backend" | "browser" | "nowhere";

// Controls whose change is not written to the key-value store, by page and accessible name.
//   backend: the backend owns the value, so it must survive leaving Settings and coming back.
//   browser: kept in the webview's own storage, so it must survive a reload.
//   nowhere: a view option of the page, reset on purpose every time the page opens.
const OUTSIDE_KV: Record<string, Record<string, Kept>> = {
    language: { Language: "browser" },
    startup: {
        // The autostart switch is named after the system the browser reports.
        "Start with Windows": "backend",
        "Start at login": "backend",
        "Allow background work": "backend",
    },
    diagnostics: { "Auto-scroll": "browser", "Minimum level": "browser" },
};

// Each background task has its own switch and select, named after the task: "{task} Run by itself".
function keptOutsideKv(category: string, name: string): Kept | undefined {
    if (category === "startup" && (name.endsWith("Run by itself") || name.endsWith("While Deadlock runs"))) {
        return "backend";
    }
    return OUTSIDE_KV[category]?.[name];
}

// Reloading or leaving Settings closes every disclosure, so this runs again after each. Each click takes one
// disclosure out of the closed set, so the first closed one is always the next.
async function openDisclosures(page: Page) {
    const closed = main(page).locator("details:not([open]) > summary");
    for (let left = await closed.count(); left > 0; left--) await closed.first().click();
}

interface Control {
    kind: "switch" | "checkbox" | "select" | "slider" | "radiogroup";
    index: number;
    name: string;
}

const main = (page: Page) => page.getByRole("main");

function locate(page: Page, control: Control): Locator {
    const all = control.kind === "select" ? selectTriggers(page) : main(page).getByRole(control.kind);
    return all.nth(control.index);
}

// A select menu's closed trigger is a combobox, or a button, that says it is collapsed. Whether such a button
// really opens a list of options is only known after clicking it, which `controlsOn` does. A trigger that is
// disabled until another control turns it on, like the source of an image that is not shown, is not counted.
const selectTriggers = (page: Page) =>
    main(page)
        .getByRole("combobox", { expanded: false, disabled: false })
        .or(main(page).getByRole("button", { expanded: false, disabled: false }));

async function accessibleName(locator: Locator): Promise<string> {
    const line = (await locator.ariaSnapshot()).split("\n")[0] ?? "";
    return /^- \w+ "((?:[^"\\]|\\.)*)"/.exec(line)?.[1] ?? "";
}

async function controlsOn(page: Page): Promise<Control[]> {
    const controls: Control[] = [];
    for (const kind of ["switch", "checkbox", "slider", "radiogroup"] as const) {
        const found = main(page).getByRole(kind);
        for (let index = 0; index < (await found.count()); index++) {
            controls.push({ kind, index, name: await accessibleName(found.nth(index)) });
        }
    }
    for (let index = 0; index < (await selectTriggers(page).count()); index++) {
        const trigger = selectTriggers(page).nth(index);
        const name = await accessibleName(trigger);
        await trigger.click();
        const opensList = await page
            .getByRole("listbox")
            .waitFor({ state: "visible", timeout: 1_000 })
            .then(
                () => true,
                () => false,
            );
        await page.keyboard.press("Escape");
        if (opensList) {
            await expect(page.getByRole("listbox")).toBeHidden();
            controls.push({ kind: "select", index, name });
        }
    }
    return controls;
}

/** What the control shows now, as text that can be compared before and after. */
async function valueOf(page: Page, control: Control): Promise<string> {
    const locator = locate(page, control);
    switch (control.kind) {
        case "switch":
            return (await locator.getAttribute("aria-checked")) ?? "";
        case "checkbox":
            return String(await locator.isChecked());
        case "slider":
            return (await locator.getAttribute("aria-valuenow")) ?? "";
        case "select":
            return (await locator.innerText()).trim();
        case "radiogroup":
            return accessibleName(locator.getByRole("radio", { checked: true }));
    }
}

/** Changes the control the way a user would, to `target` when given, else to any other value. */
async function change(page: Page, control: Control, target?: string): Promise<void> {
    const locator = locate(page, control);
    switch (control.kind) {
        case "switch":
        case "checkbox":
            await locator.click();
            return;
        case "slider": {
            await locator.focus();
            const [now, max] = await Promise.all(
                ["aria-valuenow", "aria-valuemax"].map(async (name) => Number(await locator.getAttribute(name))),
            );
            const forward = target === undefined ? now! < max! : Number(target) > now!;
            await page.keyboard.press(forward ? "ArrowRight" : "ArrowLeft");
            return;
        }
        case "select": {
            await locator.click();
            const options = page.getByRole("listbox").getByRole("option");
            const wanted =
                target === undefined
                    ? options.and(page.getByRole("option", { selected: false, disabled: false })).first()
                    : options.filter({ hasText: target }).first();
            await wanted.click();
            await expect(page.getByRole("listbox")).toBeHidden();
            return;
        }
        case "radiogroup": {
            const wanted =
                target === undefined
                    ? locator.getByRole("radio", { checked: false, disabled: false }).first()
                    : locator.getByRole("radio", { name: target, exact: true });
            await wanted.click();
            return;
        }
    }
}

// A category's menu entry carries the same words as its page heading.
async function leaveSettingsAndReturn(page: Page, category: string) {
    const title = await page.getByRole("heading", { level: 1 }).innerText();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).not.toHaveURL(/\/settings\//);
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page
        .getByRole("navigation", { name: "Settings categories" })
        .getByRole("link", { name: title, exact: true })
        .click();
    await expect(page).toHaveURL(new RegExp(`/settings/${category}$`));
    await settle(page);
    await openDisclosures(page);
}

async function reload(page: Page) {
    await page.reload();
    await settle(page);
    await openDisclosures(page);
}

for (const category of CATEGORIES) {
    test(`every control on /settings/${category} keeps a change`, async ({ page }) => {
        test.setTimeout(180_000);
        await keepKvAcrossReloads(page);
        await open(page, `/settings/${category}`);
        await openDisclosures(page);

        const controls = await controlsOn(page);
        expect(controls.length, `controls found on /settings/${category}`).toBeGreaterThanOrEqual(FLOOR[category] ?? 0);

        for (const control of controls) {
            const label = `${control.kind} "${control.name}" (#${control.index + 1}) on /settings/${category}`;
            await test.step(label, async () => {
                await expect(locate(page, control), `${label} is disabled`).toBeEnabled();
                const before = await valueOf(page, control);
                const written = (await kvWrites(page)).length;

                await change(page, control);
                await expect.poll(() => valueOf(page, control), `${label} did not change`).not.toBe(before);
                const after = await valueOf(page, control);

                const kept = keptOutsideKv(category, control.name);
                if (kept === undefined) {
                    await expect
                        .poll(async () => (await kvWrites(page)).length, {
                            message: `${label} wrote nothing to the key-value store`,
                        })
                        .toBeGreaterThan(written);
                    await reload(page);
                } else if (kept === "browser") {
                    await reload(page);
                } else if (kept === "backend") {
                    await leaveSettingsAndReturn(page, category);
                }
                if (kept !== "nowhere") {
                    await expect.poll(() => valueOf(page, control), `${label} was not kept`).toBe(after);
                }

                // Put it back, so the next control starts from the page as it was counted.
                await change(
                    page,
                    control,
                    control.kind === "switch" || control.kind === "checkbox" ? undefined : before,
                );
                await expect.poll(() => valueOf(page, control), `${label} did not change back`).toBe(before);
            });
        }
    });
}

test("no two switches or selects on a settings page share a name", async ({ page }) => {
    test.setTimeout(120_000);
    for (const category of CATEGORIES) {
        await open(page, `/settings/${category}`);
        await openDisclosures(page);
        const names = (await controlsOn(page))
            .filter((control) => control.kind === "switch" || control.kind === "select")
            .map((control) => `${control.kind}: ${control.name}`);
        expect(
            names.every((name) => !name.endsWith(": ")),
            `unnamed control on /settings/${category}`,
        ).toBe(true);
        expect(new Set(names).size, `shared names on /settings/${category}: ${names.join(" | ")}`).toBe(names.length);
    }
});

test("the settings pages still hold the controls that were counted", async ({ page }) => {
    test.setTimeout(120_000);
    expect(Object.keys(FLOOR).filter((category) => !CATEGORIES.includes(category))).toEqual([]);

    let total = 0;
    for (const category of CATEGORIES) {
        await open(page, `/settings/${category}`);
        await openDisclosures(page);
        total += (await controlsOn(page)).length;
    }
    expect(total).toBeGreaterThanOrEqual(TOTAL_FLOOR);
});

test("a setting changed and then reloaded is read back from the key-value store", async ({ page }) => {
    await keepKvAcrossReloads(page);
    await open(page, "/settings/appearance");
    const font = page.getByRole("switch", { name: "Accessible font", exact: true });
    await expect(font).not.toBeChecked();

    await font.click();
    await expect(font).toBeChecked();
    await expect
        .poll(() => kvWrites(page))
        .toContainEqual({ command: "kv_set", store: "app-settings", key: "accessibleFont", value: true });

    await reload(page);
    await expect(font).toBeChecked();
    await expect(page.locator(":root")).toHaveAttribute("data-accessible-font", "");

    // Without the stored value the page falls back to its default, which proves the reload read the store.
    await forgetKv(page);
    await reload(page);
    await expect(font).not.toBeChecked();
});

test("picking a theme changes the root theme attribute at once and after a restart", async ({ page }) => {
    await keepKvAcrossReloads(page);
    await open(page, "/settings/appearance");
    const root = page.locator(":root");
    const themes = page.getByRole("radiogroup", { name: "Theme" });
    await expect(root).toHaveAttribute("data-theme", "deadlock");
    await expect(themes.getByRole("radio", { name: /^Deadlock Warm/ })).toBeChecked();

    await themes.getByRole("radio", { name: /^Midnight/ }).click();

    await expect(root).toHaveAttribute("data-theme", "midnight");
    await expect(themes.getByRole("radio", { name: /^Midnight/ })).toBeChecked();

    await reload(page);
    await expect(root).toHaveAttribute("data-theme", "midnight");

    await themes.getByRole("radio", { name: /^Daylight/ }).click();
    await expect(root).toHaveAttribute("data-theme", "daylight");
});

test("picking a Catppuccin flavour sets the root variant attribute at once and after a restart", async ({ page }) => {
    await keepKvAcrossReloads(page);
    await open(page, "/settings/appearance");
    const root = page.locator(":root");

    await page
        .getByRole("radiogroup", { name: "Theme" })
        .getByRole("radio", { name: /^Catppuccin/ })
        .click();
    await expect(root).toHaveAttribute("data-theme", "catppuccin");
    await expect(root).toHaveAttribute("data-theme-variant", "mocha");

    await main(page).getByRole("combobox", { name: "Flavour for Catppuccin" }).click();
    await page.getByRole("listbox").getByRole("option", { name: "Latte" }).click();
    await expect(root).toHaveAttribute("data-theme-variant", "latte");

    await reload(page);
    await expect(root).toHaveAttribute("data-theme-variant", "latte");
});

test("the arrow keys move through the themes and apply each one", async ({ page }) => {
    await open(page, "/settings/appearance");
    const themes = page.getByRole("radiogroup", { name: "Theme" });

    await themes.getByRole("radio", { checked: true }).focus();
    await page.keyboard.press("ArrowRight");

    await expect(themes.getByRole("radio", { name: /^Midnight/ })).toBeFocused();
    await expect(page.locator(":root")).toHaveAttribute("data-theme", "midnight");
});

test("switching the language translates the page, survives a reload, and switches back", async ({ page }) => {
    await open(page, "/settings/language");
    const languages = page.getByRole("radiogroup").first();
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveText("Language");
    await expect(page.locator(":root")).toHaveAttribute("lang", "en");

    await languages.getByRole("radio", { name: /^Русский/ }).click();

    await expect(page.locator(":root")).toHaveAttribute("lang", "ru");
    await expect(heading).not.toHaveText("Language");
    await expect(page.getByRole("link", { name: "Appearance", exact: true })).toHaveCount(0);

    await reload(page);
    await expect(page.locator(":root")).toHaveAttribute("lang", "ru");
    await expect(heading).not.toHaveText("Language");

    await page
        .getByRole("radiogroup")
        .first()
        .getByRole("radio", { name: /^English/ })
        .click();

    await expect(page.locator(":root")).toHaveAttribute("lang", "en");
    await expect(heading).toHaveText("Language");
    await expect(page.getByRole("link", { name: "Appearance", exact: true })).toBeVisible();
});

test("the bare /settings address opens the first category with nothing failing to load", async ({ page }) => {
    await open(page, "/settings");

    await expect(page).toHaveURL(new RegExp(`/settings/${CATEGORIES[0]}$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test.describe("Match sharing", () => {
    const sharedList = (page: Page) => main(page).locator("details").filter({ hasText: "Shared matches" });
    const sharedSummary = (page: Page) => sharedList(page).locator("summary");

    test("each switch explains how it works when asked", async ({ page }) => {
        await open(page, "/settings/sharing");
        const howItWorks = main(page).getByText("How it works", { exact: true });
        await expect(howItWorks).toHaveCount(2);
        const sendPoint = main(page).getByText(
            "It sends that, the match IDs and your Steam ID to the Deadlock API. Nothing else.",
        );
        await expect(sendPoint).toBeHidden();

        await howItWorks.first().click();
        await expect(sendPoint).toBeVisible();
        await expect(main(page).getByText("Up to 40 matches per account a day.")).toBeHidden();

        await howItWorks.nth(1).click();
        await expect(main(page).getByText("Up to 40 matches per account a day.")).toBeVisible();
    });

    test("the shared matches list counts each source and links every match", async ({ page }) => {
        await open(page, "/settings/sharing");
        await expect(sharedSummary(page)).toHaveText(
            /Shared matches\s*Steam\s*11\s*Deadlock\s*7\s*Steam login\s*6\s*19 with replay/,
        );
        const rows = sharedList(page).getByRole("row");
        await expect(rows).toHaveCount(0);

        await sharedSummary(page).click();
        // One header row and one row per shared match.
        await expect(rows).toHaveCount(25);
        await expect(sharedList(page).getByRole("img", { name: "Not sent" })).toHaveCount(5);
        await expect(rows.nth(1)).toContainText("Steam");

        await sharedList(page).getByRole("link", { name: "990000060" }).click();
        await expect(page).toHaveURL(/\/match-history\/990000060$/);
    });

    test.describe("a new user", () => {
        test.use({ scenario: "new-user" });

        test("the shared matches list says nothing was shared yet", async ({ page }) => {
            await page.goto("/");
            await page.waitForURL("**/onboarding");
            await page.getByRole("button", { name: "Skip" }).click();
            await page.waitForURL((url) => url.pathname === "/");
            await page.getByRole("complementary").getByRole("link", { name: "Settings", exact: true }).click();
            await page.getByRole("link", { name: "Match sharing", exact: true }).click();
            await expect(page).toHaveURL(/\/settings\/sharing$/);
            await settle(page);

            await expect(sharedSummary(page)).toHaveText("Shared matches");
            await sharedSummary(page).click();
            await expect(sharedList(page).getByText("Nothing shared yet.", { exact: true })).toBeVisible();
            await expect(sharedList(page).getByRole("row")).toHaveCount(0);
        });
    });
});
