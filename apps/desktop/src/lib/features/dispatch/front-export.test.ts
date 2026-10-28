import { describe, expect, it } from "vitest";
import { inlineSvgStyles, SVG_INLINE_PROPS } from "./front-export";

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
        for (const p of [
            "fill",
            "stroke",
            "font-family",
            "font-size",
            "font-weight",
            "letter-spacing",
            "text-transform",
        ])
            expect(SVG_INLINE_PROPS).toContain(p);
    });
});
