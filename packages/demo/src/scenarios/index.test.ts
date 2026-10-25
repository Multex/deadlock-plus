import { describe, expect, it } from "vitest";
import { scenarioFactory, scenarios, selectScenarioId } from "./index";

const OPTIONS = { appVersion: "1.2.3", changelog: "# Changelog\n", mapItemsTsv: "" };

describe("scenario registry", () => {
    it("holds every scenario under its own id", () => {
        const ids = [
            "default",
            "new-user",
            "live-match",
            "offline",
            "api-down",
            "update-available",
            "post-match",
            "dispatch",
            "dispatch-specials",
            "unelevated",
            "unelevated-game-admin",
            "recovery-missing",
            "recovery-running",
            "recovery-paused",
            "recovery-limit",
            "recovery-gc-off",
            "recovery-replays",
            "recovery-game-open",
            "recovery-replay-run",
        ];
        expect(Object.keys(scenarios)).toEqual(ids);
        for (const id of ids) expect(scenarios[id]!(OPTIONS).id).toBe(id);
        expect(scenarioFactory("default")).toBe(scenarios.default);
    });

    it("fails loudly on an id it does not know, and names the ones it does", () => {
        expect(() => scenarioFactory("nope")).toThrow(
            '[demo] unknown scenario "nope" (known: default, new-user, live-match, offline, api-down, update-available, post-match, dispatch, dispatch-specials, unelevated, unelevated-game-admin, recovery-missing, recovery-running, recovery-paused, recovery-limit, recovery-gc-off, recovery-replays, recovery-game-open, recovery-replay-run)',
        );
        expect(() => scenarioFactory("toString")).toThrow('[demo] unknown scenario "toString"');
    });
});

describe("scenario selection", () => {
    it("prefers the hook a test set before load, then the query, then the build value", () => {
        expect(selectScenarioId({ hook: "a", query: "b", env: "c" })).toBe("a");
        expect(selectScenarioId({ hook: undefined, query: "b", env: "c" })).toBe("b");
        expect(selectScenarioId({ hook: undefined, query: null, env: "c" })).toBe("c");
    });

    it("reads a plain on switch as the default scenario", () => {
        expect(selectScenarioId({ env: "1" })).toBe("default");
        expect(selectScenarioId({ env: "true" })).toBe("default");
        expect(selectScenarioId({ env: "live-match" })).toBe("live-match");
    });

    it("skips an empty hook or query", () => {
        expect(selectScenarioId({ hook: "", query: "", env: "1" })).toBe("default");
    });
});
