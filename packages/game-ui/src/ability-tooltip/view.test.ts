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

    // The between-charges chip keeps the panel's #ffffff05 and adds its container's #ffffff03 on top, so it
    // comes out lighter than the charges chip beside it (Lightning Ball capture: #383838 next to #2e2e2e).
    it("layers the between-charges chip over the chip backer", () => {
        const vars = abilityTooltipVars();
        const chip = over(vars["--at-chip"], "#161616");
        expect(distance(over(vars["--at-chip-between"], chip), "#383838")).toBeLessThanOrEqual(4);
    });

    // `gradient( radial, 50% 50%, 0% 0%, 100% 100%, ...)`: the radii are the panel's full width and height, so a
    // corner sits at 0.71 of the way.
    it.each(["--at-spirit-fill", "--at-weapon-fill", "--at-boon-fill"])("sizes %s to the panel", (name) => {
        expect(abilityTooltipVars()[name]).toMatch(/^radial-gradient\(100% 100% at 50% 50% in srgb-linear, /);
    });

    // Panorama mixes a gradient in linear light. The Lightning Ball capture's spirit cell: #261634 at 0.42 of the
    // radius, #2a1939 at 0.5, #2f1c3f at 0.7.
    it.each([
        [0.42, "#261634"],
        [0.5, "#2a1939"],
        [0.7, "#2f1c3f"],
    ])("draws the spirit cell fill at %s as the game does", (t, game) => {
        const stops = /in srgb-linear, (#[0-9a-f]{6}), (#[0-9a-f]{6})\)$/.exec(
            abilityTooltipVars()["--at-spirit-fill"],
        );
        expect(stops).not.toBeNull();
        expect(distance(mixLinear(stops![1], stops![2], t), game)).toBeLessThanOrEqual(4);
    });

    // Panorama draws a border over the panel's own background: the capture's spirit cell border is #52326b on
    // its #2b1b39 side.
    it("draws the spirit cell border over the cell's fill", () => {
        expect(distance(over(abilityTooltipVars()["--at-spirit-border"], "#2b1b39"), "#52326b")).toBeLessThanOrEqual(4);
    });
});

describe("abilityNameSize", () => {
    it("keeps 36 for a name that fits 370 and shrinks a longer one", () => {
        expect(abilityNameSize("Lightning Ball")).toBe(36);
        expect(abilityNameSize("An Exceedingly Long Ability Name Indeed")).toBeLessThan(36);
    });
});

/** What the browser draws for a two-stop `in srgb-linear` gradient at `t`. */
function mixLinear(from: string, to: string, t: number): string {
    const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
    const enc = (l: number) => 255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055);
    const [a, b] = [rgb(from), rgb(to)];
    return (
        "#" +
        a
            .map((v, i) =>
                Math.round(enc((1 - t) * lin(v) + t * lin(b[i])))
                    .toString(16)
                    .padStart(2, "0"),
            )
            .join("")
    );
}

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
