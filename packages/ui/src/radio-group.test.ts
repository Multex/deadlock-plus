import { describe, expect, it } from "vitest";
import { radioTarget } from "./radio-group";

describe("radioTarget", () => {
    it("moves forward with the right and down arrows and wraps", () => {
        expect(radioTarget("ArrowRight", 0, 4)).toBe(1);
        expect(radioTarget("ArrowDown", 2, 4)).toBe(3);
        expect(radioTarget("ArrowRight", 3, 4)).toBe(0);
    });

    it("moves back with the left and up arrows and wraps", () => {
        expect(radioTarget("ArrowLeft", 2, 4)).toBe(1);
        expect(radioTarget("ArrowUp", 0, 4)).toBe(3);
    });

    it("jumps to the ends with Home and End", () => {
        expect(radioTarget("Home", 2, 4)).toBe(0);
        expect(radioTarget("End", 1, 4)).toBe(3);
    });

    it("ignores other keys", () => {
        expect(radioTarget("Tab", 1, 4)).toBeNull();
        expect(radioTarget("a", 1, 4)).toBeNull();
    });
});
