import { describe, expect, it, vi } from "vitest";
import { REPO_URL } from "@deadlock-plus/links/urls";
import { loadReleases, parseReleases, RELEASES_API, type Release, type ReleaseCache } from "./releases";

function asset(version: string, name: string) {
    return { name, browser_download_url: `${REPO_URL}/releases/download/v${version}/${name}` };
}

function release(version: string, publishedAt: string, names: string[], extra: Record<string, unknown> = {}) {
    return {
        tag_name: `v${version}`,
        draft: false,
        prerelease: false,
        published_at: publishedAt,
        assets: names.map((name) => asset(version, name)),
        ...extra,
    };
}

const WINDOWS_ONLY = release("0.10.0", "2026-10-01T10:00:00Z", [
    "Deadlock-Plus_0.10.0_x64-setup.exe",
    "Deadlock-Plus_0.10.0_x64-setup.exe.sig",
    "latest.json",
]);
const WITH_LINUX = release("0.11.0", "2026-10-12T18:30:00Z", [
    "Deadlock-Plus_0.11.0_amd64.AppImage",
    "Deadlock-Plus_0.11.0_amd64.AppImage.sig",
    "Deadlock-Plus_0.11.0_amd64.deb",
    "Deadlock-Plus_0.11.0_x64-setup.exe",
]);

function memoryCache(): ReleaseCache & { stored: Map<string, Response> } {
    const stored = new Map<string, Response>();
    return {
        stored,
        match: async (key) => stored.get(key)?.clone(),
        put: async (key, response) => void stored.set(key, response),
    };
}

describe("parseReleases", () => {
    it("reads the version, the date and each installer's own URL", () => {
        expect(parseReleases([WITH_LINUX])).toEqual<Release[]>([
            {
                version: "0.11.0",
                date: "2026-10-12T18:30:00Z",
                windows: `${REPO_URL}/releases/download/v0.11.0/Deadlock-Plus_0.11.0_x64-setup.exe`,
                appImage: `${REPO_URL}/releases/download/v0.11.0/Deadlock-Plus_0.11.0_amd64.AppImage`,
                deb: `${REPO_URL}/releases/download/v0.11.0/Deadlock-Plus_0.11.0_amd64.deb`,
            },
        ]);
    });

    it("leaves out a file the release does not have", () => {
        const [parsed] = parseReleases([WINDOWS_ONLY]);
        expect(parsed).toEqual({
            version: "0.10.0",
            date: "2026-10-01T10:00:00Z",
            windows: `${REPO_URL}/releases/download/v0.10.0/Deadlock-Plus_0.10.0_x64-setup.exe`,
        });
    });

    it("puts the newest version first, comparing numbers and not text", () => {
        const versions = parseReleases([
            release("0.9.0", "2026-09-20T10:00:00Z", ["Deadlock-Plus_0.9.0_x64-setup.exe"]),
            WITH_LINUX,
            WINDOWS_ONLY,
        ]).map((r) => r.version);
        expect(versions).toEqual(["0.11.0", "0.10.0", "0.9.0"]);
    });

    it("skips drafts and prereleases", () => {
        const rows = [
            release("0.13.0", "2026-10-13T10:00:00Z", ["Deadlock-Plus_0.13.0_x64-setup.exe"], { draft: true }),
            release("0.12.0", "2026-10-13T09:00:00Z", ["Deadlock-Plus_0.12.0_x64-setup.exe"], { prerelease: true }),
            WITH_LINUX,
        ];
        expect(parseReleases(rows).map((r) => r.version)).toEqual(["0.11.0"]);
    });

    it("ignores an asset hosted anywhere but this project's releases", () => {
        const row = release("0.11.0", "2026-10-12T18:30:00Z", []);
        row.assets = [{ name: "x-setup.exe", browser_download_url: "https://example.com/x-setup.exe" }];
        expect(parseReleases([row])[0]?.windows).toBeUndefined();
    });

    it("returns nothing for a body that is not a release list", () => {
        expect(parseReleases({ message: "API rate limit exceeded" })).toEqual([]);
        expect(parseReleases(null)).toEqual([]);
        expect(parseReleases([null, "x", { tag_name: 5 }, { tag_name: "nightly", assets: [] }])).toEqual([]);
    });
});

describe("loadReleases", () => {
    it("asks GitHub with a User-Agent and nothing about the visitor", async () => {
        const fetcher = vi.fn(async () => Response.json([WITH_LINUX, WINDOWS_ONLY]));
        const releases = await loadReleases(fetcher);

        expect(releases.map((r) => r.version)).toEqual(["0.11.0", "0.10.0"]);
        const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe(RELEASES_API);
        const headers = new Headers(init.headers);
        expect(headers.get("user-agent")).toBeTruthy();
        expect([...headers.keys()].sort()).toEqual(["accept", "user-agent"]);
    });

    it("returns an empty list when the request throws", async () => {
        const fetcher = vi.fn(async () => {
            throw new Error("network down");
        });
        expect(await loadReleases(fetcher)).toEqual([]);
    });

    it("returns an empty list when GitHub refuses or rate limits", async () => {
        for (const status of [403, 429, 500]) {
            const fetcher = vi.fn(async () => Response.json({ message: "rate limit" }, { status }));
            expect(await loadReleases(fetcher)).toEqual([]);
        }
    });

    it("returns an empty list when the body is not JSON", async () => {
        expect(await loadReleases(async () => new Response("<html>"))).toEqual([]);
    });

    it("answers from the cache without asking GitHub again", async () => {
        const cache = memoryCache();
        const fetcher = vi.fn(async () => Response.json([WITH_LINUX]));

        const first = await loadReleases(fetcher, cache);
        const second = await loadReleases(fetcher, cache);

        expect(fetcher).toHaveBeenCalledOnce();
        expect(second).toEqual(first);
        expect(cache.stored.get(RELEASES_API)?.headers.get("cache-control")).toBe("public, max-age=600");
    });

    it("does not cache a failure", async () => {
        const cache = memoryCache();
        await loadReleases(async () => new Response(null, { status: 403 }), cache);
        expect(cache.stored.size).toBe(0);
    });

    it("still answers when the cache itself throws", async () => {
        const broken: ReleaseCache = {
            match: async () => {
                throw new Error("no cache here");
            },
            put: async () => {
                throw new Error("no cache here");
            },
        };
        const releases = await loadReleases(async () => Response.json([WITH_LINUX]), broken);
        expect(releases.map((r) => r.version)).toEqual(["0.11.0"]);
    });
});
