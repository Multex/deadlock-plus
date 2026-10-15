import type { Fetcher } from "@deadlock-plus/analytics";

export interface PostHogQueryEnv {
    /** A personal API key limited to `query:read` on the Deadlock+ project. */
    POSTHOG_PERSONAL_KEY?: string;
    POSTHOG_PROJECT_ID?: string;
    POSTHOG_API_HOST?: string;
}

export interface Joins {
    day: number;
    week: number;
    month: number;
}

const WINDOWS = { day: 1, week: 7, month: 30 } as const;

// `uses` is Discord's running total per code, snapshotted hourly: joins in a window are the live total minus the last
// total before the window. With no snapshot that old (NULL), the earliest one stands in, so a window older than the
// snapshots counts joins since they began, not every join the code ever had.
const QUERY = `
SELECT
    properties.code,
    argMin(toInt(properties.uses), timestamp),
${Object.values(WINDOWS)
    .map((days) => `    argMaxIf(toInt(properties.uses), timestamp, timestamp <= now() - INTERVAL ${days} DAY)`)
    .join(",\n")}
FROM events
WHERE event = 'discord_invite_uses' AND timestamp > now() - INTERVAL 31 DAY
GROUP BY properties.code
LIMIT 1000`;

/** Joins per live code over the last day, week and month; `null` when PostHog cannot be asked. */
export async function joinsByCode(
    env: PostHogQueryEnv,
    live: ReadonlyMap<string, number>,
    fetcher: Fetcher = fetch,
): Promise<Map<string, Joins> | null> {
    if (!env.POSTHOG_PERSONAL_KEY || !env.POSTHOG_PROJECT_ID) return null;
    const host = env.POSTHOG_API_HOST ?? "https://eu.posthog.com";
    let rows: unknown[][];
    try {
        const response = await fetcher(`${host}/api/projects/${env.POSTHOG_PROJECT_ID}/query/`, {
            method: "POST",
            headers: { authorization: `Bearer ${env.POSTHOG_PERSONAL_KEY}`, "content-type": "application/json" },
            body: JSON.stringify({ query: { kind: "HogQLQuery", query: QUERY } }),
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
            console.error(`PostHog refused the join counts: ${response.status}`);
            return null;
        }
        rows = ((await response.json()) as { results?: unknown[][] }).results ?? [];
    } catch {
        console.error("Request for the join counts failed");
        return null;
    }

    const before = new Map(rows.map((row) => [String(row[0]), row.slice(1)]));
    const joins = new Map<string, Joins>();
    for (const [code, uses] of live) {
        const [earliest, ...totals] = before.get(code) ?? [];
        const since = (index: number) => uses - Number(totals[index] ?? earliest ?? 0);
        joins.set(code, { day: since(0), week: since(1), month: since(2) });
    }
    return joins;
}
