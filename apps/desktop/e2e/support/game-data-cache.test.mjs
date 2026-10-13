import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
    cacheDir,
    clearGameDataCache,
    createGameDataCache,
    decodeEntry,
    encodeEntry,
    entryFile,
    keptHeaders,
} from "./game-data-cache.ts";

const HEROES = "https://api.deadlock-api.com/v1/assets/heroes";
const ICON = "https://assets-bucket.deadlock-api.com/assets-api-res/images/heroes/bull_sm.webp";

const roots = [];
function tempDir() {
    const dir = mkdtempSync(path.join(tmpdir(), "dp-game-data-"));
    roots.push(dir);
    return dir;
}
afterEach(() => {
    while (roots.length) rmSync(roots.pop(), { recursive: true, force: true });
});

function server(response = { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from("[]") }) {
    const calls = [];
    const fetcher = (url) => async () => {
        calls.push(url);
        // Lets every waiting caller reach the cache before the first answer lands.
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (response instanceof Error) throw response;
        return response;
    };
    return { calls, fetcher };
}

describe("entry file name", () => {
    it("is a plain file name that is the same for the same URL", () => {
        assert.match(entryFile(HEROES), /^[0-9a-f]{64}\.entry$/);
        assert.equal(entryFile(HEROES), entryFile(HEROES));
    });

    it("differs when any part of the URL differs, the query included", () => {
        const names = [HEROES, `${HEROES}?language=english`, `${HEROES}?language=german`, ICON].map(entryFile);
        assert.equal(new Set(names).size, names.length);
    });
});

describe("entry format", () => {
    it("gives back the URL, status, headers and the exact bytes of the body", () => {
        const body = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x0a, 0x00, 0xff, 0x0a, 0x0a, 0x80]);
        const entry = { url: ICON, status: 200, headers: { "content-type": "image/webp" }, body };
        const decoded = decodeEntry(encodeEntry(entry));
        assert.deepEqual({ ...decoded, body: [...decoded.body] }, { ...entry, body: [...body] });
    });

    it("refuses bytes that are not an entry", () => {
        assert.throws(() => decodeEntry(Buffer.from("not an entry")), /not a game data cache entry/);
    });
});

describe("kept headers", () => {
    it("keeps what the page needs to read the body and drops the rest", () => {
        const kept = keptHeaders({
            "Content-Type": "application/json",
            "cache-control": "public, max-age=3600",
            "content-encoding": "br",
            "content-length": "12",
            "set-cookie": "a=b",
        });
        assert.deepEqual(kept, { "content-type": "application/json", "cache-control": "public, max-age=3600" });
    });
});

describe("cache directory", () => {
    it("moves when the version changes, so a new version starts cold", () => {
        assert.notEqual(cacheDir("root", "1"), cacheDir("root", "2"));
        assert.equal(cacheDir("root", "1\n"), cacheDir("root", "1"));
    });
});

