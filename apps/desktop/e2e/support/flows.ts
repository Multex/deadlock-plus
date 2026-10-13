import type { Locator, Page } from "@playwright/test";
import { expect, settle } from "./test";

type Args = Record<string, unknown>;

interface DemoHandle {
    invoke(command: string, args: Args): unknown;
    set(command: string, handler: (args: Args) => unknown): void;
}

interface DemoWindow {
    __DEADLOCK_PLUS_DEMO__?: { scenario?: string; handle?: DemoHandle };
    __E2E_RECORDED__?: Record<string, Args[]>;
}

export interface KvWrite {
    command: "kv_set" | "kv_delete";
    store: string;
    key: string;
    value?: unknown;
}

const KV_JOURNAL = "e2e:kv-journal";

export async function open(page: Page, route: string): Promise<void> {
    await page.goto(route);
    await settle(page);
}

/** Follows a sidebar link, as a user moving between pages would. The page state is kept; nothing reloads. */
export async function sidebarTo(page: Page, name: string, url: RegExp): Promise<void> {
    await page.getByRole("navigation").getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(url);
    await settle(page);
}

export const toast = (page: Page, text: string | RegExp): Locator =>
    page.getByRole("listitem").filter({ hasText: text });

/**
 * Answers `command` with `result` from now on and returns a reader of the arguments of every call since.
 * The scenario's own handler no longer runs, so use it for commands whose only effect is outside the app.
 */
export async function recordCommand(page: Page, command: string, result: unknown): Promise<() => Promise<Args[]>> {
    await page.evaluate(
        ([name, value]) => {
            const host = window as unknown as DemoWindow;
            const calls: Args[] = [];
            host.__E2E_RECORDED__ = { ...host.__E2E_RECORDED__, [name as string]: calls };
            host.__DEADLOCK_PLUS_DEMO__!.handle!.set(name as string, (args) => {
                calls.push(args);
                return value;
            });
        },
        [command, result] as const,
    );
    return () => page.evaluate((name) => (window as unknown as DemoWindow).__E2E_RECORDED__![name]!, command);
}

/**
 * The demo keeps the key-value store in the page, so a reload empties it. This writes every change to the
 * tab's session storage and plays it back into the next page load before the app reads anything, which
 * makes a reload behave like an app restart over the same settings files.
 */
export async function keepKvAcrossReloads(page: Page): Promise<void> {
    await page.addInitScript((journalKey) => {
        const host = window as unknown as DemoWindow;
        const journal = (): KvWrite[] => JSON.parse(sessionStorage.getItem(journalKey) ?? "[]") as KvWrite[];
        let hook = host.__DEADLOCK_PLUS_DEMO__;

        Object.defineProperty(window, "__DEADLOCK_PLUS_DEMO__", {
            configurable: true,
            get: () => hook,
            // The app assigns the running demo here once, right after it starts and before any page code runs.
            set(next: DemoWindow["__DEADLOCK_PLUS_DEMO__"]) {
                hook = next;
                const handle = next?.handle;
                if (!handle) return;
                for (const { command, store, key, value } of journal()) handle.invoke(command, { store, key, value });
                const invoke = handle.invoke;
                handle.invoke = (command, args) => {
                    if (command === "kv_set" || command === "kv_delete") {
                        const write = { command, store: args.store, key: args.key, value: args.value } as KvWrite;
                        sessionStorage.setItem(journalKey, JSON.stringify([...journal(), write]));
                    }
                    return invoke(command, args);
                };
            },
        });
    }, KV_JOURNAL);
}

/** Every key-value write the app has made in this tab, oldest first. Needs `keepKvAcrossReloads`. */
export function kvWrites(page: Page): Promise<KvWrite[]> {
    return page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? "[]") as KvWrite[], KV_JOURNAL);
}

/** Drops the recorded writes, so the next load starts from the scenario's own values. */
export async function forgetKv(page: Page): Promise<void> {
    await page.evaluate((key) => sessionStorage.removeItem(key), KV_JOURNAL);
}

/**
 * Whether the focused element shows that it has keyboard focus: an outline, or a ring drawn as a box shadow
 * with a spread and a colour that is not fully transparent.
 */
export function focusIsVisible(page: Page): Promise<boolean> {
    return page.evaluate(() => {
        const element = document.activeElement;
        if (!element || element === document.body || !element.matches(":focus-visible")) return false;
        const visible = (candidate: Element): boolean => {
            const style = getComputedStyle(candidate);
            if (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) return true;
            return style.boxShadow.split(/,(?![^(]*\))/).some((shadow) => {
                const lengths = shadow.replace(/(rgba?|oklch|oklab|color)\([^)]*\)/g, "").match(/-?[\d.]+px/g) ?? [];
                const alpha = /(?:rgba\([^)]*,\s*|\/\s*)([\d.]+%?)\s*\)/.exec(shadow)?.[1];
                const transparent = alpha !== undefined && parseFloat(alpha) === 0;
                return !transparent && lengths.length === 4 && parseFloat(lengths[3]!) > 0;
            });
        };
        // A control may draw its ring on a child, as the slider does on its gem.
        return visible(element) || [...element.children].some(visible);
    });
}
