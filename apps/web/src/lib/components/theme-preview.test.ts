import { describe, expect, it } from "vitest";
import { pickLive } from "./theme-preview";

describe("pickLive", () => {
    it("runs the preview most in view", () => {
        expect(
            pickLive(
                new Map([
                    ["a", 0.3],
                    ["b", 0.9],
                    ["c", 0.6],
                ]),
                null,
            ),
        ).toBe("b");
    });

    it("runs none while every preview is mostly off screen", () => {
        expect(pickLive(new Map([["a", 0.2]]), null)).toBeNull();
        expect(pickLive(new Map(), "a")).toBeNull();
    });

    it("keeps the running preview when another is only as far in view", () => {
        const ratios = new Map([
            ["a", 1],
            ["b", 1],
        ]);
        expect(pickLive(ratios, "b")).toBe("b");
        expect(pickLive(ratios, null)).toBe("a");
    });

    it("hands over once the running preview has left the screen", () => {
        expect(
            pickLive(
                new Map([
                    ["a", 0],
                    ["b", 0.5],
                ]),
                "a",
            ),
        ).toBe("b");
    });
});
