import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

export interface Entry {
    url: string;
    status: number;
    headers: Record<string, string>;
    body: Buffer;
}

export interface Fetched {
    status: number;
    headers: Record<string, string>;
    body: Buffer;
}

export interface GameDataCache {
    /** The stored answer for `url`, or on a miss the answer of `fetch`, stored first when it succeeded. */
    get(url: string, fetch: () => Promise<Fetched>): Promise<Entry>;
}

const KEPT_HEADERS = ["content-type", "cache-control"];
const NETWORK_LOG = "fetched.log";

export function entryFile(url: string): string {
    return `${createHash("sha256").update(url).digest("hex")}.entry`;
}

/** One line of JSON that describes the response, a line feed, then the body's bytes untouched. */
export function encodeEntry({ url, status, headers, body }: Entry): Buffer {
    return Buffer.concat([Buffer.from(`${JSON.stringify({ url, status, headers })}\n`), body]);
}

export function decodeEntry(bytes: Buffer): Entry {
    const end = bytes.indexOf(0x0a);
    try {
        const { url, status, headers } = JSON.parse(bytes.subarray(0, end).toString("utf8")) as Omit<Entry, "body">;
        if (typeof url !== "string" || typeof status !== "number") throw new Error("fields are missing");
        return { url, status, headers, body: bytes.subarray(end + 1) };
    } catch (cause) {
        throw new Error("not a game data cache entry", { cause });
    }
}

export function keptHeaders(headers: Record<string, string>): Record<string, string> {
    const lower = Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value] as const);
    return Object.fromEntries(lower.filter(([name]) => KEPT_HEADERS.includes(name)));
}

/** Entries never go stale by age. They are left behind as a whole when the version changes. */
export function cacheDir(root: string, version: string): string {
    return path.join(root, `v${version.trim()}`);
}

export function clearGameDataCache(root: string): void {
    rmSync(root, { recursive: true, force: true });
}

function store(dir: string, entry: Entry): void {
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, entryFile(entry.url));
    // Readers in other processes must never see half an entry, so it appears under its name in one step.
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temporary, encodeEntry(entry));
    try {
        renameSync(temporary, file);
    } catch (error) {
        rmSync(temporary, { force: true });
        // Windows refuses to replace a file another process has open; that process stored the same entry.
        if (!existsSync(file)) throw error;
    }
    appendFileSync(path.join(dir, NETWORK_LOG), `${entry.url}\n`);
}

export function createGameDataCache({ dir, offline }: { dir: string; offline: boolean }): GameDataCache {
    const loading = new Map<string, Promise<Entry>>();

    async function load(url: string, fetch: () => Promise<Fetched>): Promise<Entry> {
        try {
            return decodeEntry(readFileSync(path.join(dir, entryFile(url))));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        if (offline) throw new Error(`not in the game data cache, and E2E_OFFLINE forbids the network: ${url}`);

        let fetched: Fetched;
        try {
            fetched = await fetch();
        } catch (cause) {
            const reason = cause instanceof Error ? cause.message : String(cause);
            throw new Error(
                `the game data cache is cold for ${url} and fetching it failed, so this run needs the network: ${reason}`,
                { cause },
            );
        }
        const entry: Entry = { url, status: fetched.status, headers: keptHeaders(fetched.headers), body: fetched.body };
        if (entry.status >= 200 && entry.status < 300) store(dir, entry);
        return entry;
    }

    return {
        get(url, fetch) {
            const known = loading.get(url);
            if (known) return known;
            const pending = load(url, fetch);
            loading.set(url, pending);
            const forget = () => loading.delete(url);
            pending.then((entry) => (entry.status >= 200 && entry.status < 300) || forget(), forget);
            return pending;
        },
    };
}
