import { describe, expect, it } from "vitest";

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
