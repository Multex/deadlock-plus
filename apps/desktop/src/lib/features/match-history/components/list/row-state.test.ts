import { describe, expect, it } from "vitest";
import { rowStateBadge, showGrade } from "./row-state";

describe("rowStateBadge", () => {
    it("maps missing to No details", () => {
        expect(rowStateBadge("missing")).toEqual({ labelKey: "match_history.row_state.missing", variant: "outline" });
    });
    it("maps recovering to Recovering", () => {
        expect(rowStateBadge("recovering")).toEqual({
            labelKey: "match_history.row_state.recovering",
            variant: "secondary",
        });
    });
    it("has no badge without a state", () => {
        expect(rowStateBadge(null)).toBeNull();
    });
});

describe("showGrade", () => {
    it("hides the grade while a state badge shows", () => {
        expect(showGrade({ a: "A" }, "missing")).toBe(false);
        expect(showGrade({ a: "A" }, "recovering")).toBe(false);
    });
    it("shows the grade otherwise", () => {
        expect(showGrade({ a: "A" }, null)).toBe(true);
        expect(showGrade(undefined, null)).toBe(false);
    });
});
