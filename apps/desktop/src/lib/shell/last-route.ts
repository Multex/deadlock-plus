const ONBOARDING = "/onboarding";

const isOnboarding = (pathname: string) => pathname === ONBOARDING || pathname.startsWith(`${ONBOARDING}/`);

const LAUNCH_MARK = "last-route:launch-handled";

type SessionStore = Pick<Storage, "getItem" | "setItem">;

/**
 * True only for the first page load of this webview. Session storage survives a reload and an HMR re-run of the
 * startup code, but a new app process starts with it empty, so only a real launch gets the saved route.
 */
export function claimLaunch(storage: SessionStore | null): boolean {
    if (!storage) return true;
    try {
        if (storage.getItem(LAUNCH_MARK) !== null) return false;
        storage.setItem(LAUNCH_MARK, "1");
    } catch {
        // Without session storage a reload cannot be told apart from a launch.
    }
    return true;
}

/** Claims once per page load, so every startup step of one load gets the same answer. */
export function launchCheck(storage: () => SessionStore | null): () => boolean {
    let launch: boolean | undefined;
    return () => (launch ??= claimLaunch(storage()));
}

function sessionStore(): Storage | null {
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

/** Whether this page load is the app's launch rather than a reload or an HMR re-run. */
export const isLaunch = launchCheck(sessionStore);

// The editor's draft or new build can be gone by the next launch, which would reopen it as "missing" or blank.
const EDITOR = "/builds/edit";
const EDITOR_FALLBACK = "/builds";

const isEditor = (pathname: string) => pathname === EDITOR || pathname.startsWith(`${EDITOR}/`);

export function routeToSave(url: { pathname: string; search: string }): string | null {
    if (isOnboarding(url.pathname)) return null;
    return isEditor(url.pathname) ? EDITOR_FALLBACK : url.pathname + url.search;
}

/** Paths of the app's pages, from the keys of a glob over `+page.svelte` files. Route groups do not appear in URLs. */
export function knownPaths(pageFiles: string[]): Set<string> {
    return new Set(
        pageFiles.map((file) => {
            const path = file
                .replace(/^.*?\/routes/, "")
                .replace(/\/\+page\.svelte$/, "")
                .replace(/\/\([^/]+\)/g, "");
            return path === "" ? "/" : path;
        }),
    );
}

function matchesPattern(pattern: string, pathname: string): boolean {
    const want = pattern.split("/");
    const have = pathname.split("/");
    for (let i = 0; i < want.length; i++) {
        const part = want[i]!;
        if (/^\[\.\.\.[^\]]+\]$/.test(part)) return i === want.length - 1 && have.slice(i).every(Boolean);
        if (i >= have.length) return false;
        if (/^\[\[?[^\]]+\]\]?$/.test(part)) {
            if (!have[i]) return false;
        } else if (part !== have[i]) {
            return false;
        }
    }
    return want.length === have.length;
}

/** Page paths may carry `[param]`, `[param=matcher]` and `[...rest]` segments; those match any non-empty segment. */
function isKnown(known: Set<string>, pathname: string): boolean {
    if (known.has(pathname)) return true;
    for (const pattern of known) if (pattern.includes("[") && matchesPattern(pattern, pathname)) return true;
    return false;
}

export interface RestoreInput {
    stored: unknown;
    /** From `take_launch_route`: the page of the notification the app was started from. */
    launchRoute?: unknown;
    launchPath: string;
    onboardingPending: boolean;
    known: Set<string>;
}

function restorable(route: unknown, known: Set<string>): string | null {
    if (typeof route !== "string" || !route.startsWith("/") || route.startsWith("//")) return null;
    const pathname = route.split(/[?#]/, 1)[0]!;
    if (isEditor(pathname)) return isKnown(known, EDITOR_FALLBACK) ? EDITOR_FALLBACK : null;
    if (pathname === "/" || isOnboarding(pathname) || !isKnown(known, pathname)) return null;
    return route;
}

export function routeToRestore({
    stored,
    launchRoute,
    launchPath,
    onboardingPending,
    known,
}: RestoreInput): string | null {
    if (onboardingPending || launchPath !== "/") return null;
    return restorable(launchRoute, known) ?? restorable(stored, known);
}
