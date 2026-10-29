// Uploads the screenshots a capture in `apps/desktop/e2e/support` wrote (`crowdin-shots.mjs` for the app, the default
// folder, or `crowdin-web-shots.mjs` for the website) to Crowdin and tags the strings on them.
// A screenshot that already exists under the same name is replaced, image and tags, so a rerun refreshes it.
//   node scripts/crowdin-screenshots.mjs [--dry-run] [--dir <folder with tags.json>]
// Needs CROWDIN_PERSONAL_TOKEN and CROWDIN_PROJECT_ID in the environment.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listAll, readConfig, request } from "./crowdin-context.mjs";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function pngSize(bytes) {
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("not a PNG file");
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** `locales/<area>/en.json` for every area folder that has one. */
export function sourceFiles(localesDir) {
    return readdirSync(localesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(path.join(localesDir, entry.name, "en.json")))
        .map((entry) => `locales/${entry.name}/en.json`)
        .sort();
}

/**
 * Crowdin tags for one screenshot. `stringIds` maps `<source file>#<identifier>` to a Crowdin string id.
 * Text that more than one string renders as gets no tag: a wrong tag misleads more than a missing one.
 * Boxes are measured on the PNG (`size`); `stored` is the size Crowdin keeps the image at, which is smaller when it
 * downscales a large upload, and it checks every box against that size.
 */
export function screenshotTags(tags, stringIds, size, stored = size) {
    const sx = stored.width / size.width;
    const sy = stored.height / size.height;
    const seen = new Set();
    const out = [];
    for (const tag of tags) {
        if (tag.ambiguous) continue;
        const stringId = stringIds.get(`${tag.source}#${tag.identifier}`);
        if (stringId === undefined) continue;
        // Crowdin rejects a box that runs past the image edge, so clip it. A sliver under 2 px marks nothing a
        // translator can see, the same floor the capture uses.
        const x = Math.max(0, Math.round(tag.x * sx));
        const y = Math.max(0, Math.round(tag.y * sy));
        const width = Math.min(Math.round((tag.x + tag.width) * sx), stored.width) - x;
        const height = Math.min(Math.round((tag.y + tag.height) * sy), stored.height) - y;
        const key = `${stringId}@${x},${y}`;
        if (width < 2 || height < 2 || seen.has(key)) continue;
        seen.add(key);
        out.push({ stringId, position: { x, y, width, height } });
    }
    return out;
}

/** Runs `upload` for every shot; a shot that throws is reported and the rest still go. Returns the failed files. */
export async function uploadEach(shots, upload, report) {
    const failed = [];
    for (const shot of shots) {
        try {
            await upload(shot);
        } catch (error) {
            failed.push(shot.file);
            report(`${shot.file}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return failed;
}

function option(name) {
    const at = process.argv.indexOf(name);
    return at === -1 ? undefined : process.argv[at + 1];
}

async function main() {
    const dryRun = process.argv.includes("--dry-run");
    const config = readConfig(process.env);
    const root = fileURLToPath(new URL("..", import.meta.url));
    const dir = path.resolve(option("--dir") ?? path.join(root, "apps/desktop/test-results/crowdin"));
    const tagsFile = path.join(dir, "tags.json");
    if (!existsSync(tagsFile))
        throw new Error(`${tagsFile} is missing; run a capture in apps/desktop/e2e/support first`);
    const shots = JSON.parse(readFileSync(tagsFile, "utf8"));

    const client = { token: config.token, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
    const api = (method, url, body, headers) => request(client, method, url, body, headers);
    const project = `/projects/${config.projectId}`;

    const files = await listAll(api, `${project}/files`);
    const stringIds = new Map();
    for (const source of sourceFiles(path.join(root, "locales"))) {
        const file = files.find((f) => f.path === `/${source}`);
        if (!file) {
            console.log(`${source}: no Crowdin file yet, skipped`);
            continue;
        }
        for (const s of await listAll(api, `${project}/strings?fileId=${file.id}`)) {
            stringIds.set(`${source}#${s.identifier}`, s.id);
        }
    }
    const existing = new Map((await listAll(api, `${project}/screenshots`)).map((s) => [s.name, s.id]));

    let uploaded = 0;
    let tagCount = 0;
    const failed = await uploadEach(
        shots,
        async (shot) => {
            const png = readFileSync(path.join(dir, shot.file));
            const size = pngSize(png);
            const local = screenshotTags(shot.tags, stringIds, size).length;
            if (!local) return;
            if (dryRun) {
                tagCount += local;
                return;
            }
            const storage = await api("POST", "/storages", new Uint8Array(png), {
                "Content-Type": "image/png",
                "Crowdin-API-FileName": shot.file,
            });
            const body = { storageId: storage.data.id, name: shot.file };
            const prior = existing.get(shot.file);
            const screenshot = prior
                ? await api("PUT", `${project}/screenshots/${prior}`, body)
                : await api("POST", `${project}/screenshots`, body);
            const tags = screenshotTags(shot.tags, stringIds, size, screenshot.data.size ?? size);
            if (tags.length) await api("PUT", `${project}/screenshots/${screenshot.data.id}/tags`, tags);
            uploaded++;
            tagCount += tags.length;
            console.log(`${prior ? "replaced" : "added"} ${shot.file} (${tags.length} tags)`);
        },
        (message) => console.error(message),
    );
    console.log(
        dryRun
            ? `dry run: ${tagCount} tags on ${shots.length} screenshots`
            : `${uploaded} screenshots, ${tagCount} tags`,
    );
    if (failed.length) throw new Error(`${failed.length} screenshots failed: ${failed.join(", ")}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}
