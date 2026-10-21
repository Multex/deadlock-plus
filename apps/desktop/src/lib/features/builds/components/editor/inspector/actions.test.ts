import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { describe, expect, it } from "vitest";
import { fitEverywhere } from "../../../editor/row-ops";
import { compactAll, parseCount, setTagSlot } from "./actions";

function cat(items: number, width: number | null = 900, height: number | null = 600): ModCategoryView {
    return {
        mods: Array.from({ length: items }, (_, i) => ({
            abilityId: i + 1,
            annotation: null,
            requiredFlexSlots: null,
            sellPriority: null,
            imbueTargetAbilityId: null,
        })),
        name: "",
        description: "",
        width,
        height,
        optional: false,
    };
}

function build(...modCategories: ModCategoryView[]): BuildView {
    return {
        heroBuildId: 5,
        heroId: 7,
        authorAccountId: 1,
        lastUpdatedTimestamp: null,
        name: "B",
        description: "",
        language: 0,
        version: 1,
        originBuildId: null,
        modCategories,
        abilityOrder: [],
        tags: [],
        developmentBuild: false,
        publishTimestamp: null,
        favorited: false,
    };
}

describe("compactAll", () => {
    it("fits every category to its items", () => {
        const before = build(cat(2), cat(0, null, null), cat(9));
        const after = compactAll(before);
        after.modCategories.forEach((category, i) => {
            const fit = fitEverywhere(before.modCategories[i]!.mods.length);
            expect([category.width, category.height]).toEqual([fit.width, fit.height]);
        });
        expect(before.modCategories[0]!.width).toBe(900);
        expect(after.modCategories[0]).toMatchObject({ width: 181, height: 169 });
    });

    it("hands back the same build when nothing changes, so it costs no undo step", () => {
        const fitted = compactAll(build(cat(3), cat(5)));
        expect(compactAll(fitted)).toBe(fitted);
        const empty = build();
        expect(compactAll(empty)).toBe(empty);
    });
});

describe("setTagSlot", () => {
    it("fills a slot past the stored tags, padding the gap with empty slots", () => {
        expect(setTagSlot([], 2, 44)).toEqual([0, 0, 44]);
        expect(setTagSlot([11], 1, 44)).toEqual([11, 44]);
    });

    it("replaces and clears a slot in place", () => {
        expect(setTagSlot([11, 22, 33], 1, 44)).toEqual([11, 44, 33]);
        expect(setTagSlot([11, 22, 33], 0, 0)).toEqual([0, 22, 33]);
    });

    it("moves a tag already in another slot instead of keeping it twice", () => {
        expect(setTagSlot([11, 22, 33], 2, 11)).toEqual([0, 22, 11]);
    });

    it("ignores a slot the build page does not have", () => {
        const tags = [11];
        expect(setTagSlot(tags, 3, 44)).toBe(tags);
        expect(setTagSlot(tags, -1, 44)).toBe(tags);
    });
});

describe("parseCount", () => {
    it("reads blank as cleared and a whole number as itself", () => {
        expect(parseCount("  ")).toBeNull();
        expect(parseCount(" 3 ")).toBe(3);
        expect(parseCount("4294967295")).toBe(4294967295);
    });

    it("rejects what the file's uint32 cannot hold", () => {
        expect(parseCount("-1")).toBeUndefined();
        expect(parseCount("1.5")).toBeUndefined();
        expect(parseCount("abc")).toBeUndefined();
        expect(parseCount("4294967296")).toBeUndefined();
    });
});
