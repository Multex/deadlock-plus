import { describe, expect, it } from "vitest";
import { BUFF_TINT, BUFF_TYPES, buffIconSvg, skullIconSvg } from "./map-icons";

describe("bridge buff icons", () => {
    it("tints each buff type with the game's colour", () => {
        expect(BUFF_TINT).toEqual({
            gun: "#FFCC80",
            survival: "#D7FF9A",
            casting: "#E1A6FF",
            movement: "#99FFDD",
        });
    });

    it("has a distinct icon per type, in the game's 33 by 32 box", () => {
        const markup = BUFF_TYPES.map((t) => buffIconSvg(t));
        expect(new Set(markup).size).toBe(4);
        for (const m of markup) {
            expect(m).toContain('viewBox="0 0 33 32"');
            expect(m).toContain("<path");
        }
    });

    it("maps the green buff Survival to the health icon", () => {
        expect(buffIconSvg("survival")).toContain("M9.63138 1.55093");
        expect(buffIconSvg("movement")).not.toContain("M9.63138 1.55093");
    });

    it("paints every path with the tint, keeping the game's partial opacity", () => {
        const svg = buffIconSvg("gun", "#123456");
        expect(svg).toContain('fill="#123456"');
        expect(svg).toContain('fill-opacity="0.53"');
        expect(svg).not.toContain('fill="white"');
        expect(buffIconSvg("gun")).toContain(`fill="${BUFF_TINT.gun}"`);
    });

    it("rejects a tint that could break out of the attribute", () => {
        expect(buffIconSvg("gun", '"><script>')).toContain(`fill="${BUFF_TINT.gun}"`);
    });
});

describe("skull icon", () => {
    it("is the game's 24 by 26 skull without the drop-shadow filter", () => {
        const svg = skullIconSvg("#fff");
        expect(svg).toContain('viewBox="0 0 24 26"');
        expect(svg).toContain('fill="#fff"');
        expect(svg).not.toContain("filter");
    });
});
