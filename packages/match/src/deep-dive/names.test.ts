import { describe, expect, it } from "vitest";
import { humaniseClassName, objectiveNames } from "./names";

const ids = (...objectiveIds: number[]) => objectiveIds.map((objectiveId) => ({ objectiveId }));

describe("objective names", () => {
    it("names each enum family and numbers lanes by the lanes the match has", () => {
        // A real match: lanes 1, 3 and 4 exist, lane 2 never does.
        const names = objectiveNames(ids(0, 1, 3, 4, 5, 7, 8, 9, 10, 11, 12, 14, 15));
        expect(names).toEqual([
            { kind: "core" },
            { kind: "guardian", lane: 1 },
            { kind: "guardian", lane: 2 },
            { kind: "guardian", lane: 3 },
            { kind: "walker", lane: 1 },
            { kind: "walker", lane: 2 },
            { kind: "walker", lane: 3 },
            { kind: "patron" },
            { kind: "shrine", index: 1 },
            { kind: "shrine", index: 2 },
            { kind: "base_guardian", lane: 1 },
            { kind: "base_guardian", lane: 2 },
            { kind: "base_guardian", lane: 3 },
        ]);
    });

    it("gives the same lane the same number on every tier", () => {
        const [guardian, walker, base] = objectiveNames(ids(4, 8, 15));
        expect(guardian).toEqual({ kind: "guardian", lane: 1 });
        expect(walker).toEqual({ kind: "walker", lane: 1 });
        expect(base).toEqual({ kind: "base_guardian", lane: 1 });
    });

    it("never shows a raw id for a value outside the enum", () => {
        expect(objectiveNames(ids(16, 99))).toEqual([{ kind: "unknown" }, { kind: "unknown" }]);
    });
});

describe("class name fallback", () => {
    it("turns an internal class name into words", () => {
        expect(humaniseClassName("ability_baba_hexing_brew_throw")).toBe("Baba Hexing Brew Throw");
        expect(humaniseClassName("citadel_ability_jump_ratking")).toBe("Jump Ratking");
        expect(humaniseClassName("upgrade_clip_size")).toBe("Clip Size");
    });
});
