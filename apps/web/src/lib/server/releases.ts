import type { Fetcher } from "@deadlock-plus/analytics";
import { REPO_URL } from "@deadlock-plus/links/urls";

export interface Release {
    version: string;
    date: string;
    windows?: string;
    appImage?: string;
    deb?: string;
}

export interface ReleaseCache {
    match(key: string): Promise<Response | undefined>;
    put(key: string, response: Response): Promise<unknown>;
}

export const RELEASES_API = "https://api.github.com/repos/deadlock-plus/deadlock-plus/releases?per_page=30";

const CACHE_SECONDS = 600;
const TIMEOUT_MS = 4000;
const DOWNLOAD_PREFIX = `${REPO_URL}/releases/download/`;
const SUFFIXES = [
    ["windows", "-setup.exe"],
    ["appImage", ".AppImage"],
    ["deb", ".deb"],
] as const;

function parseRelease(row: unknown): Release | null {
    if (typeof row !== "object" || row === null) return null;
    const { tag_name, draft, prerelease, published_at, assets } = row as Record<string, unknown>;
    if (draft === true || prerelease === true) return null;
    if (typeof tag_name !== "string" || typeof published_at !== "string") return null;

    const version = /^v(\d+\.\d+\.\d+)$/.exec(tag_name)?.[1];
    if (!version) return null;

    const release: Release = { version, date: published_at };
    for (const item of Array.isArray(assets) ? assets : []) {
        const url = (item as { browser_download_url?: unknown } | null)?.browser_download_url;
        if (typeof url !== "string" || !url.startsWith(DOWNLOAD_PREFIX)) continue;
        const kind = SUFFIXES.find(([, suffix]) => url.endsWith(suffix))?.[0];
        if (kind) release[kind] ??= url;
    }
    return release;
}

function newestFirst(a: Release, b: Release): number {
    const left = a.version.split(".").map(Number);
    const right = b.version.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        const difference = (right[i] ?? 0) - (left[i] ?? 0);
        if (difference !== 0) return difference;
    }
    return 0;
}

export function parseReleases(body: unknown): Release[] {
    if (!Array.isArray(body)) return [];
    return body
        .map(parseRelease)
        .filter((release) => release !== null)
        .sort(newestFirst);
}

async function fromGitHub(fetcher: Fetcher): Promise<Release[] | null> {
    const response = await fetcher(RELEASES_API, {
        headers: { accept: "application/vnd.github+json", "user-agent": "deadlock-plus-website" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
        console.error(`GitHub refused the release list: ${response.status}`);
        return null;
    }
    return parseReleases(await response.json());
}

/**
 * Never throws: the download page falls back to a link to GitHub when this returns an empty list.
 * Only a list that parsed to at least one release is cached, so a failure is retried on the next visit.
 */
export async function loadReleases(fetcher: Fetcher = fetch, cache?: ReleaseCache): Promise<Release[]> {
    try {
        const hit = await cache?.match(RELEASES_API);
        if (hit) return parseCached(await hit.json());
    } catch {
        // A cache that cannot be read is the same as an empty one.
    }

    let releases: Release[] | null;
    try {
        releases = await fromGitHub(fetcher);
    } catch {
        console.error("Request to GitHub for the release list failed");
        return [];
    }
    if (!releases?.length) return [];

    try {
        await cache?.put(
            RELEASES_API,
            Response.json(releases, { headers: { "cache-control": `public, max-age=${CACHE_SECONDS}` } }),
        );
    } catch {
        // The page is still served; the next visit asks GitHub again.
    }
    return releases;
}

function parseCached(body: unknown): Release[] {
    return Array.isArray(body) ? (body as Release[]) : [];
}
