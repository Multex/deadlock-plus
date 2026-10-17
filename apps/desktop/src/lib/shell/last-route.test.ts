import { describe, expect, it } from "vitest";
import { knownPaths, routeToRestore, routeToSave } from "./last-route";

describe("routeToSave", () => {
    it("keeps the path and the query", () => {
        expect(routeToSave({ pathname: "/stats", search: "?hero=12" })).toBe("/stats?hero=12");
        expect(routeToSave({ pathname: "/", search: "" })).toBe("/");
    });

    it("skips the onboarding flow", () => {
        expect(routeToSave({ pathname: "/onboarding", search: "" })).toBeNull();
        expect(routeToSave({ pathname: "/onboarding/", search: "?step=2" })).toBeNull();
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
