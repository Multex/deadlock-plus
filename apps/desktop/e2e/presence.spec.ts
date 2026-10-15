import type { Locator, Page } from "@playwright/test";
import { keepKvAcrossReloads, kvWrites, open, sidebarTo } from "./support/flows";
import { expect, settle, test } from "./support/test";

// Controls the loop found on 2026-10-13, back when the page was a Settings category. A page that renders fewer
// has lost a control or changed how it exposes one, and the loop would otherwise pass without having tried it.
const FLOOR = 24;

type Kept = "presence" | "nowhere";

// Controls whose change is not written to the key-value store, by accessible name.
//   presence: part of the Discord activity layout, which the backend owns. The editor saves it a moment after
//             the change, and reads it again when the page opens.
//   nowhere: a view option of the page, reset on purpose every time the page opens.
const OUTSIDE_KV: Record<string, Kept> = {
    Hero: "nowhere",
    "Show Large image": "presence",
    "Show Small image": "presence",
    "Party size": "presence",
    Timer: "presence",
};

function keptOutsideKv(name: string): Kept | undefined {
    // Each activity state has its own switch, named after the state: "Show {state} on Discord".
    if (/^Show .+ on Discord$/.test(name)) return "presence";
    return OUTSIDE_KV[name];
}

/** The Discord activity layout the demo backend holds, as text that can be compared. */
function savedPresence(page: Page): Promise<string> {
    return page.evaluate(() => {
        type Demo = { handle: { invoke(command: string, args: object): unknown } };
        const demo = (window as unknown as { __DEADLOCK_PLUS_DEMO__: Demo }).__DEADLOCK_PLUS_DEMO__;
        return JSON.stringify(demo.handle.invoke("presence_config", {}));
    });
}

interface Control {
    kind: "switch" | "checkbox" | "select" | "radiogroup";
    index: number;
    name: string;
}

const main = (page: Page) => page.getByRole("main");
const levels = (page: Page) => main(page).getByRole("radiogroup", { name: "Discord presence" });
const statusBar = (page: Page) => page.getByRole("contentinfo");

// A select menu's closed trigger is a button that says it is collapsed. Whether such a button really opens
// a list of options is only known after clicking it, which `controlsOn` does. A trigger that is disabled
// until another control turns it on, like the source of an image that is not shown, is not counted.
const selectTriggers = (page: Page) => main(page).getByRole("button", { expanded: false, disabled: false });

function locate(page: Page, control: Control): Locator {
    const all = control.kind === "select" ? selectTriggers(page) : main(page).getByRole(control.kind);
    return all.nth(control.index);
}

async function accessibleName(locator: Locator): Promise<string> {
    const line = (await locator.ariaSnapshot()).split("\n")[0] ?? "";
    return /^- \w+ "((?:[^"\\]|\\.)*)"/.exec(line)?.[1] ?? "";
}

async function controlsOn(page: Page): Promise<Control[]> {
    const controls: Control[] = [];
    for (const kind of ["switch", "checkbox", "radiogroup"] as const) {
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

async function valueOf(page: Page, control: Control): Promise<string> {
    const locator = locate(page, control);
    switch (control.kind) {
        case "switch":
            return (await locator.getAttribute("aria-checked")) ?? "";
        case "checkbox":
            return String(await locator.isChecked());
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

async function leaveAndReturn(page: Page) {
    await sidebarTo(page, "Home", /\/$/);
    await sidebarTo(page, "Presence", /\/presence$/);
}

async function reload(page: Page) {
    await page.reload();
    await settle(page);
}

test("every control on /presence keeps a change", async ({ page }) => {
    test.setTimeout(180_000);
    await keepKvAcrossReloads(page);
    await open(page, "/presence");

    const controls = await controlsOn(page);
    expect(controls.length, "controls found on /presence").toBeGreaterThanOrEqual(FLOOR);

    for (const control of controls) {
        const label = `${control.kind} "${control.name}" (#${control.index + 1}) on /presence`;
        await test.step(label, async () => {
            await expect(locate(page, control), `${label} is disabled`).toBeEnabled();
            const before = await valueOf(page, control);
            const written = (await kvWrites(page)).length;
            const presence = await savedPresence(page);

            await change(page, control);
            await expect.poll(() => valueOf(page, control), `${label} did not change`).not.toBe(before);
            const after = await valueOf(page, control);

            const kept = keptOutsideKv(control.name);
            if (kept === undefined) {
                await expect
                    .poll(async () => (await kvWrites(page)).length, {
                        message: `${label} wrote nothing to the key-value store`,
                    })
                    .toBeGreaterThan(written);
                await reload(page);
            } else if (kept === "presence") {
                await expect.poll(() => savedPresence(page), `${label} was not saved`).not.toBe(presence);
                await leaveAndReturn(page);
            }
            if (kept !== "nowhere") {
                await expect.poll(() => valueOf(page, control), `${label} was not kept`).toBe(after);
            }

            // Put it back, so the next control starts from the page as it was counted.
            await change(page, control, control.kind === "switch" || control.kind === "checkbox" ? undefined : before);
            await expect.poll(() => valueOf(page, control), `${label} did not change back`).toBe(before);
        });
    }
});

test("no two switches or selects on /presence share a name", async ({ page }) => {
    await open(page, "/presence");
    const names = (await controlsOn(page))
        .filter((control) => control.kind === "switch" || control.kind === "select")
        .map((control) => `${control.kind}: ${control.name}`);
    expect(
        names.every((name) => !name.endsWith(": ")),
        "unnamed control on /presence",
    ).toBe(true);
    expect(new Set(names).size, `shared names on /presence: ${names.join(" | ")}`).toBe(names.length);
});

test("the old Settings address opens the Presence page", async ({ page }) => {
    await open(page, "/settings/discord");

    await expect(page).toHaveURL(/\/presence$/);
    await expect(levels(page)).toBeVisible();
});

test("the status bar keeps a dim Discord item while presence is off, leading to the Presence page", async ({
    page,
}) => {
    await open(page, "/presence");
    await expect(statusBar(page).locator('a[href="/presence"]')).toBeVisible();

    await levels(page).getByRole("radio", { name: /^Off/ }).click();
    const off = statusBar(page).getByRole("link", { name: "Discord off" });
    await expect(off).toBeVisible();

    await sidebarTo(page, "Home", /\/$/);
    await off.click();
    await expect(page).toHaveURL(/\/presence$/);
    await expect(levels(page).getByRole("radio", { name: /^Off/ })).toBeChecked();
});

test("the editor says only Detailed uses its states until Detailed is picked", async ({ page }) => {
    await open(page, "/presence");
    const note = main(page).getByText(/^Only Detailed uses these states/);
    await expect(note).toBeVisible();

    await levels(page)
        .getByRole("radio", { name: /^Detailed/ })
        .click();
    await expect(note).toHaveCount(0);

    await levels(page).getByRole("radio", { name: /^Off/ }).click();
    await expect(note).toBeVisible();
});
