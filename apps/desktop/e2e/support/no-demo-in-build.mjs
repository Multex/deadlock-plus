// Fails when a build holds demo code: the demo player's name or the scenario hook.
// Usage, from apps/desktop, after `pnpm build`: node e2e/support/no-demo-in-build.mjs [dir]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const MARKERS = ["Lantern", "__DEADLOCK_PLUS_DEMO__"];
const TEXT = /\.(js|mjs|css|html|json|map|txt|svg)$/;

const root = path.resolve(process.argv[2] ?? "build");
if (!existsSync(path.join(root, "index.html"))) {
    console.error(`${root} holds no build: run \`pnpm build\` first`);
    process.exit(2);
}

const files = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && TEXT.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));

const hits = [];
for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const marker of MARKERS) {
        if (text.includes(marker)) hits.push(`${path.relative(root, file)}: ${marker}`);
    }
}

if (hits.length) {
    console.error(`demo code in ${root}:\n  ${hits.join("\n  ")}`);
    process.exit(1);
}
console.log(`no demo code in ${root} (${files.length} files searched)`);
