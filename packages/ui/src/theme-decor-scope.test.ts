import { describe, expect, it } from "vitest";

import { decorScope } from "./theme-decor-scope";

const element = (scrollTop = 0) => ({ scrollTop }) as HTMLElement;

describe("decorScope", () => {
    it("reads the page from the nearest data-decor-scope, scrolled with the window", () => {
        const scope = element(5);
        const main = element(300);
        let asked = "";
        const canvas = {
            closest: (selector: string) => {
                asked = selector;
                return scope;
            },
        };

        const found = decorScope(canvas, { querySelector: () => main }, { scrollY: 120 });

        expect(asked).toBe("[data-decor-scope]");
        expect(found.root).toBe(scope);
        expect(found.scrollTop()).toBe(125);
    });

    it("falls back to the app's scrolling main panel outside a scope", () => {
        const main = element(300);

        const found = decorScope({ closest: () => null }, { querySelector: () => main }, { scrollY: 120 });

        expect(found.root).toBe(main);
        expect(found.scrollTop()).toBe(300);
    });

    it("finds nothing on a page with neither", () => {
        const found = decorScope({ closest: () => null }, { querySelector: () => null }, { scrollY: 0 });

        expect(found.root).toBeNull();
        expect(found.scrollTop()).toBe(0);
    });
});
