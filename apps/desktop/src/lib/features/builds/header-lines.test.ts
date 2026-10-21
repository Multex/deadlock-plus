import { describe, expect, it } from "vitest";
import { nameLines, nameRoom } from "./header-lines.svelte";
import { fitSize } from "./shop-view";

/** Every character is 10 game units wide, a space too. */
const fixed = (text: string) => text.length * 10;

describe("nameRoom", () => {
    it("is the stored width less the borders, the name's margins and the room kept for the controls", () => {
        expect(nameRoom(264)).toBe(244);
    });

    it("uses the Fit width for a category stored without one", () => {
        expect(nameRoom(null, 2)).toBe(nameRoom(fitSize(2).width));
    });
});

describe("nameLines", () => {
    it("is one line when the name fits", () => {
        expect(nameLines("Lane", 100, fixed)).toBe(1);
    });

    it("wraps at spaces the way the header does", () => {
        // "pick one" = 80, "after it" = 80: two lines of 80 in a 90-wide room.
        expect(nameLines("pick one after it", 90, fixed)).toBe(2);
        expect(nameLines("pick one after it", 170, fixed)).toBe(1);
    });

    it("breaks a word longer than the room", () => {
        expect(nameLines("abcdefghijkl", 50, fixed)).toBe(3);
    });

    it("counts an empty name as one line", () => {
        expect(nameLines("", 50, fixed)).toBe(1);
    });

    it("gives the same answer whatever scale it is drawn at", () => {
        const scaled = (s: number) => (text: string) => fixed(text) * s;
        expect(nameLines("pick one after it", 90 * 0.5, scaled(0.5))).toBe(2);
        expect(nameLines("pick one after it", 90 * 2, scaled(2))).toBe(2);
    });
});
