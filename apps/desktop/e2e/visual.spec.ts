import { openShot, SHOTS } from "./support/shots";
import { expect, test } from "./support/test";

test.skip(process.platform !== "win32", "baselines are made on Windows only; fonts render differently elsewhere");

for (const shot of SHOTS.filter((candidate) => !candidate.websiteOnly)) {
    test.describe(shot.scenario, () => {
        test.use({ scenario: shot.scenario });

        test(`${shot.name} looks like its baseline`, async ({ page }) => {
            await openShot(page, shot);
            await expect(page).toHaveScreenshot(`${shot.name}.png`);
        });
    });
}
