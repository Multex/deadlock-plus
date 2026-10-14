export type InstallSource = "banner" | "toast" | "about";

/** Showing the window often comes in bursts (alt-tab, tray clicks); one check per burst is enough. */
export const RECHECK_ON_SHOW_MIN_MS = 10 * 60 * 1000;
/** The toast covers the first day; after that a skipped update gets a banner that keeps coming back. */
export const BANNER_AFTER_MS = 24 * 60 * 60 * 1000;

export interface FirstSeenStore {
    get(): string | null;
    set(value: string): void;
}

interface FirstSeen {
    version: string;
    at: number;
}

export function shouldRecheckOnShow(lastCheckAt: number | null, now: number): boolean {
    return lastCheckAt === null || now - lastCheckAt >= RECHECK_ON_SHOW_MIN_MS;
}

function readFirstSeen(store: FirstSeenStore): FirstSeen | null {
    try {
        const parsed = JSON.parse(store.get() ?? "null") as Partial<FirstSeen> | null;
        return typeof parsed?.version === "string" && typeof parsed.at === "number"
            ? { version: parsed.version, at: parsed.at }
            : null;
    } catch {
        return null;
    }
}

export function firstSeenAt(store: FirstSeenStore, version: string, now: number): number {
    const stored = readFirstSeen(store);
    if (stored?.version === version) return stored.at;
    store.set(JSON.stringify({ version, at: now } satisfies FirstSeen));
    return now;
}

export function bannerDue(firstSeen: number, now: number): boolean {
    return now - firstSeen > BANNER_AFTER_MS;
}

export function createShownTracker(send: (version: string) => void): (version: string) => void {
    const sent = new Set<string>();
    return (version) => {
        if (sent.has(version)) return;
        sent.add(version);
        send(version);
    };
}
