import { describe, expect, it } from "vitest";
import type { EditionView } from "./edition-view";
import { CARD_SIZES } from "./edition-view";
import { frontExportTarget, inlineSvgStyles, SVG_INLINE_PROPS } from "./front-export";

const viewOf = (kind: EditionView["kind"]) => ({ id: `${kind}-2026-10-05`, kind }) as EditionView;

describe("frontExportTarget", () => {
    it.each([
        ["weekly", 720, 1080],
        ["monthly", 720, 936],
        ["collectors", 720, 1080],
        ["year_end", 600, 900],
    ] as const)("exports the %s front page at its own cover size", (kind, width, height) => {
        const target = frontExportTarget(viewOf(kind), "front_page", "9:16");
        expect([target.width, target.height]).toEqual([width, height]);
        expect(target.aspect).toBeNull();
        expect(target.fileName).toBe(`deadlock-plus-dispatch-${kind.replace("_", "-")}-2026-10-05-front-page.png`);
    });

    it("keeps section cards at their aspect size", () => {
        const target = frontExportTarget(viewOf("year_end"), "numbers", "1:1");
        expect([target.width, target.height]).toEqual([CARD_SIZES["1:1"].width, CARD_SIZES["1:1"].height]);
    });
});

describe("inlineSvgStyles", () => {
    type Fake = { tag: string; style: Map<string, string> };
    const el = (tag: string): Fake => ({ tag, style: new Map() });
    const root = (els: Fake[]) => ({
        querySelectorAll: (sel: string) => (sel === "svg *" ? els : []),
    });
    const asRoot = (r: ReturnType<typeof root>) => r as unknown as ParentNode;
    const styleOf = (f: Fake) => ({ setProperty: (k: string, v: string) => f.style.set(k, v) });

    it("copies each SVG descendant's computed paint and type onto the matching copy", () => {
        const live = [el("text"), el("line")];
        const copy = [el("text"), el("line")];
        const computed = new Map<Fake, Record<string, string>>([
            [live[0], { fill: "rgb(241, 214, 136)", "text-transform": "uppercase", "font-family": '"Retail Demo"' }],
            [live[1], { stroke: 'url("#c1-ring")', "stroke-width": "2.4px" }],
        ]);
        inlineSvgStyles(asRoot(root(live)), asRoot(root(copy)), {
            read: (e) => ({ getPropertyValue: (p: string) => computed.get(e as unknown as Fake)?.[p] ?? "" }),
            style: (e) => styleOf(e as unknown as Fake),
        });
        expect(Object.fromEntries(copy[0].style)).toEqual({
            fill: "rgb(241, 214, 136)",
            "text-transform": "uppercase",
            "font-family": '"Retail Demo"',
        });
        expect(Object.fromEntries(copy[1].style)).toEqual({ stroke: 'url("#c1-ring")', "stroke-width": "2.4px" });
    });

    it("covers the properties a text-on-path medal needs", () => {
        for (const p of ["fill", "stroke", "font-family", "font-size", "font-weight", "letter-spacing", "text-transform"])
            expect(SVG_INLINE_PROPS).toContain(p);
    });
});
