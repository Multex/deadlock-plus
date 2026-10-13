import { describe, expect, it } from "vitest";
import { formatPlaytime } from "./stats";

describe("formatPlaytime", () => {
    it("shows hours and minutes", () => {
        expect(formatPlaytime(0)).toBe("0m");
        expect(formatPlaytime(59 * 60)).toBe("59m");
        expect(formatPlaytime(3600 + 5 * 60)).toBe("1h 5m");
        expect(formatPlaytime(100 * 3600)).toBe("100h 0m");
    });
});
