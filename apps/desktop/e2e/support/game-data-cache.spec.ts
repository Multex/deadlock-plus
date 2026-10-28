import { expect, settle, test } from "./test";

const API = "api.deadlock-api.com";
const apiRequests = (served: string[]) => served.filter((url) => new URL(url).host === API);

test("the default scenario reads public game data through the cache", async ({ page, served }) => {
    await page.goto("/demos");
    await settle(page);
    expect(apiRequests(served)).toContain(`https://${API}/v1/assets/heroes`);
    await expect(page.getByRole("main").getByText(/^Hero \d+ · /)).toHaveCount(0);
});

const STATUS = {
    offline: { title: "Deadlock API is unreachable", text: "Deadlock API offline" },
    "api-down": { title: "Deadlock API is turning requests away for now", text: "Deadlock API busy" },
};

for (const [scenario, status] of Object.entries(STATUS)) {
    test.describe(scenario, () => {
        test.use({ scenario });

        test("the failing API is answered inside the page, so the cache neither sees nor heals it", async ({
            page,
            served,
        }) => {
            await page.goto("/demos");
            await settle(page);
            await expect(page.getByTitle(status.title)).toHaveText(status.text);
            await expect(
                page
                    .getByRole("main")
                    .getByText(/^Hero \d+ · /)
                    .first(),
            ).toBeVisible();
            expect(apiRequests(served)).toEqual([]);
        });
    });
}
