import type { Locator, Page } from "@playwright/test";
import type { OverlayToast } from "@deadlock-plus/ipc-types/OverlayToast";
import { open } from "./support/flows";
import { expect, test } from "./support/test";

interface DemoWindow {
    __DEADLOCK_PLUS_DEMO__: { handle: { emit(event: string, payload: unknown): void } };
}

function toast(id: string, overrides: Partial<OverlayToast> = {}): OverlayToast {
    return {
        id,
        kind: "session",
        title: `Title ${id}`,
        body: `Body ${id}`,
        placement: "corner",
        position: "topRight",
        durationMs: 60_000,
        ...overrides,
    };
}

async function emit(page: Page, event: string, payload: unknown): Promise<void> {
    await page.evaluate(
        ([name, value]) => (window as unknown as DemoWindow).__DEADLOCK_PLUS_DEMO__.handle.emit(name as string, value),
        [event, payload] as const,
    );
}

const push = (page: Page, payload: OverlayToast): Promise<void> => emit(page, "overlay://toast", payload);

const card = (page: Page, id: string): Locator => page.locator(`[data-toast-id="${id}"]`);

test.beforeEach(async ({ page }) => {
    await open(page, "/overlay");
});

test("a corner card and a center card show together", async ({ page }) => {
    await push(page, toast("corner-1"));
    await push(page, toast("center-1", { placement: "center" }));

    await expect(card(page, "corner-1")).toContainText("Title corner-1");
    await expect(card(page, "corner-1")).toContainText("Body corner-1");
    await expect(card(page, "center-1")).toContainText("Title center-1");
    await expect(card(page, "center-1")).toContainText("Body center-1");
    await expect(page.locator("[data-toast-id]")).toHaveCount(2);
});

test("a fourth corner toast drops the oldest", async ({ page }) => {
    for (const id of ["a", "b", "c"]) await push(page, toast(id));
    await expect(page.locator("[data-toast-id]")).toHaveCount(3);

    await push(page, toast("d"));
    await expect(card(page, "a")).toBeHidden();
    await expect(page.locator("[data-toast-id]")).toHaveCount(3);
    for (const id of ["b", "c", "d"]) await expect(card(page, id)).toBeVisible();
});

test("a newer center toast replaces the shown one", async ({ page }) => {
    await push(page, toast("first", { placement: "center" }));
    await expect(card(page, "first")).toBeVisible();

    await push(page, toast("second", { placement: "center" }));
    await expect(card(page, "second")).toContainText("Title second");
    await expect(card(page, "first")).toBeHidden();
    await expect(page.locator("[data-toast-id]")).toHaveCount(1);
});

test("a toast is removed once its duration is up", async ({ page }) => {
    await push(page, toast("short", { durationMs: 800 }));
    await push(page, toast("long"));
    await expect(card(page, "short")).toBeVisible();

    await expect(card(page, "short")).toBeHidden();
    await expect(card(page, "long")).toBeVisible();
});

test("toasts on screen move when the position changes", async ({ page }) => {
    await push(page, toast("a"));
    await push(page, toast("b"));
    const stack = page.locator("[data-position]");
    await expect(stack).toHaveAttribute("data-position", "topRight");

    await emit(page, "overlay://position", "bottomLeft");
    await expect(stack).toHaveAttribute("data-position", "bottomLeft");
    await expect(page.locator("[data-toast-id]")).toHaveCount(2);
});
