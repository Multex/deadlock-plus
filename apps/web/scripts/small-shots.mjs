// Writes `src/lib/assets/screenshots/small/<name>-mobile.webp`: the copy of each phone close-up shown on the page.
// The full close-up is captured at three image pixels per CSS pixel so the zoom viewer stays sharp; the page only
// draws it about 330 px wide, so it gets a copy at most 960 px wide.
// Usage: node scripts/small-shots.mjs. Needs `cwebp` (libwebp) on the PATH.
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WIDTH = 960;
const QUALITY = 70;

const dir = fileURLToPath(new URL("../src/lib/assets/screenshots/", import.meta.url));
const out = path.join(dir, "small");
mkdirSync(out, { recursive: true });

/** The canvas width from a WebP's VP8X header, which every capture has. */
function width(file) {
    const bytes = readFileSync(file);
    return 1 + bytes.readUIntLE(24, 3);
}

for (const name of readdirSync(dir).filter((n) => n.endsWith("-mobile.webp"))) {
    const source = path.join(dir, name);
    const resize = width(source) > WIDTH ? ["-resize", String(WIDTH), "0"] : [];
    const args = [
        "-quiet",
        "-q",
        String(QUALITY),
        "-m",
        "6",
        "-sharp_yuv",
        ...resize,
        source,
        "-o",
        path.join(out, name),
    ];
    const { status } = spawnSync("cwebp", args, { stdio: "inherit" });
    if (status !== 0) process.exit(status ?? 1);
    console.log(`Wrote small/${name}`);
}
