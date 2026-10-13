// Writes the website's screenshots: the desktop frontend on made-up data, one WebP per shot listed in
// apps/desktop/e2e/support/shots.ts, taken by the same Playwright setup the E2E tests run on.
// Usage, from apps/desktop: pnpm screenshots [--only <name>] [--scale <n>] [--out <dir>]
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function option(name) {
    const at = process.argv.indexOf(name);
    return at === -1 ? undefined : process.argv[at + 1];
}

const env = { ...process.env, SCREENSHOTS: "1" };
const only = option("--only");
const scale = option("--scale");
const out = option("--out");
if (only) env.SCREENSHOTS_ONLY = only;
if (scale) env.SCREENSHOTS_SCALE = scale;
if (out) env.SCREENSHOTS_OUT = path.resolve(out);

const { status } = spawnSync("pnpm exec playwright test", {
    cwd: fileURLToPath(new URL("../apps/desktop/", import.meta.url)),
    env,
    shell: true,
    stdio: "inherit",
});
process.exit(status ?? 1);
