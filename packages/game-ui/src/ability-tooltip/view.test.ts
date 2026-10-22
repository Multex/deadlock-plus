import { describe, expect, it } from "vitest";
import { gameColors } from "../colors";
import { panoramaAlpha } from "../panorama";
import { abilityNameSize, abilityTooltipVars, upgradeArt, upgradeCardClasses, upgradeCardStyle } from "./view";

const commonOffWhite = "#f3f0e7";
// The typical colours of the `ability_upgrade_rect_*` arts the card text sits on.
const DEFAULT_ART = "#131313";
const CANT_AFFORD_ART = "#191213";
const AVAILABLE_ART = "#f8fdff";
const opacity = (alpha: number, color: string, under: string) =>
    String(Math.round(panoramaAlpha(alpha, color, under) * 1000) / 1000);

describe("upgradeArt", () => {
    it("picks the card body art by state, as the game's classes do", () => {
        expect(upgradeArt("cantAfford")).toBe("ability_upgrade_rect_cant_afford");
        expect(upgradeArt("available")).toBe("ability_upgrade_rect_available");
        expect(upgradeArt("notTrained")).toBe("ability_upgrade_rect_default");
        expect(upgradeArt("has")).toBe("ability_upgrade_rect_default");
    });
});

describe("upgradeCardStyle", () => {
    const style = (state: Parameters<typeof upgradeCardClasses>[0]) => upgradeCardStyle(upgradeCardClasses(state));

    it("draws a trained card on offBlack with a green strip, the check and full-strength offWhite text", () => {
        expect(style("has")).toEqual({
            art: "ability_upgrade_rect_default",
            body: gameColors.offBlack,
            strip: gameColors.deadlockGreenDarker,
            bolt: { art: "ability_upgrade_check", wash: gameColors.fortitudeBright, size: 20 },
            cost: null,
            bonus: { color: gameColors.offWhite, opacity: "1" },
            desc: { color: gameColors.offWhite, opacity: "1" },
        });
    });

    it("writes offBlack on the light available art", () => {
        expect(style("available")).toEqual({
            art: "ability_upgrade_rect_available",
            body: null,
            strip: gameColors.offBlack,
            bolt: { art: "ability_point", wash: gameColors.deadlockGreen, size: 16 },
            cost: gameColors.offWhite,
            bonus: { color: gameColors.offBlack, opacity: "1" },
            desc: { color: gameColors.offBlack, opacity: opacity(0.6, gameColors.offBlack, AVAILABLE_ART) },
        });
    });

    it("paints an unaffordable card dark red with a colorEnemy bolt and cost", () => {
        expect(style("cantAfford")).toEqual({
            art: "ability_upgrade_rect_cant_afford",
            body: "#5a2020",
            strip: gameColors.offBlack,
            bolt: { art: "ability_point", wash: gameColors.enemy, size: 16 },
            cost: gameColors.enemy,
            bonus: { color: commonOffWhite, opacity: opacity(0.5, commonOffWhite, CANT_AFFORD_ART) },
            desc: { color: commonOffWhite, opacity: opacity(0.5, commonOffWhite, CANT_AFFORD_ART) },
        });
    });

    it("keeps an untrained card's offWhite text, the description at .6", () => {
        expect(style("notTrained")).toEqual({
            art: "ability_upgrade_rect_default",
            body: null,
            strip: gameColors.offBlack,
            bolt: { art: "ability_point", wash: gameColors.deadlockGreen, size: 16 },
            cost: gameColors.offWhite,
            bonus: { color: gameColors.offWhite, opacity: "1" },
            desc: { color: gameColors.offWhite, opacity: opacity(0.6, gameColors.offWhite, DEFAULT_ART) },
        });
    });

    it("lets the more specific abilityNotTrained.cantAffordUpgrade rule put back the default art only", () => {
        const s = upgradeCardStyle(["abilityNotTrained", "cantAffordUpgrade"]);
        expect(s.art).toBe("ability_upgrade_rect_default");
        expect(s.body).toBe("#5a2020");
        expect(s.bolt.wash).toBe(gameColors.enemy);
        expect(s.cost).toBe(gameColors.enemy);
        expect(s.desc).toEqual({ color: commonOffWhite, opacity: opacity(0.5, commonOffWhite, DEFAULT_ART) });
    });

    it("lets a later rule of equal weight win: abilityNotTrained over UpgradeAvailable, offWhite on its dark art", () => {
        const s = upgradeCardStyle(["UpgradeAvailable", "abilityNotTrained"]);
        expect(s.art).toBe("ability_upgrade_rect_default");
        expect(s.bonus.color).toBe(gameColors.offWhite);
    });

    it("keeps the qualified cantAfford wash over the trained check's wash", () => {
        const s = upgradeCardStyle(["hasUpgrade", "cantAffordUpgrade"]);
        expect(s.bolt).toEqual({ art: "ability_upgrade_check", wash: gameColors.enemy, size: 20 });
        expect(s.cost).toBeNull();
        expect(s.desc.opacity).toBe(opacity(0.5, commonOffWhite, CANT_AFFORD_ART));
    });
});

describe("abilityTooltipVars", () => {
    it("keeps the ability tooltip's plain colours", () => {
        const vars = abilityTooltipVars();
        expect(vars["--at-description"]).toBe("#c6c6c6");
        expect(vars["--at-tech"]).toBe("#00ddff");
        expect(vars["--at-weapon"]).toBe("#ff9900");
        expect(vars["--at-special"]).toBe("#e9a34e");
    });

    // The panel beside each element in the Lightning Ball capture, and the element drawn over it.
    it.each([
        ["--at-chip", "#161616", "#2e2e2e"],
        ["--at-cell", "#121212", "#36332d"],
        ["--at-cell", "#171717", "#383530"],
    ] as const)("draws %s over %s as the game does", (name, under, game) => {
        expect(distance(over(abilityTooltipVars()[name], under), game)).toBeLessThanOrEqual(4);
    });
});

describe("abilityNameSize", () => {
    it("keeps 36 for a name that fits 370 and shrinks a longer one", () => {
        expect(abilityNameSize("Lightning Ball")).toBe(36);
        expect(abilityNameSize("An Exceedingly Long Ability Name Indeed")).toBeLessThan(36);
    });
});

function rgb(hex: string): number[] {
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function distance(a: string, b: string): number {
    const [x, y] = [rgb(a), rgb(b)];
    return Math.max(...x.map((v, i) => Math.abs(v - y[i])));
}

/** The browser's own blend of `rgb(r g b / a)` over an opaque colour. */
function over(css: string, under: string): string {
    const m = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/.exec(css);
    if (!m) throw new Error(`not translucent: ${css}`);
    const a = Number(m[4]);
    const u = rgb(under);
    return (
        "#" +
        [m[1], m[2], m[3]]
            .map((v, i) =>
                Math.round(a * Number(v) + (1 - a) * u[i])
                    .toString(16)
                    .padStart(2, "0"),
            )
            .join("")
    );
}
