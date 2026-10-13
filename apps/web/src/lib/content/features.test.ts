import { describe, expect, it } from "vitest";
import { FEATURES, GROUPS, HERO_DETAIL_SHOT, HERO_SHOT, HIGHLIGHTS, featuresIn, highlights } from "./features";

const SERVED = Object.keys(import.meta.glob("../../../static/screenshots/*.webp")).map((path) =>
    path.slice(path.lastIndexOf("/") + 1, -".webp".length),
);

describe("features", () => {
    it("gives every feature a unique id, usable as a page anchor", () => {
        const ids = FEATURES.map((f) => f.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(id).toMatch(/^[a-z][a-z-]*$/);
    });

    it("puts every feature in a listed group, and leaves no group empty", () => {
        const groups = GROUPS.map((g) => g.id);
        for (const feature of FEATURES) expect(groups).toContain(feature.group);
        for (const group of groups) expect(featuresIn(group).length).toBeGreaterThan(0);
    });

    it("points every screenshot at a file the site serves", () => {
        const shots = [HERO_SHOT, ...FEATURES.flatMap((f) => (f.shot ? [f.shot] : []))];
        expect(shots.length).toBeGreaterThan(1);
        for (const shot of shots) expect(SERVED).toContain(shot);
    });

    it("points every detail crop at a file the site serves, beside a full screenshot", () => {
        const crops = [HERO_DETAIL_SHOT, ...FEATURES.flatMap((f) => (f.detailShot ? [f.detailShot] : []))];
        expect(crops.length).toBeGreaterThan(1);
        for (const crop of crops) expect(SERVED).toContain(crop);
        for (const feature of FEATURES) if (feature.detailShot) expect(feature.shot, feature.id).toBeTruthy();
    });

    it("gives every landing page highlight a screenshot", () => {
        for (const feature of highlights()) expect(feature.shot, feature.id).toBeTruthy();
    });

    it("leads the feature list and the highlights with Discord Rich Presence", () => {
        expect(FEATURES.at(0)?.id).toBe("discord-presence");
        expect(HIGHLIGHTS[0]).toBe("discord-presence");
        expect(featuresIn("match").at(0)?.id).toBe("discord-presence");
        expect(GROUPS.at(0)?.id).toBe("match");
    });

    it("resolves every landing page highlight to a feature", () => {
        expect(highlights().map((f) => f.id)).toEqual([...HIGHLIGHTS]);
    });
});
