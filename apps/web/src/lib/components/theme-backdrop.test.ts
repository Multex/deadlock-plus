import { describe, expect, it, vi } from "vitest";

import { mirrorReducedMotion, whenIdle } from "./theme-backdrop";

describe("whenIdle", () => {
    it("waits for the browser to be idle, with a deadline so a busy page still gets there", () => {
        const run = vi.fn();
        let idle: (() => void) | undefined;
        const win = {
            requestIdleCallback: vi.fn((cb: () => void, options?: { timeout?: number }) => {
                idle = cb;
                expect(options?.timeout).toBeGreaterThan(0);
                return 7;
            }),
            cancelIdleCallback: vi.fn(),
            setTimeout: vi.fn(),
            clearTimeout: vi.fn(),
        };

        const cancel = whenIdle(win, run);
        expect(run).not.toHaveBeenCalled();
        idle?.();
        expect(run).toHaveBeenCalledOnce();

        cancel();
        expect(win.cancelIdleCallback).toHaveBeenCalledWith(7);
        expect(win.setTimeout).not.toHaveBeenCalled();
    });

    it("falls back to a timer where the browser has no idle callback", () => {
        const run = vi.fn();
        let later: (() => void) | undefined;
        const win = {
            setTimeout: vi.fn((cb: () => void) => {
                later = cb;
                return 3;
            }),
            clearTimeout: vi.fn(),
        };

        const cancel = whenIdle(win, run);
        later?.();
        expect(run).toHaveBeenCalledOnce();

        cancel();
        expect(win.clearTimeout).toHaveBeenCalledWith(3);
    });
});

describe("mirrorReducedMotion", () => {
    function setup(matches: boolean) {
        const attrs = new Set<string>();
        const root = {
            toggleAttribute: (name: string, on: boolean) => void (on ? attrs.add(name) : attrs.delete(name)),
        };
        let listener: ((e: { matches: boolean }) => void) | undefined;
        const query = {
            matches,
            addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => (listener = cb),
            removeEventListener: vi.fn(),
        };
        return { attrs, root, query, change: (on: boolean) => listener?.({ matches: on }) };
    }

    it("stills the decor while the visitor asks for reduced motion, and follows a change", () => {
        const { attrs, root, query, change } = setup(true);

        const stop = mirrorReducedMotion(root, query);
        expect(attrs.has("data-reduced-motion")).toBe(true);

        change(false);
        expect(attrs.has("data-reduced-motion")).toBe(false);

        stop();
        expect(query.removeEventListener).toHaveBeenCalled();
    });

    it("leaves motion on otherwise", () => {
        const { attrs, root, query } = setup(false);

        mirrorReducedMotion(root, query);

        expect(attrs.has("data-reduced-motion")).toBe(false);
    });
});
