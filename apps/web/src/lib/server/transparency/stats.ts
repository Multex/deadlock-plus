import type { Fetcher } from "@deadlock-plus/analytics";
import type { Store } from "./store";

export interface StatsEnv {
    /** A personal API key limited to `query:read` on the Deadlock+ project. */
    POSTHOG_PERSONAL_KEY?: string;
    POSTHOG_PROJECT_ID?: string;
    POSTHOG_API_HOST?: string;
    /** Optional. Without it GitHub's anonymous limit is shared with every other site on Cloudflare's addresses. */
    GITHUB_TOKEN?: string;
    DISCORD_BOT_TOKEN?: string;
    DISCORD_GUILD_ID?: string;
}

export interface Stat {
    value: number;
    at: string;
}

export interface Stats {
    installs?: Stat;
    monthlyActive?: Stat;
    downloads?: Stat;
    discordMembers?: Stat;
}

export const STATS_KEY = "stats";

const TIMEOUT_MS = 10_000;
const RELEASES_PAGE = 100;
const MAX_PAGES = 10;
const INSTALLER = /(-setup\.exe|\.msi|\.AppImage|\.deb)$/;

// Every running app sends `app_started` once and `heartbeat` every 30 minutes under its install ID.
const USERS_QUERY = `
SELECT
    count(DISTINCT distinct_id),
    count(DISTINCT if(timestamp >= now() - INTERVAL 30 DAY, distinct_id, NULL))
FROM events
WHERE event IN ('app_started', 'heartbeat')
    AND timestamp >= toDateTime('2026-01-01 00:00:00')`;

function isCount(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

async function appUsers(env: StatsEnv, fetcher: Fetcher): Promise<{ installs: number; monthlyActive: number } | null> {
    if (!env.POSTHOG_PERSONAL_KEY || !env.POSTHOG_PROJECT_ID) return null;
    const host = env.POSTHOG_API_HOST ?? "https://eu.posthog.com";
    const response = await fetcher(`${host}/api/projects/${env.POSTHOG_PROJECT_ID}/query/`, {
        method: "POST",
        headers: { authorization: `Bearer ${env.POSTHOG_PERSONAL_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ query: { kind: "HogQLQuery", query: USERS_QUERY } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
        console.error(`PostHog refused the user count: ${response.status}`);
        return null;
    }
    const row = ((await response.json()) as { results?: unknown[][] }).results?.[0];
    const [installs, monthlyActive] = row ?? [];
    return isCount(installs) && isCount(monthlyActive) ? { installs, monthlyActive } : null;
}

/** The updater fetches `latest.json` on every launch and signatures on every update, so only installers count. */
export function countDownloads(releases: unknown[]): number {
    let total = 0;
    for (const release of releases) {
        const assets = (release as { assets?: unknown } | null)?.assets;
        if (!Array.isArray(assets)) continue;
        for (const asset of assets) {
            const { name, download_count } = (asset ?? {}) as { name?: unknown; download_count?: unknown };
            if (typeof name === "string" && INSTALLER.test(name) && isCount(download_count)) total += download_count;
        }
    }
    return total;
}

async function downloads(env: StatsEnv, fetcher: Fetcher): Promise<number | null> {
    const headers: Record<string, string> = {
        accept: "application/vnd.github+json",
        "user-agent": "deadlock-plus-website",
    };
    if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;

    const releases: unknown[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
        const response = await fetcher(
            `https://api.github.com/repos/deadlock-plus/deadlock-plus/releases?per_page=${RELEASES_PAGE}&page=${page}`,
            { headers, signal: AbortSignal.timeout(TIMEOUT_MS) },
        );
        if (!response.ok) {
            console.error(`GitHub refused the release list: ${response.status}`);
            return null;
        }
        const body: unknown = await response.json();
        if (!Array.isArray(body)) return null;
        releases.push(...body);
        if (body.length < RELEASES_PAGE) break;
    }
    return countDownloads(releases);
}

async function discordMembers(env: StatsEnv, fetcher: Fetcher): Promise<number | null> {
    if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return null;
    const response = await fetcher(`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}?with_counts=true`, {
        headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
        console.error(`Discord refused the server info: ${response.status}`);
        return null;
    }
    const count = ((await response.json()) as { approximate_member_count?: unknown }).approximate_member_count;
    return isCount(count) ? count : null;
}

async function settle<T>(source: string, read: () => Promise<T | null>): Promise<T | null> {
    try {
        return await read();
    } catch {
        console.error(`Request for the ${source} count failed`);
        return null;
    }
}

export async function loadStats(store: Store): Promise<Stats> {
    try {
        const body: unknown = JSON.parse((await store.get(STATS_KEY)) ?? "{}");
        return typeof body === "object" && body !== null ? (body as Stats) : {};
    } catch {
        return {};
    }
}

/** A source that fails keeps its last stored number and time, so the page shows how old each number is. */
export async function refreshStats(
    env: StatsEnv,
    store: Store,
    fetcher: Fetcher = fetch,
    now = new Date(),
): Promise<void> {
    const [users, installers, members] = await Promise.all([
        settle("user", () => appUsers(env, fetcher)),
        settle("download", () => downloads(env, fetcher)),
        settle("Discord member", () => discordMembers(env, fetcher)),
    ]);
    const at = now.toISOString();
    const fresh = (value: number | undefined | null): Stat | undefined => (isCount(value) ? { value, at } : undefined);

    const stats = await loadStats(store);
    const next: Stats = {
        installs: fresh(users?.installs) ?? stats.installs,
        monthlyActive: fresh(users?.monthlyActive) ?? stats.monthlyActive,
        downloads: fresh(installers) ?? stats.downloads,
        discordMembers: fresh(members) ?? stats.discordMembers,
    };
    await store.put(STATS_KEY, JSON.stringify(next));
}
