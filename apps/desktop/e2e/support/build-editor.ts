import type { Page } from "@playwright/test";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { LocalBuilds } from "@deadlock-plus/ipc-types/LocalBuilds";
import { open } from "./flows";
import { expect } from "./test";

/** The default scenario's own local Abrams build. */
export const PRACTICE = { name: "Abrams practice", id: 7 } as const;

export async function openPracticeEditor(page: Page): Promise<void> {
    await open(page, "/builds");
    const main = page.getByRole("main");
    await main.getByRole("tab", { name: "Mine", exact: true }).click();
    await main.getByTestId("build-list").getByRole("link", { name: PRACTICE.name, exact: true }).click();
    await main.getByTestId("build-detail").getByTestId("edit-build").click();
    await expect(page).toHaveURL(new RegExp(`/builds/edit\\?source=local&id=${PRACTICE.id}$`));
    await expect(page.getByTestId("build-name")).toHaveValue(PRACTICE.name);
    await expect(page.locator('[role="application"] [data-item]').first()).toBeVisible();
}

/** The build as the demo's game file holds it in `Unpublished`. */
export async function unpublishedBuild(page: Page, id: number): Promise<BuildView | undefined> {
    const listed = await page.evaluate(async () => {
        const host = window as unknown as {
            __DEADLOCK_PLUS_DEMO__: { handle: { invoke(command: string, args: object): unknown } };
        };
        return (await host.__DEADLOCK_PLUS_DEMO__.handle.invoke("builds_local", {})) as LocalBuilds;
    });
    return listed.builds.find((b) => b.section === "Unpublished" && b.build.heroBuildId === id)?.build;
}
