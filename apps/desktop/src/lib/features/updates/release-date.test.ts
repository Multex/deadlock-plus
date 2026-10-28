import { describe, expect, it } from "vitest";
import { releaseDay } from "./release-date";

describe("releaseDay", () => {
    it("reads a changelog date as that calendar day in local time", () => {
        const day = releaseDay("2025-03-09")!;
        expect([day.getFullYear(), day.getMonth(), day.getDate()]).toEqual([2025, 2, 9]);
    });

    it("has no day for a missing or malformed date", () => {
        expect(releaseDay(null)).toBeNull();
        expect(releaseDay("soon")).toBeNull();
    });
});