describe("game data cache", () => {
    it("fetches a URL it does not have once, then serves it from disk", async () => {
        const dir = tempDir();
        const body = Buffer.from('[{"id":1}]');
        const net = server({ status: 200, headers: { "content-type": "application/json", "x-other": "1" }, body });

        const first = await createGameDataCache({ dir, offline: false }).get(HEROES, net.fetcher(HEROES));
        const second = await createGameDataCache({ dir, offline: false }).get(HEROES, net.fetcher(HEROES));

        assert.deepEqual(net.calls, [HEROES]);
        for (const entry of [first, second]) {
            assert.equal(entry.status, 200);
            assert.deepEqual(entry.headers, { "content-type": "application/json" });
            assert.equal(entry.body.toString(), body.toString());
        }
    });

    it("makes one request for many callers that ask at the same time", async () => {
        const net = server();
        const cache = createGameDataCache({ dir: tempDir(), offline: false });
        const entries = await Promise.all(Array.from({ length: 50 }, () => cache.get(HEROES, net.fetcher(HEROES))));
        assert.equal(net.calls.length, 1);
        assert.equal(new Set(entries.map((entry) => entry.body.toString())).size, 1);
    });

    it("leaves one whole entry and no temporary file when two processes store the same URL", async () => {
        const dir = tempDir();
        const body = Buffer.alloc(512 * 1024, 7);
        const net = server({ status: 200, headers: { "content-type": "image/png" }, body });
        const caches = Array.from({ length: 8 }, () => createGameDataCache({ dir, offline: false }));

        await Promise.all(caches.map((cache) => cache.get(ICON, net.fetcher(ICON))));

        assert.deepEqual(
            readdirSync(dir).filter((name) => name !== "fetched.log"),
            [entryFile(ICON)],
        );
        assert.ok(decodeEntry(readFileSync(path.join(dir, entryFile(ICON)))).body.equals(body));
    });

    it("hands on a failed response without keeping it", async () => {
        const dir = tempDir();
        const net = server({ status: 503, headers: { "content-type": "text/plain" }, body: Buffer.from("busy") });
        const cache = createGameDataCache({ dir, offline: false });

        assert.equal((await cache.get(HEROES, net.fetcher(HEROES))).status, 503);
        assert.equal((await cache.get(HEROES, net.fetcher(HEROES))).status, 503);

        assert.equal(net.calls.length, 2);
        assert.equal(existsSync(path.join(dir, entryFile(HEROES))), false);
    });

    it("says the cache is cold and the network is needed when the fetch fails, and tries again next time", async () => {
        const dir = tempDir();
        const down = server(new Error("getaddrinfo ENOTFOUND api.deadlock-api.com"));
        const cache = createGameDataCache({ dir, offline: false });

        await assert.rejects(cache.get(HEROES, down.fetcher(HEROES)), (error) => {
            assert.match(error.message, /cache is cold/);
            assert.match(error.message, /needs the network/);
            assert.ok(error.message.includes(HEROES));
            assert.ok(error.message.includes("ENOTFOUND"));
            return true;
        });

        const up = server();
        assert.equal((await cache.get(HEROES, up.fetcher(HEROES))).status, 200);
    });

    it("fails a miss at once when offline, naming the URL, without asking the network", async () => {
        const net = server();
        const cache = createGameDataCache({ dir: tempDir(), offline: true });
        await assert.rejects(cache.get(ICON, net.fetcher(ICON)), (error) => {
            assert.match(error.message, /E2E_OFFLINE/);
            assert.ok(error.message.includes(ICON));
            return true;
        });
        assert.deepEqual(net.calls, []);
    });

    it("serves what it has when offline", async () => {
        const dir = tempDir();
        const net = server();
        await createGameDataCache({ dir, offline: false }).get(HEROES, net.fetcher(HEROES));
        const entry = await createGameDataCache({ dir, offline: true }).get(HEROES, net.fetcher(HEROES));
        assert.equal(entry.body.toString(), "[]");
        assert.equal(net.calls.length, 1);
    });

    it("lists each URL it took from the network once", async () => {
        const dir = tempDir();
        const net = server();
        const cache = createGameDataCache({ dir, offline: false });
        await cache.get(HEROES, net.fetcher(HEROES));
        await cache.get(HEROES, net.fetcher(HEROES));
        await cache.get(ICON, net.fetcher(ICON));
        assert.deepEqual(readFileSync(path.join(dir, "fetched.log"), "utf8").trim().split("\n"), [HEROES, ICON]);
    });

    it("is empty after a clear", async () => {
        const root = tempDir();
        const dir = cacheDir(root, "1");
        const net = server();
        await createGameDataCache({ dir, offline: false }).get(HEROES, net.fetcher(HEROES));

        clearGameDataCache(root);

        assert.equal(existsSync(root), false);
        await createGameDataCache({ dir, offline: false }).get(HEROES, net.fetcher(HEROES));
        assert.equal(net.calls.length, 2);
    });
});
