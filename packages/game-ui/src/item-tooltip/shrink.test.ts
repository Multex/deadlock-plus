import { afterEach, describe, expect, it, vi } from "vitest";
import { shrinkToFit } from "./shrink";

type FakeLabel = { style: { fontSize: string }; clientWidth: number; scrollWidth: number };

// A label whose text is `natural` px wide at the 21.33 px base size (16 at 1440p), in a box `width` wide.
function label(natural: number, width: number): FakeLabel {
    const node: FakeLabel = { style: { fontSize: "" }, clientWidth: width, scrollWidth: 0 };
    Object.defineProperty(node, "scrollWidth", {
        get: () => {
            const size = node.style.fontSize ? parseFloat(node.style.fontSize) : BASE;
            return Math.max(width, Math.ceil((natural * size) / BASE));
        },
    });
    return node;
}

const BASE = 21.33;

describe("shrinkToFit", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("shrinks a name too wide for its box until it fits, instead of cutting it", () => {
        vi.stubGlobal("getComputedStyle", () => ({ fontSize: `${BASE}px` }));
        const node = label(276, 227);
        shrinkToFit(node as unknown as HTMLElement, "Max Weapon Damage Stolen");
        const size = parseFloat(node.style.fontSize);
        expect(size).toBeLessThan(BASE);
        expect((276 * size) / BASE).toBeLessThanOrEqual(227);
        expect((276 * (size + 0.25)) / BASE).toBeGreaterThan(227);
    });

    it("leaves a name that fits at the base size", () => {
        vi.stubGlobal("getComputedStyle", () => ({ fontSize: `${BASE}px` }));
        const node = label(213, 227);
        shrinkToFit(node as unknown as HTMLElement, "Max Health per second");
        expect(node.style.fontSize).toBe("");
    });

    it("fits again from the base size when the text changes", () => {
        vi.stubGlobal("getComputedStyle", () => ({ fontSize: `${BASE}px` }));
        const node = label(276, 227);
        const action = shrinkToFit(node as unknown as HTMLElement, "Max Weapon Damage Stolen");
        Object.defineProperty(node, "scrollWidth", { get: () => 227 });
        action.update("Damage");
        expect(node.style.fontSize).toBe("");
    });
});
