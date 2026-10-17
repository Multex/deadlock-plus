const ONBOARDING = "/onboarding";

const isOnboarding = (pathname: string) => pathname === ONBOARDING || pathname.startsWith(`${ONBOARDING}/`);

export function routeToSave(url: { pathname: string; search: string }): string | null {
    return isOnboarding(url.pathname) ? null : url.pathname + url.search;
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
