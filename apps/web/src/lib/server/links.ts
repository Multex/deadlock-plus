import type { Store } from "@deadlock-plus/costs";
import { DEFAULT_LINKS, LINKS_KEY, parseLinks, type Links } from "@deadlock-plus/links";

const TTL_MS = 60_000;

let cached: { at: number; links: Links } | null = null;

/**
 * The invite and landing table staff edit from Discord. A missing, broken or unreadable table falls back to the
 * built-in list, so a bad edit or a KV outage never breaks a link.
 */
export async function loadLinks(store: Pick<Store, "get"> | undefined, now = Date.now()): Promise<Links> {
    if (cached && now - cached.at < TTL_MS) return cached.links;
    let links = DEFAULT_LINKS;
    if (store) {
        try {
            const raw = await store.get(LINKS_KEY);
            const parsed = parseLinks(raw);
            if (raw !== null && !parsed) console.error("The stored links table does not parse; using the built-in one");
            links = parsed ?? DEFAULT_LINKS;
        } catch {
            console.error("Reading the links table failed; using the built-in one");
        }
    }
    cached = { at: now, links };
    return links;
}

export function resetLinks(): void {
    cached = null;
}
