import { describe, expect, it } from "vitest";
import { pickerCells, pickerTarget, tabStop } from "./position-picker";

const VALUES = ["tl", "tc", "tr", "l", "r", "bl", "bc", "br"];

describe("pickerCells", () => {
    it("lays eight options out row by row around the reserved middle cell", () => {
        expect(pickerCells(VALUES)).toEqual([
            { kind: "option", option: "tl", index: 0 },
            { kind: "option", option: "tc", index: 1 },
            { kind: "option", option: "tr", index: 2 },
            { kind: "option", option: "l", index: 3 },
            { kind: "center" },
            { kind: "option", option: "r", index: 4 },
            { kind: "option", option: "bl", index: 5 },
            { kind: "option", option: "bc", index: 6 },
            { kind: "option", option: "br", index: 7 },
        ]);
    });

    it("refuses any count other than eight, since the grid is always 3x3", () => {
        expect(() => pickerCells(VALUES.slice(0, 7))).toThrow();
        expect(() => pickerCells([...VALUES, "x"])).toThrow();
    });
});

describe("pickerTarget", () => {
    it("steps over the middle cell in reading order", () => {
        expect(pickerTarget("ArrowRight", VALUES, "l")).toBe(4);
        expect(pickerTarget("ArrowLeft", VALUES, "r")).toBe(3);
    });

    it("wraps at both ends", () => {
        expect(pickerTarget("ArrowDown", VALUES, "br")).toBe(0);
        expect(pickerTarget("ArrowUp", VALUES, "tl")).toBe(7);
    });

    it("jumps to the ends with Home and End", () => {
        expect(pickerTarget("Home", VALUES, "r")).toBe(0);
        expect(pickerTarget("End", VALUES, "r")).toBe(7);
    });

    it("starts from the first option when the value is not one of them", () => {
        expect(pickerTarget("ArrowRight", VALUES, "nowhere")).toBe(1);
    });

    it("ignores other keys", () => {
        expect(pickerTarget("Tab", VALUES, "tl")).toBeNull();
        expect(pickerTarget("Enter", VALUES, "tl")).toBeNull();
    });
});

describe("tabStop", () => {
    it("is the selected option", () => {
        expect(tabStop(VALUES, "bc")).toBe(6);
    });

    it("falls back to the first option so the group can still be reached by Tab", () => {
        expect(tabStop(VALUES, "nowhere")).toBe(0);
    });
});
