import { describe, expect, it } from "vitest";
import { DOT_SIZE, RELATION_DISC, playerDotStyle, skullDataUri, type PlayerDotInput } from "./player-dot";

const base: PlayerDotInput = {
    team: "hidden-king",
    alive: true,
    own: false,
    ownTeam: "hidden-king",
    heroArt: "hero.png",
    markerArt: "self.png",
    coneArt: "cone.png",
};

describe("playerDotStyle", () => {
    it("fills the dot with a relation-coloured disc", () => {
        const ally = playerDotStyle(base);
        expect(ally.discColor).toBe("#FFEFD7");
        expect(ally.discScale).toBe(1);
        expect(ally.discOpacity).toBe(0.9);
        expect(ally.borderPx).toBeGreaterThan(0);
        expect(playerDotStyle({ ...base, team: "archmother" }).discColor).toBe("#FF410D");
        expect(RELATION_DISC).toEqual({ ally: "#FFEFD7", enemy: "#FF410D" });
    });

    it("colours by the viewer's team, not the match team", () => {
        const viewer = { ...base, ownTeam: "archmother" as const };
        expect(playerDotStyle({ ...viewer, team: "archmother" }).discColor).toBe("#FFEFD7");
        expect(playerDotStyle({ ...viewer, team: "hidden-king" }).discColor).toBe("#FF410D");
    });

    it("treats the Hidden King as ally when the viewer is not in the match", () => {
        const away = { ...base, ownTeam: null };
        expect(playerDotStyle({ ...away, team: "hidden-king" }).discColor).toBe("#FFEFD7");
        expect(playerDotStyle({ ...away, team: "archmother" }).discColor).toBe("#FF410D");
    });

    it("draws the hero head at 60% of the dot, 70% for the local player", () => {
        expect(playerDotStyle(base).head).toEqual({ src: "hero.png", scale: 0.6 });
        expect(playerDotStyle({ ...base, own: true }).head).toEqual({ src: "hero.png", scale: 0.7 });
    });

    it("shows the eye marker and view cone only for the local player", () => {
        expect(playerDotStyle(base).marker).toBeNull();
        expect(playerDotStyle(base).cone).toBeNull();
        const own = playerDotStyle({ ...base, own: true, coneArt: "cone.png" });
        expect(own.marker?.src).toBe("self.png");
        expect(own.cone?.src).toBe("cone.png");
        expect(playerDotStyle({ ...base, own: true, markerArt: null, coneArt: null }).marker).toBeNull();
        expect(playerDotStyle({ ...base, own: true, markerArt: null, coneArt: null }).cone).toBeNull();
    });

    it("swaps the head for a skull and dims the disc when dead", () => {
        const dead = playerDotStyle({ ...base, alive: false });
        expect(dead.head).toBeNull();
        expect(dead.skull).not.toBeNull();
        expect(dead.discOpacity).toBe(0.6);
        expect(dead.marker).toBeNull();
        expect(dead.cone).toBeNull();
        expect(playerDotStyle(base).skull).toBeNull();
    });

    it("keeps a plain disc for the living when there is no hero art", () => {
        const s = playerDotStyle({ ...base, heroArt: null, markerArt: null, own: true });
        expect(s.head).toBeNull();
        expect(s.marker).toBeNull();
        expect(s.skull).toBeNull();
        expect(s.discColor).toBe("#FFEFD7");
    });

    it("keeps the skull on a dimmed disc for the dead when there is no hero art", () => {
        const s = playerDotStyle({ ...base, alive: false, heroArt: null });
        expect(s.skull).not.toBeNull();
        expect(s.discOpacity).toBe(0.6);
    });

    it("orders dead below enemy below friendly below local", () => {
        const dead = playerDotStyle({ ...base, alive: false, own: true }).zIndex;
        const enemy = playerDotStyle({ ...base, team: "archmother" }).zIndex;
        const friend = playerDotStyle(base).zIndex;
        const own = playerDotStyle({ ...base, own: true }).zIndex;
        expect(dead).toBeLessThan(enemy);
        expect(enemy).toBeLessThan(friend);
        expect(friend).toBeLessThan(own);
    });

    it("sizes the icon as a fraction of the map side", () => {
        expect(playerDotStyle(base).size).toBe(DOT_SIZE);
    });
});

describe("skullDataUri", () => {
    it("is an svg data uri", () => {
        expect(skullDataUri()).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    });
});
