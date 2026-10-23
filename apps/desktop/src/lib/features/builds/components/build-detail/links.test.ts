import { describe, expect, it } from "vitest";
import { buildlockerBuildId } from "./links";

const published = { heroBuildId: 836523 };
const localOnly = { heroBuildId: 12 };

describe("buildlockerBuildId", () => {
    it("is the id of a public build", () => {
        expect(buildlockerBuildId({ draft: null, local: null, build: published })).toBe(836523);
    });

    it("is the id of a local copy of a published build", () => {
        expect(buildlockerBuildId({ draft: null, local: { section: "SavedLastUsed" }, build: published })).toBe(836523);
        expect(buildlockerBuildId({ draft: null, local: { section: "Favorites" }, build: published })).toBe(836523);
    });

    it("is null for a build that only lives in the game's file", () => {
        expect(buildlockerBuildId({ draft: null, local: { section: "SavedLastUsed" }, build: localOnly })).toBeNull();
        expect(buildlockerBuildId({ draft: null, local: { section: "Unpublished" }, build: published })).toBeNull();
    });

    it("is null for a draft, even of a published build", () => {
        expect(buildlockerBuildId({ draft: {}, local: null, build: published })).toBeNull();
    });

    it("is null before the build loads", () => {
        expect(buildlockerBuildId({ draft: null, local: null, build: null })).toBeNull();
    });
});
