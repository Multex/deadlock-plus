import { describe, expect, it } from "vitest";
import { panoramaColor } from "../panorama";
import { abilityNameSize, abilityTooltipVars, upgradeArt } from "./view";

describe("upgradeArt", () => {
    it("picks the card body art by state, as the game's classes do", () => {
        expect(upgradeArt("cantAfford")).toBe("ability_upgrade_rect_cant_afford");
        expect(upgradeArt("available")).toBe("ability_upgrade_rect_available");
        expect(upgradeArt("notTrained")).toBe("ability_upgrade_rect_default");
        expect(upgradeArt("has")).toBe("ability_upgrade_rect_default");
    });
});

describe("abilityTooltipVars", () => {
    it("draws the ability tooltip's own colours, Panorama alphas through the alpha rule", () => {
        const vars = abilityTooltipVars();
        expect(vars["--at-description"]).toBe("#c6c6c6");
        expect(vars["--at-tech"]).toBe("#00ddff");
        expect(vars["--at-weapon"]).toBe("#ff9900");
        expect(vars["--at-special"]).toBe("#e9a34e");
        expect(vars["--at-cell"]).toBe(panoramaColor("offWhite&08"));
        expect(vars["--at-spirit-border"]).toBe(panoramaColor("spirit&40"));
        expect(vars["--at-diminish"]).toBe(panoramaColor("#bfbbb050"));
    });
});

describe("abilityNameSize", () => {
    it("keeps 36 for a name that fits 370 and shrinks a longer one", () => {
        expect(abilityNameSize("Lightning Ball")).toBe(36);
        expect(abilityNameSize("An Exceedingly Long Ability Name Indeed")).toBeLessThan(36);
    });
});
