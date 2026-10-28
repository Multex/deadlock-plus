import { describe, expect, it, vi } from "vitest";

import { prefersReducedMotion, smoothScroll } from "./reduced-motion";

const root = (marked: boolean) => ({ hasAttribute: (name: string) => marked && name === "data-reduced-motion" });

describe("reduced motion", () => {
    it("follows the mark the shell puts on the root", () => {
        expect(prefersReducedMotion(root(true))).toBe(true);
        expect(prefersReducedMotion(root(false))).toBe(false);
    });

    it("scrolls smoothly only when motion is allowed", () => {
        expect(smoothScroll(root(false))).toBe("smooth");
        expect(smoothScroll(root(true))).toBe("auto");
    });
});

describe("reduced motion in components", () => {
    it("ignores the OS query when the shell has not marked the root", () => {
        vi.stubGlobal("matchMedia", () => ({ matches: true }));
        expect(prefersReducedMotion(root(false))).toBe(false);
        vi.unstubAllGlobals();
    });

    it("no feature script reads the OS query itself, so the motion setting always wins", () => {
        const sources = import.meta.glob("../features/**/*.svelte", { query: "?raw", import: "default", eager: true });
        const offenders = Object.entries(sources)
            .filter(([, src]) =>
                (src as string).replace(/<style[\s\S]*?<\/style>/g, "").includes("prefers-reduced-motion"),
            )
            .map(([path]) => path);
        expect(offenders).toEqual([]);
    });
});
