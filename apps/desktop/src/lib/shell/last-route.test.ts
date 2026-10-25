import { describe, expect, it, vi } from "vitest";
import {
    claimLaunch,
    firstCallOnly,
    knownPaths,
    launchCheck,
    launchRestoreTarget,
    routeToRestore,
    routeToSave,
} from "./last-route";

describe("firstCallOnly", () => {
    it("answers only the first call, so the load that follows the redirect does not redirect again", async () => {
        const restore = vi.fn(() => Promise.resolve("/stats"));
        const once = firstCallOnly(restore);
        await expect(once()).resolves.toBe("/stats");
        await expect(once()).resolves.toBeNull();
        await expect(once()).resolves.toBeNull();
        expect(restore).toHaveBeenCalledOnce();
    });
});

describe("launchRestoreTarget", () => {
    const deps = (overrides: Partial<Parameters<typeof launchRestoreTarget>[0]> = {}) => ({
        launch: true,
        hidden: () => Promise.resolve(false),
        target: () => Promise.resolve("/stats"),
        waitMs: 1500,
        ...overrides,
    });

    it("gives the saved route on a shown launch", async () => {
        await expect(launchRestoreTarget(deps())).resolves.toBe("/stats");
    });

    it("leaves a reload where it is", async () => {
        const target = vi.fn(() => Promise.resolve("/stats"));
        await expect(launchRestoreTarget(deps({ launch: false, target }))).resolves.toBeNull();
        expect(target).not.toHaveBeenCalled();
    });

    it("leaves a hidden launch to restore when the window is first shown", async () => {
        const target = vi.fn(() => Promise.resolve("/stats"));
        await expect(launchRestoreTarget(deps({ hidden: () => Promise.resolve(true), target }))).resolves.toBeNull();
        expect(target).not.toHaveBeenCalled();
    });

    it("stops waiting for a slow store so the first page is not held back", async () => {
        vi.useFakeTimers();
        try {
            const result = launchRestoreTarget(deps({ target: () => new Promise(() => {}) }));
            await vi.advanceTimersByTimeAsync(1500);
            await expect(result).resolves.toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it("treats a failing store or command as nothing to restore", async () => {
        await expect(launchRestoreTarget(deps({ target: () => Promise.reject(new Error("kv")) }))).resolves.toBeNull();
        await expect(launchRestoreTarget(deps({ hidden: () => Promise.reject(new Error("ipc")) }))).resolves.toBe(
            "/stats",
        );
    });
});

function memoryStorage() {
    const items = new Map<string, string>();
    return {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => void items.set(key, value),
    };
}

describe("claimLaunch", () => {
    it("treats the first load of a webview session as the launch", () => {
        expect(claimLaunch(memoryStorage())).toBe(true);
    });

    it("treats a reload or an HMR re-run in the same session as no launch", () => {
        const session = memoryStorage();
        claimLaunch(session);
        expect(claimLaunch(session)).toBe(false);
        expect(claimLaunch(session)).toBe(false);
    });

    it("falls back to a launch when session storage is missing or throws", () => {
        expect(claimLaunch(null)).toBe(true);
        const broken = {
            getItem: () => {
                throw new Error("denied");
            },
            setItem: () => {
                throw new Error("denied");
            },
        };
        expect(claimLaunch(broken)).toBe(true);
    });
});

describe("launchCheck", () => {
    it("gives every startup step of one page load the same answer", () => {
        const session = memoryStorage();
        const isLaunch = launchCheck(() => session);
        expect(isLaunch()).toBe(true);
        expect(isLaunch()).toBe(true);
    });

    it("answers no launch after a reload of the same session", () => {
        const session = memoryStorage();
        launchCheck(() => session)();
        const afterReload = launchCheck(() => session);
        expect(afterReload()).toBe(false);
        expect(afterReload()).toBe(false);
    });
});

describe("routeToSave", () => {
    it("keeps the path and the query", () => {
        expect(routeToSave({ pathname: "/stats", search: "?hero=12" })).toBe("/stats?hero=12");
        expect(routeToSave({ pathname: "/", search: "" })).toBe("/");
    });

    it("skips the onboarding flow", () => {
        expect(routeToSave({ pathname: "/onboarding", search: "" })).toBeNull();
        expect(routeToSave({ pathname: "/onboarding/", search: "?step=2" })).toBeNull();
    });

    it("saves the builds list instead of the editor, whose draft or new build may be gone by the next launch", () => {
        expect(routeToSave({ pathname: "/builds/edit", search: "?source=draft&id=4" })).toBe("/builds");
        expect(routeToSave({ pathname: "/builds/edit", search: "?new=12" })).toBe("/builds");
        expect(routeToSave({ pathname: "/builds/view", search: "?id=7" })).toBe("/builds/view?id=7");
    });
});

describe("knownPaths", () => {
    it("turns route files into paths without route groups", () => {
        const paths = knownPaths([
            "/src/routes/(app)/+page.svelte",
            "/src/routes/(app)/stats/+page.svelte",
            "/src/routes/(settings)/settings/general/+page.svelte",
        ]);

        expect([...paths].sort()).toEqual(["/", "/settings/general", "/stats"]);
    });
});

describe("routeToRestore", () => {
    const known = new Set(["/", "/stats", "/settings/general", "/onboarding"]);
    const base = { stored: "/stats?hero=12", launchPath: "/", onboardingPending: false, known };

    it("restores the saved route", () => {
        expect(routeToRestore(base)).toBe("/stats?hero=12");
    });

    it("waits out an unfinished onboarding", () => {
        expect(routeToRestore({ ...base, onboardingPending: true })).toBeNull();
    });

    it("leaves a launch that already points somewhere alone", () => {
        expect(routeToRestore({ ...base, launchPath: "/settings/general" })).toBeNull();
    });

    it("has nothing to do without a saved route or on home", () => {
        expect(routeToRestore({ ...base, stored: null })).toBeNull();
        expect(routeToRestore({ ...base, stored: "/" })).toBeNull();
        expect(routeToRestore({ ...base, stored: 5 })).toBeNull();
    });

    it("stays home when the saved route no longer exists", () => {
        expect(routeToRestore({ ...base, stored: "/gone" })).toBeNull();
        expect(routeToRestore({ ...base, stored: "//evil.example/stats" })).toBeNull();
    });

    it("restores a dynamic route that matches a pattern", () => {
        const dynamic = new Set(["/", "/match-history/[id]", "/settings/[category=category]", "/docs/[...rest]"]);
        const input = { ...base, known: dynamic };
        expect(routeToRestore({ ...input, stored: "/match-history/123?tab=x" })).toBe("/match-history/123?tab=x");
        expect(routeToRestore({ ...input, stored: "/settings/general" })).toBe("/settings/general");
        expect(routeToRestore({ ...input, stored: "/docs/a/b" })).toBe("/docs/a/b");
        expect(routeToRestore({ ...input, stored: "/docs" })).toBe("/docs");
    });

    it("does not let a pattern match a different depth or an empty segment", () => {
        const dynamic = new Set(["/", "/match-history/[id]"]);
        const input = { ...base, known: dynamic };
        expect(routeToRestore({ ...input, stored: "/match-history/1/2" })).toBeNull();
        expect(routeToRestore({ ...input, stored: "/match-history/" })).toBeNull();
        expect(routeToRestore({ ...input, stored: "/other/1" })).toBeNull();
    });

    it("opens the builds list for an editor route saved earlier", () => {
        const withBuilds = { ...base, known: new Set([...known, "/builds", "/builds/edit"]) };
        expect(routeToRestore({ ...withBuilds, stored: "/builds/edit?source=draft&id=4" })).toBe("/builds");
        expect(routeToRestore({ ...withBuilds, stored: "/builds/edit?new=12" })).toBe("/builds");
    });

    it("never restores into onboarding", () => {
        expect(routeToRestore({ ...base, stored: "/onboarding" })).toBeNull();
    });

    it("opens the notification the app was started from instead of the saved route", () => {
        const withAlerts = { ...base, known: new Set([...known, "/alerts"]) };
        expect(routeToRestore({ ...withAlerts, launchRoute: "/alerts" })).toBe("/alerts");
        expect(routeToRestore({ ...withAlerts, stored: null, launchRoute: "/alerts" })).toBe("/alerts");
    });

    it("lets an unfinished onboarding beat the launch route", () => {
        const withAlerts = { ...base, known: new Set([...known, "/alerts"]) };
        expect(routeToRestore({ ...withAlerts, onboardingPending: true, launchRoute: "/alerts" })).toBeNull();
    });

    it("ignores a launch route that is not a page", () => {
        expect(routeToRestore({ ...base, launchRoute: "/gone" })).toBe("/stats?hero=12");
        expect(routeToRestore({ ...base, launchRoute: "//evil.example/stats" })).toBe("/stats?hero=12");
        expect(routeToRestore({ ...base, launchRoute: "/onboarding" })).toBe("/stats?hero=12");
        expect(routeToRestore({ ...base, launchRoute: 5 })).toBe("/stats?hero=12");
    });
});
