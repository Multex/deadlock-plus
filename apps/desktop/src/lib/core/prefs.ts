export const PREF_KEYS = {
    sidebarCollapsed: "deadlock-plus:sidebar-collapsed",
    sidebarToolsOpen: "deadlock-plus:sidebar-tools-open",
    heroCache: "deadlock-plus:heroes",
    launchCount: "deadlock-plus:launch-count",
    language: "deadlock-plus:language",
    updateFirstSeen: "deadlock-plus:update-first-seen",
    logAutoScroll: "deadlock-plus:log-auto-scroll",
    logMinLevel: "deadlock-plus:log-min-level",
} as const;

export type PrefKey = keyof typeof PREF_KEYS;

function getString(key: PrefKey): string | null;
function getString(key: PrefKey, fallback: string): string;
function getString(key: PrefKey, fallback: string | null = null): string | null {
    try {
        return localStorage.getItem(PREF_KEYS[key]) ?? fallback;
    } catch {
        return fallback;
    }
}

function setString(key: PrefKey, value: string): void {
    try {
        localStorage.setItem(PREF_KEYS[key], value);
    } catch {
        // Storage can be unavailable; the value just won't persist.
    }
}

export const prefs = {
    getString,
    setString,
    getBool(key: PrefKey, fallback: boolean): boolean {
        const raw = getString(key);
        return raw === null ? fallback : raw === "1";
    },
    setBool(key: PrefKey, value: boolean): void {
        setString(key, value ? "1" : "0");
    },
};
