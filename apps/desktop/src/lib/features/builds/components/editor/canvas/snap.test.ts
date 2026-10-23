import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SNAP_KEY, freeResize, loadSnap, saveSnap } from "./snap";

describe("freeResize", () => {
    it("snaps while Snap is on, and Alt frees one drag", () => {
        expect(freeResize(true, false)).toBe(false);
        expect(freeResize(true, true)).toBe(true);
    });

    it("is free while Snap is off, and Alt snaps one drag", () => {
        expect(freeResize(false, false)).toBe(true);
        expect(freeResize(false, true)).toBe(false);
    });
});

describe("loadSnap and saveSnap", () => {
    let data: Map<string, string>;

    beforeEach(() => {
        data = new Map();
        vi.stubGlobal("localStorage", {
            getItem: (k: string) => data.get(k) ?? null,
            setItem: (k: string, v: string) => void data.set(k, v),
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("is on by default", () => {
        expect(loadSnap()).toBe(true);
    });

    it("remembers the viewer's choice", () => {
        saveSnap(false);
        expect(loadSnap()).toBe(false);
        saveSnap(true);
        expect(loadSnap()).toBe(true);
    });

    it("ignores a stored value it did not write", () => {
        data.set(SNAP_KEY, "maybe");
        expect(loadSnap()).toBe(true);
    });

    it("works without storage", () => {
        const blocked = () => {
            throw new Error("blocked");
        };
        vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked });
        expect(() => saveSnap(false)).not.toThrow();
        expect(loadSnap()).toBe(true);
    });
});
