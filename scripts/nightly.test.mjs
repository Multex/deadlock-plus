import { describe, expect, it } from "vitest";
import {
    compareVersions,
    latestNightly,
    nightliesToPrune,
    nightlyVersion,
    planOutputs,
    withPackageVersion,
} from "./nightly.mjs";

const DATE = new Date("2026-10-28T03:17:00Z");

describe("compareVersions", () => {
    it("orders by semver precedence", () => {
        const order = [
            "0.14.0",
            "0.14.1-nightly.20261028",
            "0.15.0-beta.1",
            "0.15.0-beta.2",
            "0.15.0-beta.10",
            "0.15.0-nightly.20261029",
            "0.15.0-nightly.20261029.2",
            "0.15.0",
            "0.15.1-nightly.20261101",
            "1.0.0",
        ];
        for (let i = 1; i < order.length; i++) {
            expect(compareVersions(order[i - 1], order[i]), `${order[i - 1]} < ${order[i]}`).toBeLessThan(0);
            expect(compareVersions(order[i], order[i - 1])).toBeGreaterThan(0);
        }
        expect(compareVersions("v0.15.0", "0.15.0")).toBe(0);
    });
});

describe("nightlyVersion", () => {
    it("takes the patch after the last release when no beta is open", () => {
        expect(nightlyVersion({ packageVersion: "0.14.0", tags: ["v0.14.0", "v0.13.0"], date: DATE })).toBe(
            "0.14.1-nightly.20261028",
        );
    });

    it("joins the release a beta is already testing, so it sorts above that beta", () => {
        const tags = ["v0.14.0", "v0.15.0-beta.1", "v0.15.0-beta.2"];
        expect(nightlyVersion({ packageVersion: "0.14.0", tags, date: DATE })).toBe("0.15.0-nightly.20261028");
    });

    it("uses the version main already carries for an unreleased beta", () => {
        expect(nightlyVersion({ packageVersion: "0.15.0-beta.1", tags: [], date: DATE })).toBe(
            "0.15.0-nightly.20261028",
        );
    });

    it("ignores betas of a version that is already out", () => {
        const tags = ["v0.14.0-beta.3", "v0.14.0"];
        expect(nightlyVersion({ packageVersion: "0.14.0", tags, date: DATE })).toBe("0.14.1-nightly.20261028");
    });

    it("never goes below the last nightly", () => {
        const tags = ["v0.14.0", "v0.15.0-nightly.20261027"];
        expect(nightlyVersion({ packageVersion: "0.14.0", tags, date: DATE })).toBe("0.15.0-nightly.20261028");
    });

    it("numbers a second nightly on the same day", () => {
        const tags = ["v0.14.0", "v0.14.1-nightly.20261028", "v0.14.1-nightly.20261028.2"];
        expect(nightlyVersion({ packageVersion: "0.14.0", tags, date: DATE })).toBe("0.14.1-nightly.20261028.3");
    });
});

describe("latestNightly", () => {
    it("picks the newest nightly tag by version", () => {
        const tags = ["v0.15.0", "v0.14.1-nightly.20261030", "v0.15.0-nightly.20261027", "beta-feed"];
        expect(latestNightly(tags)).toBe("v0.15.0-nightly.20261027");
        expect(latestNightly(["v0.14.0"])).toBeNull();
    });
});

describe("nightliesToPrune", () => {
    it("keeps the newest nightlies and lists the rest, leaving every other tag alone", () => {
        const nightlies = Array.from({ length: 9 }, (_, i) => `v0.15.0-nightly.202610${10 + i}`);
        const tags = ["v0.14.0", "v0.15.0-beta.1", "nightly-feed", ...nightlies.toReversed()];
        expect(nightliesToPrune(tags, 7)).toEqual(["v0.15.0-nightly.20261011", "v0.15.0-nightly.20261010"]);
        expect(nightliesToPrune(tags, 20)).toEqual([]);
    });
});

describe("withPackageVersion", () => {
    it("replaces only the package's own version field", () => {
        const json =
            '{\n  "name": "deadlock-plus",\n  "version": "0.14.0",\n  "dependencies": {\n    "x": "0.14.0"\n  }\n}\n';
        expect(withPackageVersion(json, "0.14.1-nightly.20261028")).toBe(
            json.replace('"version": "0.14.0"', '"version": "0.14.1-nightly.20261028"'),
        );
    });
});

describe("planOutputs", () => {
    const nightlies = Array.from({ length: 8 }, (_, i) => `v0.14.1-nightly.2026101${i}`);
    const base = { packageVersion: "0.14.0", tags: ["v0.14.0", ...nightlies], date: DATE, keep: 7 };
    const lines = (out) =>
        Object.fromEntries(
            out
                .trimEnd()
                .split("\n")
                .map((line) => line.split("=")),
        );

    it("skips when main is still at the last nightly's commit", () => {
        const out = lines(planOutputs({ ...base, head: "abc", lastNightlyCommit: "abc", force: false }));
        expect(out.skip).toBe("true");
    });

    it("builds when main moved, and names the version and tag", () => {
        const out = lines(planOutputs({ ...base, head: "def", lastNightlyCommit: "abc", force: false }));
        expect(out).toMatchObject({
            skip: "false",
            version: "0.14.1-nightly.20261028",
            tag: "v0.14.1-nightly.20261028",
        });
    });

    it("builds on request even when main has not moved", () => {
        const out = lines(planOutputs({ ...base, head: "abc", lastNightlyCommit: "abc", force: true }));
        expect(out.skip).toBe("false");
    });

    it("builds the first nightly ever, with nothing to delete", () => {
        const out = lines(
            planOutputs({ ...base, tags: ["v0.14.0"], head: "abc", lastNightlyCommit: null, force: false }),
        );
        expect(out.skip).toBe("false");
        expect(out.prune).toBe("");
    });

    it("lists the old nightlies to delete so the new one makes the kept count", () => {
        const out = lines(planOutputs({ ...base, head: "def", lastNightlyCommit: "abc", force: false }));
        expect(out.prune).toBe("v0.14.1-nightly.20261011 v0.14.1-nightly.20261010");
    });
});
