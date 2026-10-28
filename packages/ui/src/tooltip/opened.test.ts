import { describe, expect, it } from "vitest";
import { openedOnce } from "./opened";

describe("openedOnce", () => {
    it("stays false while the tooltip has never opened", () => {
        const opened = openedOnce();
        expect(opened(false)).toBe(false);
        expect(opened(false)).toBe(false);
    });

    it("turns true on the first open and stays true after closing", () => {
        const opened = openedOnce();
        expect(opened(true)).toBe(true);
        expect(opened(false)).toBe(true);
        expect(opened(false)).toBe(true);
    });

    it("keeps each tooltip's history apart", () => {
        const a = openedOnce();
        const b = openedOnce();
        a(true);
        expect(b(false)).toBe(false);
    });
});
