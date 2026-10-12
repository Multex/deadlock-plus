import { describe, expect, it } from "vitest";
import { runItems } from "./compare-items";

describe("runItems", () => {
    const runs = [
        { id: "b", label: "After", savedAt: 2000 },
        { id: "a", label: "Before", savedAt: 1000 },
    ];

    it("puts the empty choice first, then the runs in the given order with their date as meta", () => {
        expect(runItems(runs, "Pick a run", (at) => `d${at}`)).toEqual([
            { value: "", label: "Pick a run" },
            { value: "b", label: "After", meta: "d2000" },
            { value: "a", label: "Before", meta: "d1000" },
        ]);
    });

    it("still offers the empty choice with no runs", () => {
        expect(runItems([], "Pick a run", String)).toEqual([{ value: "", label: "Pick a run" }]);
    });
});
