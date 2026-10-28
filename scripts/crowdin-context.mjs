// Pushes `locales/<area>/en.notes.json` to Crowdin as string context.
//   node scripts/crowdin-context.mjs [--dry-run]
// Needs CROWDIN_PERSONAL_TOKEN and CROWDIN_PROJECT_ID in the environment.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NOTES_FILE, flatten } from "./i18n-check.mjs";

const API = "https://api.crowdin.com/api/v2";
const PAGE = 500;
const BATCH = 100;
const RETRIES = 5;

export function readConfig(env) {
    if (!env.CROWDIN_PERSONAL_TOKEN) throw new Error("CROWDIN_PERSONAL_TOKEN is not set");
    if (!env.CROWDIN_PROJECT_ID) throw new Error("CROWDIN_PROJECT_ID is not set");
    return { token: env.CROWDIN_PERSONAL_TOKEN, projectId: env.CROWDIN_PROJECT_ID };
}

export async function request({ token, fetcher = fetch, sleep }, method, url, body) {
    for (let attempt = 0; ; attempt++) {
        const res = await fetcher(`${API}${url}`, {
            method,
            headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
            body: body && JSON.stringify(body),
        });
        if (res.status === 429 && attempt < RETRIES) {
            await sleep(2000 * (attempt + 1));
            continue;
        }
        const text = await res.text();
        if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${text.slice(0, 300)}`);
        return text ? JSON.parse(text) : null;
    }
}

// Crowdin's i18next parser puts the key in the context, so the key stays as the first line.
const contextOf = (identifier, note) => `${identifier}\n\n${note}`;

export function contextOps(strings, notes) {
    const byIdentifier = new Map(strings.map((s) => [s.identifier, s]));
    const ops = [];
    const unmatched = [];
    for (const [identifier, note] of Object.entries(notes)) {
        const string = byIdentifier.get(identifier);
        if (!string) {
            unmatched.push(identifier);
            continue;
        }
        const value = contextOf(identifier, note);
        if (string.context !== value) ops.push({ op: "replace", path: `/${string.id}/context`, value });
    }
    return { ops, unmatched };
}

export function batches(items, size) {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

function readNotes(localesDir) {
    return readdirSync(localesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(path.join(localesDir, entry.name, NOTES_FILE)))
        .map(({ name: area }) => ({
            area,
            notes: flatten(JSON.parse(readFileSync(path.join(localesDir, area, NOTES_FILE), "utf8"))),
        }));
}

async function main() {
    const dryRun = process.argv.includes("--dry-run");
    const config = readConfig(process.env);
    const client = { token: config.token, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
    const api = (method, url, body) => request(client, method, url, body);
    const project = `/projects/${config.projectId}`;
    const pages = async (url) => {
        const out = [];
        for (let offset = 0; ; offset += PAGE) {
            const sep = url.includes("?") ? "&" : "?";
            const { data } = await api("GET", `${url}${sep}limit=${PAGE}&offset=${offset}`);
            out.push(...data.map((d) => d.data));
            if (data.length < PAGE) return out;
        }
    };

    const root = fileURLToPath(new URL("..", import.meta.url));
    const files = await pages(`${project}/files`);
    const ops = [];
    for (const { area, notes } of readNotes(path.join(root, "locales"))) {
        const file = files.find((f) => f.path === `/locales/${area}/en.json`);
        if (!file) {
            // A new area reaches Crowdin with the next source upload; its notes follow on the run after.
            console.log(`${area}: no Crowdin file yet, skipped`);
            continue;
        }
        const result = contextOps(await pages(`${project}/strings?fileId=${file.id}`), notes);
        console.log(
            `${area}: ${result.ops.length} to write, ${result.unmatched.length} notes without a Crowdin string`,
        );
        ops.push(...result.ops);
    }
    if (dryRun) {
        console.log(`dry run: ${ops.length} contexts would be written`);
        return;
    }
    let done = 0;
    for (const batch of batches(ops, BATCH)) {
        await api("PATCH", `${project}/strings`, batch);
        done += batch.length;
        console.log(`written ${done}/${ops.length}`);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}
