import { describe, expect, it } from "vitest";
import { BUFF_TINT, BUFF_TYPES, buffIconSvg, skullIconSvg, teleporterIconSvg } from "./map-icons";

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

    it("paints its one path with the tint and nothing else", () => {
        const svg = skullIconSvg("#241a14");
        expect(svg.match(/<path/g)).toHaveLength(1);
        expect(svg).toContain('" fill="#241a14"/></svg>');
        expect(svg).not.toContain("stroke");
    });
});

describe("teleporter icon", () => {
    const svg = teleporterIconSvg();

    it("is the game's 24 by 24 icon without the clip groups", () => {
        expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">')).toBe(true);
        expect(svg).not.toContain("clip-path");
        expect(svg).not.toContain("<defs");
    });

    it("draws the dark disc with its ring first, in the game's own colours", () => {
        expect(svg).toContain(
            '<path d="M12 0.5A11.5 11.5 0 1 1 12 23.5A11.5 11.5 0 1 1 12 0.5Z" fill="#212621" stroke="#998E7A"/>',
        );
        expect(svg.indexOf('fill="#212621"')).toBeLessThan(svg.indexOf('fill="#998E7A"'));
        expect(svg.match(/stroke=/g)).toHaveLength(1);
    });

    it("draws the three speed lines and the running figure in the ring colour", () => {
        for (const d of ["M5 7H9V8H5Z", "M3 11H9V12H3Z", "M5 15H9V16H5Z"]) {
            expect(svg).toContain(`<path d="${d}" fill="#998E7A"/>`);
        }
        expect(svg).toContain('<path fill-rule="evenodd" clip-rule="evenodd" d="M11 2H12V6.12487L12.0041 6.1726C');
        expect(svg).toContain('13.6891 4.85623 13.6856 5.95522Z" fill="#998E7A"/></svg>');
        expect(svg.match(/<path/g)).toHaveLength(5);
        expect(svg.match(/fill="#998E7A"/g)).toHaveLength(4);
    });
});
